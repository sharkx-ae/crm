import { and, asc, eq } from 'drizzle-orm';
import type { AssignLeadRequest, StaffLeadRow } from '../../contracts/leads.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { emitChange, type Tx, withTenant } from '../../lib/tenant/index.ts';
import { audit } from '../audit/index.ts';
import { actorOf } from '../auth/index.ts';
import { users } from '../auth/schema.ts';
import { projects } from '../projects/schema.ts';
import { assertCan } from './access.ts';
import { findLeadRecord } from './detail.ts';
import { projectLead } from './projection.ts';
import { leadEvents, leads } from './schema.ts';

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

/**
 * POST /leads/:id/assign (F4b S3, staff only). The owner must be an active manager; null unassigns. One transaction:
 * the owner, an `assigned` event (data { from, to }), one audit row and the change feed. Assigning the owner it
 * already has changes nothing and writes one audit row marked noop (F4b §4.1). Status is never touched here.
 */
export async function assignLead(
  session: ResolvedSession,
  id: string,
  body: AssignLeadRequest,
): Promise<{ lead: StaffLeadRow }> {
  const { projectId, ownerId } = body;
  assertCan(session, 'lead.assign', projectId);

  return withTenant(session, async (tx) => {
    const [current] = await tx
      .select({ ownerId: leads.ownerId })
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.projectId, projectId), eq(leads.isTest, false)))
      .for('update');
    if (!current) throw new AppError('NOT_FOUND');

    if (ownerId) {
      const [owner] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, ownerId), eq(users.role, 'manager'), eq(users.status, 'active')));
      if (!owner) {
        throw new AppError('VALIDATION', {
          details: { issues: [{ path: 'ownerId', code: 'not_an_active_manager' }] },
        });
      }
    }

    const actor = actorOf(session);
    const entry = { actor, projectId, entity: 'lead', entityId: id };
    if (current.ownerId === ownerId) {
      await audit(tx, { ...entry, action: 'lead.assigned', meta: { noop: true } });
    } else {
      await tx.update(leads).set({ ownerId }).where(eq(leads.id, id));
      await tx.insert(leadEvents).values({
        projectId,
        leadId: id,
        kind: 'assigned',
        data: { from: current.ownerId, to: ownerId },
        actorKind: actor.kind,
        actorId: session.userId,
      });
      await audit(tx, {
        ...entry,
        action: 'lead.assigned',
        meta: { from: current.ownerId, to: ownerId },
      });
      await emitChange(tx, 'lead', projectId, id);
    }

    const record = await findLeadRecord(tx, projectId, id);
    const one = record && projectLead(session, record);
    if (!one || one.view !== 'staff') throw new AppError('NOT_FOUND');
    return { lead: one.lead };
  });
}
