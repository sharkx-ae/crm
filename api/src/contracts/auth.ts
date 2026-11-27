import { z } from 'zod';
import { email, iso, locale, opaqueToken, password, role, userStatus } from './common.ts';
import { session } from './session.ts';

// F1c request/response shapes (plan §2.3). Passwords are never returned; tokens only in the session responses.
export const userKind = z.enum(['manager', 'client']);

export const meResponse = session.extend({ name: z.string(), email });

export const loginRequest = z.object({ email, password: z.string().min(1).max(128) });
export const pendingSessionResponse = z.object({
  stage: z.literal('pending_2fa'),
  sessionToken: opaqueToken,
  expiresAt: iso,
  maskedEmail: z.string(),
});
// `trustDevice`: the person ticked "Don't ask for a code on this device for 30 days" (spec F1c-remember-device).
export const verifyCodeRequest = z.object({
  code: z.string().regex(/^\d{6}$/),
  trustDevice: z.boolean().default(false),
});
export const activeSessionResponse = z.object({
  stage: z.literal('active'),
  sessionToken: opaqueToken,
  expiresAt: iso,
  me: meResponse,
  // Only when this response creates or renews a trusted device: web sets or refreshes the device cookie from them.
  deviceToken: opaqueToken.optional(),
  deviceExpiresAt: iso.optional(),
});
// A sign-in answers with the code step, or (a trusted device, password correct) straight with the active session.
export const loginResponse = z.discriminatedUnion('stage', [
  pendingSessionResponse,
  activeSessionResponse,
]);
export const codeSentResponse = z.object({ maskedEmail: z.string(), expiresAt: iso });
export const updateMeRequest = z.object({ locale });

export const resetRequest = z.object({ email });
export const resetConfirmRequest = z.object({ token: opaqueToken, password });

export const tokenRequest = z.object({ token: opaqueToken });
export const inviteInfoResponse = z.object({
  kind: userKind,
  name: z.string(),
  maskedEmail: z.string(),
  inviterName: z.string().nullable(),
  projectName: z.string().nullable(),
});
export const acceptInviteRequest = z.object({ token: opaqueToken, password });

const name = z.string().trim().min(1).max(120);
export const inviteRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manager'), email, name }),
  z.object({ kind: z.literal('client'), email, name, projectId: z.uuid() }),
]);
export const userSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  email,
  role,
  status: userStatus,
  projectId: z.uuid().nullable(),
  createdAt: iso,
});
export const listUsersQuery = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manager') }),
  z.object({ kind: z.literal('client'), projectId: z.uuid() }),
]);
export const listUsersResponse = z.object({ users: z.array(userSummary) });
export const setUserStatusRequest = z.object({ status: z.enum(['active', 'disabled']) });
export const okResponse = z.object({ ok: z.literal(true) });

export type UserKind = z.infer<typeof userKind>;
export type Me = z.infer<typeof meResponse>;
export type LoginRequest = z.infer<typeof loginRequest>;
export type PendingSessionResponse = z.infer<typeof pendingSessionResponse>;
export type LoginResponse = z.infer<typeof loginResponse>;
export type ActiveSessionResponse = z.infer<typeof activeSessionResponse>;
export type CodeSentResponse = z.infer<typeof codeSentResponse>;
export type InviteInfoResponse = z.infer<typeof inviteInfoResponse>;
export type InviteRequest = z.infer<typeof inviteRequest>;
export type UserSummary = z.infer<typeof userSummary>;
export type ListUsersQuery = z.infer<typeof listUsersQuery>;
