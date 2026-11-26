import { z } from 'zod';
import { actorKind, iso, role } from './common.ts';

// F1e interface (plan §2.4). Each module appends its own actions in an additive `contracts:` commit.
export const auditAction = z.string().regex(/^[a-z_]+\.[a-z_]+$/);

export const knownAuditActions = [
  'auth.login',
  'auth.login_failed',
  'auth.code_verified',
  'auth.logout',
  'auth.reset_requested',
  'auth.password_changed',
  'user.invited',
  'user.invite_accepted',
  'user.status_changed',
  'project.created',
  'project.updated',
  'lead.created',
  'lead.merged',
  'lead.status_changed',
  'lead.assigned',
  'lead.exported',
  'form.mapping_saved',
  'integration.connected',
] as const;

export const auditQuery = z.object({
  userId: z.uuid().optional(),
  action: auditAction.optional(),
  projectId: z.uuid().optional(),
  from: iso.optional(),
  to: iso.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const auditEntry = z.object({
  id: z.uuid(),
  at: iso,
  actorKind,
  actorId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  actorRole: role.nullable(),
  projectId: z.uuid().nullable(),
  projectName: z.string().nullable(),
  action: auditAction,
  entity: z.string().nullable(),
  entityId: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()),
});

// Keyset on (at desc, id desc); the cursor is opaque base64url.
export const auditPage = z.object({
  entries: z.array(auditEntry),
  nextCursor: z.string().nullable(),
});

export type AuditQuery = z.infer<typeof auditQuery>;
export type AuditEntry = z.infer<typeof auditEntry>;
export type AuditPage = z.infer<typeof auditPage>;
