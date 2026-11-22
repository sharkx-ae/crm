// The only way application code talks to the database (ARCHITECTURE §4).
// Each call is ONE transaction that switches to a restricted role and sets transaction-local
// context, so RLS applies and nothing leaks to the next user of a pooled connection.
import { sql } from 'drizzle-orm';
import { type ChangeKind, type Role, role } from '../../contracts/common.ts';
import { getDb, type Tx } from '../../db/index.ts';
import { changeFeed } from './schema.ts';

export type { Tx };

/** Web requests: staff (super_admin, manager) see every project; a client only its own, and only tables its `client_access` allows. */
export function withTenant<T>(
  actor: { userId: string; role: Role },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql.raw('set local role app_user'));
    await tx.execute(
      sql`select set_config('app.user_id', ${actor.userId}, true), set_config('app.role', ${role.parse(actor.role)}, true)`,
    );
    return fn(tx);
  });
}

/**
 * Worker, webhooks, auth: sees exactly one project.
 * `null` = no project: only non-tenant tables, plus listing project rows (for cron loops).
 */
export function withSystem<T>(projectId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql.raw('set local role app_system'));
    await tx.execute(sql`select set_config('app.project_id', ${projectId ?? ''}, true)`);
    return fn(tx);
  });
}

/** Adds a row to the polling feed inside the caller's transaction (CONTRACTS §4). */
export async function emitChange(
  tx: Tx,
  kind: ChangeKind,
  projectId: string,
  refId: string,
): Promise<void> {
  await tx.insert(changeFeed).values({ projectId, kind, refId });
}
