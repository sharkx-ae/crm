import { and, asc, eq } from 'drizzle-orm';
import type { Tx } from '../../lib/tenant/index.ts';
import { users } from '../auth/schema.ts';
import { projects } from '../projects/schema.ts';

// Round-robin among active managers, across all clients (F4a S3). Each client keeps its own cursor (the manager who
// got its last lead); the next lead goes to the next active manager after the cursor, wrapping around. Client users,
// the super admin and disabled or invited managers are never picked. The caller holds the client's row lock.

export async function nextManager(tx: Tx, projectId: string): Promise<string | null> {
  const managers = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'manager'), eq(users.status, 'active')))
    .orderBy(asc(users.createdAt), asc(users.id));
  if (managers.length === 0) return null;

  const [project] = await tx
    .select({ cursor: projects.assignCursor })
    .from(projects)
    .where(eq(projects.id, projectId));
  const at = managers.findIndex((m) => m.id === project?.cursor);
  // Unknown or removed cursor (at = -1) starts again from the first manager.
  const next = managers[(at + 1) % managers.length]?.id ?? null;

  await tx.update(projects).set({ assignCursor: next }).where(eq(projects.id, projectId));
  return next;
}
