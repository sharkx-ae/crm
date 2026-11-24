import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import {
  type IngestLeadInput,
  type IngestLeadResult,
  ingestLeadInput,
} from '../../contracts/functions.ts';
import { AppError, reportError } from '../../lib/errors/index.ts';
import { emitChange, type Tx, withSystem } from '../../lib/tenant/index.ts';
import { audit } from '../audit/index.ts';
import { findOrCreateContact, normaliseEmail } from '../contacts/index.ts';
import { notifyTx } from '../notifications/index.ts';
import { pipelineStages } from '../pipeline/schema.ts';
import { projects } from '../projects/schema.ts';
import { nextManager } from './assign.ts';
import { applyMapping } from './mapping.ts';
import { normalisePhone } from './phone.ts';
import { leadEvents, leadForms, leads, notes } from './schema.ts';

// ingestLead (CONTRACTS §4, F4a S1): every source's payload becomes one deduplicated, mapped, assigned lead.
// One transaction writes the contact, the lead (or the merge event), lead_events, audit_log and change_feed.
// The client's row is locked first, so one client's ingests run one at a time: no duplicate contacts, a fair
// round-robin, and an idempotent replay even when the same webhook arrives twice at once.

export type IngestOutcome = IngestLeadResult & {
  /** Call AFTER the transaction commits: sends the new-lead notifications (a rollback never notifies). */
  afterCommit: () => Promise<void>;
};

const nothing = async () => {};

/** An empty or whitespace-only value means "not sent": it never wins over a mapped answer or reaches a unique key. */
const present = (v: string | undefined): string | undefined => (v?.trim() ? v : undefined);

