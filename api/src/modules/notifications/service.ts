import { and, eq, inArray } from 'drizzle-orm';
import { type NotifyInput, notifyInput } from '../../contracts/functions.ts';
import { emitChange, type Tx, withSystem } from '../../lib/tenant/index.ts';
import { projectMembers } from '../../lib/tenant/schema.ts';
import { users } from '../auth/schema.ts';
import { notifications } from './schema.ts';

// notify() (CONTRACTS §4, owner John): one in-app notification row per recipient, plus one change-feed row so open
// screens refresh. Recipients are explicit `userIds`, or a role: `manager` = every active manager, `super_admin` =
// the super admin, `client` = the active client users of this client. The bell (F14b) and reminders (F8b) read them.
// `email` is accepted for the contract; sending the email copy arrives with the alert kinds (F14).

async function recipients(tx: Tx, input: NotifyInput): Promise<string[]> {
  if (input.userIds) return [...new Set(input.userIds)];
  if (input.role === 'client') {
    const rows = await tx
      .select({ id: users.id })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(
        and(
          eq(projectMembers.projectId, input.projectId),
          eq(users.role, 'client'),
          eq(users.status, 'active'),
        ),
      );
    return rows.map((r) => r.id);
  }
  const role = input.role === 'super_admin' ? 'super_admin' : 'manager';
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, role), eq(users.status, 'active')));
  return rows.map((r) => r.id);
}

/** Inside the caller's transaction (scoped to `input.projectId`). Returns how many rows were written. */
export async function notifyTx(tx: Tx, raw: NotifyInput): Promise<number> {
  const input = notifyInput.parse(raw);
  const ids = await recipients(tx, input);
  if (ids.length === 0) return 0;
  // A user id that does not exist (stale list) is skipped instead of failing the whole batch.
  const known = await tx.select({ id: users.id }).from(users).where(inArray(users.id, ids));
  if (known.length === 0) return 0;
  await tx.insert(notifications).values(
    known.map((u) => ({
      projectId: input.projectId,
      userId: u.id,
      kind: input.kind,
      refId: input.refId,
    })),
  );
  await emitChange(tx, 'notification', input.projectId, input.refId);
  return known.length;
}

export function notify(input: NotifyInput): Promise<number> {
  return withSystem(input.projectId, (tx) => notifyTx(tx, input));
}
