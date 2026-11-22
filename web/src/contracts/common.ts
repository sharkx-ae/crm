// GENERATED from api/src/contracts by scripts/sync-contracts.mjs. Do not edit; change the source and re-run the script.
import { z } from 'zod';

// CONTRACTS §2 enums, §1 role/locale, §7 error codes, and the id/time/phone notations.
export const source = z.enum([
  'meta',
  'google',
  'youtube',
  'tiktok',
  'linkedin',
  'snapchat',
  'website',
  'whatsapp',
  'csv',
]);
export const leadStatus = z.enum(['new', 'mql', 'sql', 'not_qualified']);
export const healthState = z.enum(['connected', 'needs_attention', 'broken', 'not_connected']);
export const mode = z.enum(['live', 'fixture', 'awaiting']);
export const direction = z.enum(['in', 'out']);
export const origin = z.enum(['customer', 'app', 'history']);
export const msgType = z.enum([
  'text',
  'image',
  'audio',
  'video',
  'document',
  'sticker',
  'location',
  'other',
]);
export const actorKind = z.enum(['user', 'client', 'system']);
export const conversionState = z.enum(['pending', 'sent', 'retrying', 'failed', 'skipped']);
export const changeKind = z.enum(['lead', 'message', 'task', 'health', 'notification']);
export const notificationKind = z.enum([
  'new_lead',
  'new_message',
  'no_reply',
  'task_due',
  'connection_issue',
  'client_marked',
]);
// Roles do not nest (CONTRACTS §1): what each may do lives in session.ts `actionRoles`.
export const role = z.enum(['super_admin', 'manager', 'client']);
export const locale = z.enum(['en', 'ar', 'fr']);
export const userStatus = z.enum(['invited', 'active', 'disabled']);
export const sessionStage = z.enum(['active', 'pending_2fa']);

export const iso = z.iso.datetime();
export const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/);
export const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
// F1c S4 rules: 12+ characters, a letter and a number.
export const password = z
  .string()
  .min(12)
  .max(128)
  .regex(/[A-Za-z]/)
  .regex(/\d/);
// 32 random bytes, base64url.
export const opaqueToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const errorStatus = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  INTEGRATION_ERROR: 502,
  INTERNAL: 500,
} as const;

const errorCodes = Object.keys(errorStatus) as [
  keyof typeof errorStatus,
  ...(keyof typeof errorStatus)[],
];
export const errorCode = z.enum(errorCodes);
// One error shape for every api response.
export const errorBody = z.object({
  error: z.object({
    code: errorCode,
    details: z.record(z.string(), z.unknown()).optional(),
    retryAfterSec: z.number().int().positive().optional(),
  }),
});

export type Source = z.infer<typeof source>;
export type LeadStatus = z.infer<typeof leadStatus>;
export type HealthState = z.infer<typeof healthState>;
export type Role = z.infer<typeof role>;
export type Locale = z.infer<typeof locale>;
export type ChangeKind = z.infer<typeof changeKind>;
export type ErrorCode = keyof typeof errorStatus;
export type ErrorBody = z.infer<typeof errorBody>;
export type UserStatus = z.infer<typeof userStatus>;
export type SessionStage = z.infer<typeof sessionStage>;