/** For callers already inside `withSystem(projectId)` (e.g. recordMessage). */
export async function ingestLeadTx(tx: Tx, raw: IngestLeadInput): Promise<IngestOutcome> {
  const parsed = ingestLeadInput.parse(raw);
  const input = {
    ...parsed,
    externalId: present(parsed.externalId),
    formId: present(parsed.formId),
    campaign: present(parsed.campaign),
    name: present(parsed.name),
    phone: present(parsed.phone),
    email: present(parsed.email),
  };
  const { projectId } = input;

  const [project] = await tx
    .select({ id: projects.id, city: projects.city })
    .from(projects)
    .where(eq(projects.id, projectId))
    .for('update');
  if (!project) throw new AppError('NOT_FOUND');

  // 1. Idempotency on (projectId, source, externalId): a lead, or an earlier merge of the same submission.
  if (input.externalId) {
    const [existing] = await tx
      .select({ id: leads.id, contactId: leads.contactId })
      .from(leads)
      .where(
        and(
          eq(leads.projectId, projectId),
          eq(leads.source, input.source),
          eq(leads.externalId, input.externalId),
        ),
      );
    if (existing) {
      return {
        leadId: existing.id,
        contactId: existing.contactId,
        created: false,
        merged: false,
        afterCommit: nothing,
      };
    }
    const [mergedBefore] = await tx
      .select({ leadId: leadEvents.leadId, contactId: leads.contactId })
      .from(leadEvents)
      .innerJoin(leads, eq(leads.id, leadEvents.leadId))
      .where(
        and(
          eq(leadEvents.projectId, projectId),
          // Literal 'merged' so the planner can use the partial index lead_events_merged_external_idx.
          sql`${leadEvents.kind} = 'merged'`,
          sql`${leadEvents.data}->>'source' = ${input.source}`,
          sql`${leadEvents.data}->>'externalId' = ${input.externalId}`,
        ),
      )
      .limit(1);
    if (mergedBefore) {
      return {
        leadId: mergedBefore.leadId,
        contactId: mergedBefore.contactId,
        created: false,
        merged: false,
        afterCommit: nothing,
      };
    }
  }

  // 2. Mapping: the form's saved mapping decides where each question goes; explicit fields win over mapped ones.
  let mapping: Record<string, string> | null = null;
  if (input.formId) {
    const [form] = await tx
      .select({ mapping: leadForms.mapping })
      .from(leadForms)
      .where(and(eq(leadForms.projectId, projectId), eq(leadForms.externalFormId, input.formId)));
    mapping = form?.mapping ?? null;
  }
  const mapped = applyMapping(input.answers, mapping);
  const name = (input.name ?? mapped.name)?.trim() || undefined;
  const phone = normalisePhone(input.phone ?? mapped.phone, project.city);
  const email = normaliseEmail(input.email ?? mapped.email);

  // 3. Contact: E.164 phone, else email; an invalid phone never matches.
  const contact = await findOrCreateContact(tx, projectId, {
    e164: phone?.valid ? phone.e164 : undefined,
    email,
    name,
  });

  // 4. Open lead on that contact (anything not "not qualified") → merge into its timeline. Test and real leads never
  // merge into each other: a real lead hidden inside a test lead would vanish from reports, assignment and the bell.
  const [open] = contact.created
    ? []
    : await tx
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.projectId, projectId),
            eq(leads.contactId, contact.id),
            ne(leads.status, 'not_qualified'),
            eq(leads.isTest, input.isTest ?? false),
          ),
        )
        .orderBy(desc(leads.createdAt))
        .limit(1);

  const eventData = {
    source: input.source,
    ...(input.externalId ? { externalId: input.externalId } : {}),
    ...(input.campaign ? { campaign: input.campaign } : {}),
    ...(input.formId ? { formId: input.formId } : {}),
    ...(phone && !phone.valid ? { phoneInvalid: true, phoneRaw: phone.raw } : {}),
    ...(input.isTest ? { isTest: true } : {}),
  };

  if (open) {
    await tx.insert(leadEvents).values({
      projectId,
      leadId: open.id,
      kind: 'merged',
      data: { ...eventData, answers: mapped.custom },
      actorKind: 'system',
      at: new Date(input.receivedAt),
    });
    await addNotes(tx, projectId, open.id, mapped.notes);
    await audit(tx, {
      actor: { kind: 'system' },
      action: 'lead.merged',
      projectId,
      entity: 'lead',
      entityId: open.id,
      meta: { source: input.source },
    });
    await emitChange(tx, 'lead', projectId, open.id);
    return {
      leadId: open.id,
      contactId: contact.id,
      created: false,
      merged: true,
      afterCommit: nothing,
    };
  }

  // 5. New lead: first pipeline stage; round-robin owner unless it is a test lead.
  const [stage] = await tx
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(eq(pipelineStages.projectId, projectId))
    .orderBy(asc(pipelineStages.position))
    .limit(1);
  const ownerId = input.isTest ? null : await nextManager(tx, projectId);
  const receivedAt = new Date(input.receivedAt);

  const [lead] = await tx
    .insert(leads)
    .values({
      projectId,
      contactId: contact.id,
      source: input.source,
      externalId: input.externalId ?? null,
      formId: input.formId ?? null,
      campaign: input.campaign ?? null,
      answers: mapped.custom,
      attribution: input.attribution ?? {},
      stageId: stage?.id ?? null,
      ownerId,
      isTest: input.isTest ?? false,
      createdAt: receivedAt,
    })
    .returning({ id: leads.id });
  if (!lead) throw new Error('lead insert returned no row');

  await tx.insert(leadEvents).values([
    {
      projectId,
      leadId: lead.id,
      kind: 'created',
      data: eventData,
      actorKind: 'system',
      at: receivedAt,
    },
    ...(ownerId
      ? [
          {
            projectId,
            leadId: lead.id,
            kind: 'assigned',
            data: { ownerId, via: 'round_robin' },
            actorKind: 'system' as const,
            at: receivedAt,
          },
        ]
      : []),
  ]);
  await addNotes(tx, projectId, lead.id, mapped.notes);
  await audit(tx, {
    actor: { kind: 'system' },
    action: 'lead.created',
    projectId,
    entity: 'lead',
    entityId: lead.id,
    meta: { source: input.source, isTest: input.isTest ?? false, assigned: ownerId !== null },
  });
  await emitChange(tx, 'lead', projectId, lead.id);

  const leadId = lead.id;
  return {
    leadId,
    contactId: contact.id,
    created: true,
    merged: false,
    // Test leads never notify (F4a S4); everyone else who works on this client hears about a new lead.
    afterCommit: input.isTest
      ? nothing
      : () =>
          withSystem(projectId, async (ntx) => {
            for (const role of ['manager', 'super_admin', 'client'] as const) {
              await notifyTx(ntx, { projectId, role, kind: 'new_lead', refId: leadId });
            }
          }),
  };
}

async function addNotes(tx: Tx, projectId: string, leadId: string, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  await tx.insert(notes).values({ projectId, leadId, text: lines.join('\n') });
}

/** The entry point for adapters (CONTRACTS §4): its own system transaction, then the notifications. */
export async function ingestLead(input: IngestLeadInput): Promise<IngestLeadResult> {
  const projectId = ingestLeadInput.shape.projectId.parse(input.projectId);
  const { afterCommit, ...result } = await withSystem(projectId, (tx) => ingestLeadTx(tx, input));
  // A failed notification never undoes a stored lead (it is committed and on screen); it is logged and alerted.
  await afterCommit().catch((err: unknown) =>
    reportError({
      source: 'api',
      fingerprint: 'ingestLead:notify',
      message: err instanceof Error ? `${err.name}: ${err.message}` : 'notify failed',
      context: { projectId },
    }),
  );
  return result;
}
