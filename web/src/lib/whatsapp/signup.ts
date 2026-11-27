import { z } from 'zod';
import { metaId, waSignupEvent } from '../../contracts/whatsapp.ts';

// Embedded Signup v5 in the browser (F3a plan §6.1): the pure parts, so they unit-test without a window or the SDK.

/** One constant: v5 selects the session info below; the products come from the Facebook Login for Business configuration. */
export const ES_EXTRAS = { setup: {}, version: 'v5' } as const;

/**
 * Meta's own check is `endsWith('facebook.com')`. We keep its reach (the popup may post from www., web., business. …)
 * but only over https and only for facebook.com itself or a true subdomain, so `evilfacebook.com` and
 * `facebook.com.evil.example` fail. Which host the popup really uses is confirmed in T10.
 */
export function isMetaOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.origin !== origin) return false;
  return url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com');
}

/** True for a message that says it is Embedded Signup's, whatever its origin (used to log a dropped one). */
export function looksLikeSignup(raw: unknown): boolean {
  if (typeof raw === 'string') return raw.includes('WA_EMBEDDED_SIGNUP');
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { type?: unknown }).type === 'WA_EMBEDDED_SIGNUP'
  );
}

/** Both halves must arrive (the code from FB.login, the session info from the message event) within this time. */
export const PAIRING_TIMEOUT_MS = 60_000;

const finishData = z.object({
  messaging_account_ids: z.array(metaId).min(1).max(10),
  phone_number_id: metaId,
  is_on_biz_app: z.boolean(),
});
const finishMessage = z.object({
  type: z.literal('WA_EMBEDDED_SIGNUP'),
  event: waSignupEvent,
  data: finishData,
});
const cancelMessage = z.object({
  type: z.literal('WA_EMBEDDED_SIGNUP'),
  event: z.literal('CANCEL'),
  data: z.object({ current_step: z.string().optional() }).optional(),
});
const errorMessage = z.object({
  type: z.literal('WA_EMBEDDED_SIGNUP'),
  event: z.literal('ERROR'),
  data: z
    .object({
      error_code: z.union([z.number(), z.string()]).optional(),
      error_message: z.string().optional(),
    })
    .optional(),
});

export type FinishSession = {
  event: z.infer<typeof waSignupEvent>;
  messagingAccountIds: string[];
  phoneNumberId: string;
  isOnBizApp: boolean;
};

export type SignupMessage =
  | { kind: 'finish'; session: FinishSession }
  | { kind: 'cancel' }
  | { kind: 'error'; code: string | null; message: string | null }
  /** A WA_EMBEDDED_SIGNUP message whose shape we do not know (v5 is new): shown as an unknown error, never trusted. */
  | { kind: 'unexpected' };

/**
 * Reads a `message` event. Returns null for anything that is not Embedded Signup's (another origin, another type, not
 * JSON): those are ignored without a trace. The browser's values are hints only; the api checks them against the token.
 */
export function parseSignupMessage(origin: string, raw: unknown): SignupMessage | null {
  if (!isMetaOrigin(origin)) return null;
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof data !== 'object' || data === null) return null;
  if ((data as { type?: unknown }).type !== 'WA_EMBEDDED_SIGNUP') return null;

  const finish = finishMessage.safeParse(data);
  if (finish.success) {
    const { event, data: d } = finish.data;
    return {
      kind: 'finish',
      session: {
        event,
        messagingAccountIds: d.messaging_account_ids,
        phoneNumberId: d.phone_number_id,
        isOnBizApp: d.is_on_biz_app,
      },
    };
  }
  if (cancelMessage.safeParse(data).success) return { kind: 'cancel' };
  const err = errorMessage.safeParse(data);
  if (err.success) {
    const code = err.data.data?.error_code;
    return {
      kind: 'error',
      code: code === undefined ? null : String(code),
      message: err.data.data?.error_message ?? null,
    };
  }
  return { kind: 'unexpected' };
}

/** `integrations.whatsapp.signupErrors.<key>`: the plain-words messages (plan §6.4 A), grouped by what to tell the person. */
export type SignupErrorKey =
  | 'appVersion'
  | 'notEligible'
  | 'personal'
  | 'notBusinessApp'
  | 'country'
  | 'limit'
  | 'qrRate'
  | 'qrFailed'
  | 'disconnecting'
  | 'otherProvider'
  | 'notEnabled';

const ERROR_CODES: Record<SignupErrorKey, readonly number[]> = {
  appVersion: [4563015],
  notEligible: [3441077],
  personal: [3441069],
  notBusinessApp: [3441148, 3441130],
  country: [3441042],
  limit: [2388098, 3441110],
  qrRate: [3441151],
  qrFailed: [3441112, 3441113, 3441127],
  disconnecting: [3441093, 3441145],
  otherProvider: [3441091, 3441079, 3441095, 2655093],
  notEnabled: [3441107, 3441126, 2655111],
};

const BY_CODE = new Map<number, SignupErrorKey>(
  (Object.entries(ERROR_CODES) as [SignupErrorKey, readonly number[]][]).flatMap(([key, codes]) =>
    codes.map((c) => [c, key] as const),
  ),
);

/** The message key for a Meta error code, or null for a code we have no wording for (the UI then shows Meta's own text). */
export function signupErrorKey(code: string | number | null): SignupErrorKey | null {
  if (code === null) return null;
  const n = typeof code === 'number' ? code : Number(code);
  return Number.isInteger(n) ? (BY_CODE.get(n) ?? null) : null;
}

export type Pairing = { code?: string; session?: FinishSession };

/** Both halves are in. */
export const pairingReady = (p: Pairing): p is { code: string; session: FinishSession } =>
  typeof p.code === 'string' && p.code !== '' && p.session !== undefined;

/** What the QR path needs from the session: `FINISH` (a new Cloud API number) is refused here and again by the api. */
export const isQrPath = (s: FinishSession): boolean =>
  s.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' && s.isOnBizApp;
