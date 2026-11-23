// GENERATED from api/src/contracts by scripts/sync-contracts.mjs. Do not edit; change the source and re-run the script.
import { z } from 'zod';
import { locale, type Role, role, sessionStage } from './common.ts';

// CONTRACTS §1. Roles do not nest. Staff (super_admin, manager) see every project; a client only its own.
// Invariant (not typed): staff projectIds = [], client projectIds = [its project].
export const session = z.object({
  userId: z.uuid(),
  role,
  projectIds: z.array(z.uuid()),
  locale,
  stage: sessionStage,
});

const ALL = ['super_admin', 'manager', 'client'] as const;
const STAFF = ['super_admin', 'manager'] as const;
const SUPER = ['super_admin'] as const;

export const actionRoles = {
  'project.read': ALL,
  'lead.read': ALL,
  'lead.mark': ALL,
  'lead.export': ALL,
  'chat.read': ALL,
  'report.read': ALL,
  'integration.manage': ALL,
  'contact.read': STAFF,
  'lead.update': STAFF,
  'lead.assign': STAFF,
  'chat.note': STAFF,
  'task.manage': STAFF,
  'pipeline.manage': STAFF,
  'automation.manage': STAFF,
  'conversion.manage': STAFF,
  'qualification.manage': STAFF,
  'project.update': STAFF,
  'clientuser.manage': STAFF,
  'agency.read': STAFF,
  'project.create': SUPER,
  'user.manage': SUPER,
  'audit.read': SUPER,
} as const satisfies Record<string, readonly Role[]>;

export type Session = z.infer<typeof session>;
export type Action = keyof typeof actionRoles;

const actions = Object.keys(actionRoles) as [Action, ...Action[]];
export const action = z.enum(actions);

// Pure, so web (UX: hide, refuse early) and api (enforcement) run the same table.
export function can(
  s: Pick<Session, 'role' | 'projectIds' | 'stage'>,
  a: Action,
  projectId?: string,
): boolean {
  if (s.stage === 'pending_2fa') return false;
  if (!(actionRoles[a] as readonly Role[]).includes(s.role)) return false;
  if (s.role === 'client') return projectId !== undefined && s.projectIds.includes(projectId);
  return true;
}
