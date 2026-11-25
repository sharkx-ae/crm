import { and, eq } from 'drizzle-orm';
import type { LeadStatus } from '../../contracts/common.ts';
import type { StatusChanged } from '../../contracts/functions.ts';
import type { MarkLeadRequest, MarkLeadResponse } from '../../contracts/leads.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { emitChange, type Tx, withSystem, withTenant } from '../../lib/tenant/index.ts';
import { audit } from '../audit/index.ts';
import { actorOf } from '../auth/index.ts';
import { conversionEvents, conversionMappings } from '../conversion/schema.ts';
import { assertCan } from './access.ts';
import { findLeadRecord } from './detail.ts';
import { projectLead } from './projection.ts';
import { qualificationOf } from './qualification.ts';
import { leadEvents, leads } from './schema.ts';

// changeStatus (CONTRACTS §4, F4b S6): one transaction writes the new status, the lead event, the audit row, one
// pending conversion_events row per enabled mapping and platform, and the change feed. Nothing is enqueued (D9):
// the sender (F11a) picks the pending rows up.

export type By = { kind: 'user' | 'client'; id: string };
export type StatusOutcome =
  | (StatusChanged & { outboxQueued: number; noop: false })
  | { noop: true };

/**
 * Runs inside `withSystem(projectId)`. The lead row is locked first, so two marks of one lead run one at a time.
 * Marking a lead with the status (and reason) it already has changes nothing and writes one audit row with
 * `meta.noop` (F4b §4.1).
 */
export async function changeStatus(
  tx: Tx,
  leadId: string,
  to: Exclude<LeadStatus, 'new'>,
  reason: string | undefined,
  by: By,
): Promise<StatusOutcome> {
  const [lead] = await tx
    .select({
      projectId: leads.projectId,
      status: leads.status,
      reason: leads.reason,
      statusSeq: leads.statusSeq,
    })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.isTest, false)))
    .for('update');
  if (!lead) throw new AppError('NOT_FOUND');
  if (to === 'not_qualified' && !reason) {
    throw new AppError('VALIDATION', {
      details: { issues: [{ path: 'reason', code: 'required' }] },
    });
  }
  const { projectId } = lead;
  const nextReason = to === 'not_qualified' ? (reason ?? null) : null;

  if (lead.status === to && lead.reason === nextReason) {
    await audit(tx, {
      actor: by,
      action: 'lead.status_changed',
      projectId,
      entity: 'lead',
      entityId: leadId,
      meta: { noop: true, to },
    });
    return { noop: true };
  }

  const statusSeq = lead.statusSeq + 1;
  const at = new Date();
  await tx
    .update(leads)
    .set({ status: to, statusSeq, reason: nextReason })
    .where(eq(leads.id, leadId));
  await tx.insert(leadEvents).values({
    projectId,
    leadId,
    kind: 'status_changed',
    data: { from: lead.status, to, ...(nextReason ? { reason: nextReason } : {}) },
    actorKind: by.kind,
    actorId: by.id,
    at,
  });
  await audit(tx, {
    actor: by,
    action: 'lead.status_changed',
    projectId,
    entity: 'lead',
    entityId: leadId,
    // The reason is one of the client's own list; never the lead's name, phone or email.
    meta: { from: lead.status, to, statusSeq, ...(nextReason ? { reason: nextReason } : {}) },
  });

  const [mapping] = await tx
    .select({
      metaEvent: conversionMappings.metaEvent,
      googleEvent: conversionMappings.googleEvent,
    })
    .from(conversionMappings)
    .where(
      and(
        eq(conversionMappings.projectId, projectId),
        eq(conversionMappings.status, to),
        eq(conversionMappings.enabled, true),
      ),
    );
  const platforms = [
    ...(mapping?.metaEvent ? (['meta'] as const) : []),
    ...(mapping?.googleEvent ? (['google'] as const) : []),
  ];
  const queued = platforms.length
    ? await tx
        .insert(conversionEvents)
        .values(
          platforms.map((platform) => ({
            projectId,
            leadId,
            status: to,
            statusSeq,
            platform,
            state: 'pending' as const,
          })),
        )
        // (lead, seq, platform) is unique: a retry of the same change can never queue a second send.
        .onConflictDoNothing()
        .returning({ id: conversionEvents.id })
    : [];
  await emitChange(tx, 'lead', projectId, leadId);

  return {
    noop: false,
    leadId,
    projectId,
    from: lead.status,
    to,
    statusSeq,
    ...(nextReason ? { reason: nextReason } : {}),
    by,
    at: at.toISOString(),
    outboxQueued: queued.length,
  };
}

/**
 * POST /leads/:id/status. The tenant-scoped read is the gate (a client sees only its own client's leads; a test lead
 * is never found). The write then runs as the system for that client, because a client's database role cannot insert
 * lead events or read conversion mappings (ARCHITECTURE §4).
 */
export async function markLead(
  session: ResolvedSession,
  id: string,
  body: MarkLeadRequest,
): Promise<MarkLeadResponse> {
  const { projectId } = body;
  assertCan(session, 'lead.mark', projectId);

  const reason = await withTenant(session, async (tx) => {
    if (!(await findLeadRecord(tx, projectId, id))) throw new AppError('NOT_FOUND');
    if (body.to !== 'not_qualified') return undefined; // a reason on MQL or SQL is dropped
    const { reasons } = await qualificationOf(tx, projectId);
    if (!body.reason || !reasons.includes(body.reason)) {
      throw new AppError('VALIDATION', {
        details: { issues: [{ path: 'reason', code: body.reason ? 'not_in_list' : 'required' }] },
      });
    }
    return body.reason;
  });

  const actor = actorOf(session);
  const by: By = { kind: actor.kind === 'client' ? 'client' : 'user', id: session.userId };
  return withSystem(projectId, async (tx) => {
    const outcome = await changeStatus(tx, id, body.to, reason, by);
    const record = await findLeadRecord(tx, projectId, id);
    if (!record) throw new AppError('NOT_FOUND');
    const one = projectLead(session, record);
    if (!one) throw new AppError('NOT_FOUND');
    return { ...one, outboxQueued: outcome.noop ? 0 : outcome.outboxQueued };
  });
}
