import { z } from 'zod';
import { metaId } from '../../contracts/whatsapp.ts';
import { hmacSha256 } from '../../lib/crypto/index.ts';

// Thin Graph API client over `fetch` (no SDK, no dependency). Only the four calls F3a needs. Rules (plan F3a §4.1, §7.1):
// every call is bounded by a timeout; every call with a user/business token carries `appsecret_proof`; a response is
// parsed with Zod down to the fields we use; an error NEVER carries the token, the app secret, the URL or the body.

export type GraphConfig = { appId: string; appSecret: string; graphVersion: string };

/**
 * `unavailable`: timeout, network failure, 5xx or an unexpected response shape (Meta's problem, worth a retry).
 * `rejected`: Meta answered with a 4xx error body (an expired code, a missing permission...).
 */
export class GraphError extends Error {
  readonly kind: 'unavailable' | 'rejected';
  readonly status: number | null;
  readonly code: number | null;
  readonly subcode: number | null;
  readonly fbtraceId: string | null;

  constructor(
    kind: 'unavailable' | 'rejected',
    f: {
      status?: number | null;
      code?: number | null;
      subcode?: number | null;
      fbtraceId?: string | null;
    } = {},
  ) {
    super(`graph request failed (${kind}${f.status ? ` ${f.status}` : ''})`);
    this.name = 'GraphError';
    this.kind = kind;
    this.status = f.status ?? null;
    this.code = f.code ?? null;
    this.subcode = f.subcode ?? null;
    this.fbtraceId = f.fbtraceId ?? null;
  }
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;
let doFetch: Fetch = (input, init) => fetch(input, init);
/** Tests stub the network with recorded-shape fixtures; `undefined` restores the real `fetch`. */
export function setGraphFetch(f: Fetch | undefined): void {
  doFetch = f ?? ((input, init) => fetch(input, init));
}

export const GRAPH_TIMEOUT_MS = 10_000;
let timeoutMs = GRAPH_TIMEOUT_MS;
/** Tests shorten the timeout; `undefined` restores the default. */
export function setGraphTimeout(ms: number | undefined): void {
  timeoutMs = ms ?? GRAPH_TIMEOUT_MS;
}

const errorBody = z.object({
  error: z.object({
    code: z.number().optional(),
    error_subcode: z.number().optional(),
    fbtrace_id: z.string().optional(),
  }),
});

const base = (c: GraphConfig) => `https://graph.facebook.com/${c.graphVersion}`;

/** `HMAC-SHA256(app secret, access token)` in hex: Meta's proof that a call comes from our server. */
export const appSecretProof = (c: GraphConfig, token: string): string =>
  hmacSha256(c.appSecret, token).toString('hex');

async function call<T extends z.ZodType>(
  schema: T,
  url: string,
  init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string },
): Promise<z.infer<T>> {
  let res: Response;
  try {
    res = await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new GraphError('unavailable'); // timeout or network: no detail (the cause can echo the URL)
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const e = errorBody.safeParse(json);
    const f = {
      status: res.status,
      code: e.success ? (e.data.error.code ?? null) : null,
      subcode: e.success ? (e.data.error.error_subcode ?? null) : null,
      fbtraceId: e.success ? (e.data.error.fbtrace_id ?? null) : null,
    };
    throw new GraphError(res.status >= 500 ? 'unavailable' : 'rejected', f);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new GraphError('unavailable', { status: res.status });
  return parsed.data;
}

/** Calls made with the customer's business token: Bearer + `appsecret_proof` (the "Require app secret" setting is on). */
function withToken(
  c: GraphConfig,
  token: string,
  path: string,
  query: Record<string, string> = {},
): string {
  const q = new URLSearchParams({ ...query, appsecret_proof: appSecretProof(c, token) });
  return `${base(c)}/${path}?${q.toString()}`;
}
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

// ---- 1. code -> business token -----------------------------------------------------------------------------------

const tokenResponse = z.object({ access_token: z.string().min(1) });

/**
 * Meta documents `GET /oauth/access_token?client_id&client_secret&code`. We send the same three parameters as a
 * form-encoded POST so the app secret never sits in a URL. UNVERIFIED against real Meta until the first connect with a
 * test phone (plan T6/T10): if Meta refuses the POST, fall back to the documented GET and keep the URL out of every log.
 */
export async function exchangeCode(c: GraphConfig, code: string): Promise<{ accessToken: string }> {
  const out = await call(tokenResponse, `${base(c)}/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.appId,
      client_secret: c.appSecret,
      code,
    }).toString(),
  });
  return { accessToken: out.access_token };
}

// ---- 2. what is this token allowed to touch ------------------------------------------------------------------------

const debugResponse = z.object({
  data: z.object({
    app_id: z.string(),
    is_valid: z.boolean(),
    expires_at: z.number().optional(),
    granular_scopes: z
      .array(z.object({ scope: z.string(), target_ids: z.array(z.string()).optional() }))
      .optional(),
  }),
});

export type TokenInfo = {
  isValid: boolean;
  appId: string;
  /** null when Meta reports none or 0: the system-user business token normally never expires. */
  expiresAt: Date | null;
  /** The WABA ids the token was granted `whatsapp_business_management` on. The browser's ids are checked against this. */
  wabaIds: string[];
};

/** `GET /debug_token` with the app token (`<app id>|<app secret>`) in the Authorization header, not in the URL. */
export async function debugToken(c: GraphConfig, token: string): Promise<TokenInfo> {
  const url = `${base(c)}/debug_token?${new URLSearchParams({ input_token: token }).toString()}`;
  const out = await call(debugResponse, url, {
    method: 'GET',
    headers: bearer(`${c.appId}|${c.appSecret}`),
  });
  const mgmt = (out.data.granular_scopes ?? []).filter(
    (s) => s.scope === 'whatsapp_business_management',
  );
  const wabaIds = [...new Set(mgmt.flatMap((s) => s.target_ids ?? []))].filter(
    (id) => metaId.safeParse(id).success,
  );
  return {
    isValid: out.data.is_valid,
    appId: out.data.app_id,
    expiresAt: out.data.expires_at ? new Date(out.data.expires_at * 1000) : null,
    wabaIds,
  };
}

// ---- 3. the numbers of a WABA ----------------------------------------------------------------------------------

const phoneNumbersResponse = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      display_phone_number: z.string(),
      verified_name: z.string().optional(),
      is_on_biz_app: z.boolean().optional(),
      platform_type: z.string().optional(),
    }),
  ),
});

export type GraphPhoneNumber = {
  id: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
  isOnBizApp: boolean;
  platformType: string | null;
};

export async function listPhoneNumbers(
  c: GraphConfig,
  token: string,
  wabaId: string,
): Promise<GraphPhoneNumber[]> {
  const url = withToken(c, token, `${encodeURIComponent(wabaId)}/phone_numbers`, {
    fields: 'id,display_phone_number,verified_name,is_on_biz_app,platform_type',
  });
  const out = await call(phoneNumbersResponse, url, { method: 'GET', headers: bearer(token) });
  return out.data.map((n) => ({
    id: n.id,
    displayPhoneNumber: n.display_phone_number,
    verifiedName: n.verified_name ?? null,
    isOnBizApp: n.is_on_biz_app === true,
    platformType: n.platform_type ?? null,
  }));
}

// ---- 4. subscribe our app to the WABA's webhooks ------------------------------------------------------------------

const successResponse = z.object({ success: z.boolean() });

/** `POST /<waba>/subscribed_apps`, no body. Idempotent on Meta's side. A `success: false` answer is a failure. */
export async function subscribeApp(c: GraphConfig, token: string, wabaId: string): Promise<void> {
  const url = withToken(c, token, `${encodeURIComponent(wabaId)}/subscribed_apps`);
  const out = await call(successResponse, url, { method: 'POST', headers: bearer(token) });
  if (!out.success) throw new GraphError('rejected', { status: 200 });
}
