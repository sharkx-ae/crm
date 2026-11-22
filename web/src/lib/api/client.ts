import { randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import type { z } from 'zod';
import { errorBody } from '../../contracts/common.ts';
import { getWebEnv } from '../env.ts';
import { clientIp, sessionCookieName } from '../security.ts';
import { ApiError } from './error.ts';

export { ApiError };

// BFF → backend calls. Server-side only (Server Components, Server Actions, route handlers).
// The browser never calls the api: every call carries the internal token, and the user's session when there is one.

/** Health checks only: the api's /health is public, so no token or session. */
export async function apiFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 3000, ...rest } = init;
  return fetch(new URL(path, getWebEnv().API_URL), {
    ...rest,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export type ApiDeps = {
  apiUrl: string;
  internalToken: string;
  fetch: typeof fetch;
  requestId: string;
  sessionToken?: string;
  ip?: string;
};

export type ApiInit = { method?: string; body?: unknown; timeoutMs?: number };

/** The transport, free of Next so it can be tested: headers, JSON, typed errors. */
export async function callApi<S extends z.ZodType>(
  deps: ApiDeps,
  schema: S,
  path: string,
  init: ApiInit = {},
): Promise<z.infer<S>> {
  const headers: Record<string, string> = {
    'x-internal-token': deps.internalToken,
    'x-request-id': deps.requestId,
  };
  if (deps.sessionToken) headers['x-session-token'] = deps.sessionToken;
  if (deps.ip) headers['x-client-ip'] = deps.ip;
  if (init.body !== undefined) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await deps.fetch(new URL(path, deps.apiUrl), {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
    });
  } catch {
    throw new ApiError('INTERNAL', 502); // api unreachable or timed out
  }

  const json: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const parsed = errorBody.safeParse(json);
    if (!parsed.success) throw new ApiError('INTERNAL', res.status);
    const { code, details, retryAfterSec } = parsed.data.error;
    throw new ApiError(code, res.status, { details, retryAfterSec });
  }
  const out = schema.safeParse(json);
  if (!out.success) throw new ApiError('INTERNAL', 502); // the api broke its own contract
  return out.data;
}

export type ApiCallInit = ApiInit & {
  /** `forward` (default) sends the visitor's session cookie; `none` sends no session. */
  session?: 'forward' | 'none';
  /** A token just received from the api, before it is in a cookie. Wins over `session`. */
  token?: string;
};

/** `callApi` with the environment, the visitor's cookie, address and request id filled in. */
export async function apiCall<S extends z.ZodType>(
  schema: S,
  path: string,
  init: ApiCallInit = {},
): Promise<z.infer<S>> {
  const env = getWebEnv();
  const h = await headers();
  let sessionToken = init.token;
  if (!sessionToken && init.session !== 'none') {
    sessionToken = (await cookies()).get(sessionCookieName(env.APP_ENV))?.value;
  }
  return callApi(
    {
      apiUrl: env.API_URL,
      internalToken: env.INTERNAL_API_TOKEN,
      fetch,
      requestId: h.get('x-request-id') ?? randomUUID(),
      sessionToken,
      ip: clientIp(h),
    },
    schema,
    path,
    init,
  );
}
