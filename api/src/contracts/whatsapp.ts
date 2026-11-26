import { z } from 'zod';
import { e164, iso, waSyncState } from './common.ts';

// F3a (plan §2.2): WhatsApp onboarding by Embedded Signup v5, QR path (Coexistence) only.
// Graph ids are numeric strings.
export const metaId = z.string().regex(/^\d{1,32}$/);

// `FINISH` is a new Cloud API number (no QR); the api refuses it with `qr_only`.
export const waSignupEvent = z.enum(['FINISH', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING']);

// The browser's half of the signup: the code from FB.login plus the v5 session info. Both are hints the server
// re-checks against the token and the WABA's own number list. The project id is in the path.
export const waConnectRequest = z.object({
  code: z.string().min(1).max(2048),
  event: waSignupEvent,
  messagingAccountIds: z.array(metaId).min(1).max(10),
  phoneNumberId: metaId,
  isOnBizApp: z.boolean(),
});

// Client-safe as is: no WABA id, no phone number id, no token data.
export const waNumber = z.object({
  id: z.uuid(),
  phoneE164: e164,
  label: z.string().nullable(),
  syncState: waSyncState,
  syncPct: z.number().int().min(0).max(100),
  onboardedAt: iso,
});

// `ready` is false while Meta is not configured on the api; `limited` is the unverified-business notice.
export const waNumbersResponse = z.object({
  numbers: z.array(waNumber),
  connect: z.object({ ready: z.boolean(), limited: z.boolean() }),
});

// Only the numbers this connect added or refreshed.
export const waConnectResponse = z.object({ numbers: z.array(waNumber) });

export type WaConnectRequest = z.infer<typeof waConnectRequest>;
export type WaNumber = z.infer<typeof waNumber>;
export type WaNumbersResponse = z.infer<typeof waNumbersResponse>;
export type WaConnectResponse = z.infer<typeof waConnectResponse>;
