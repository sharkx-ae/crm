import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { LeadDetail } from '../../contracts/leads.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { type Tx, withTenant } from '../../lib/tenant/index.ts';
import { users } from '../auth/schema.ts';
import { contacts } from '../contacts/schema.ts';
import { waConversations, waMessages } from '../whatsapp/schema.ts';
import { assertCan } from './access.ts';
import {
  leadContactJoin,
  leadOwnerJoin,
  leadRecordColumns,
  toClientLead,
  toStaffLead,
} from './projection.ts';
import { qualificationOf } from './qualification.ts';
import { leadEvents, leads } from './schema.ts';

// GET /leads/:id (F4b S5, S7). Staff get the owner choices, the WhatsApp state and the timeline; the client shape has
// none of them (and RLS would not let a client read lead_events anyway).

const TIMELINE_CAP = 100;

/** One lead of this client with its contact and owner, or null. A test lead is never found. */
export async function findLeadRecord(tx: Tx, projectId: string, id: string) {
  const [record] = await tx
    .select({ ...leadRecordColumns, contactId: leads.contactId })
    .from(leads)
    .innerJoin(contacts, leadContactJoin)
    .leftJoin(users, leadOwnerJoin)
    .where(and(eq(leads.id, id), eq(leads.projectId, projectId), eq(leads.isTest, false)));
  return record ?? null;
}

export async function getLead(
  session: ResolvedSession,
  id: string,
  projectId: string,
): Promise<LeadDetail> {
  assertCan(session, 'lead.read', projectId);

  return withTenant(session, async (tx) => {
    const record = await findLeadRecord(tx, projectId, id);
    if (!record) throw new AppError('NOT_FOUND');
    const qualification = await qualificationOf(tx, projectId);

    if (session.role === 'client') {
      return { view: 'client' as const, lead: toClientLead(record), qualification };
    }
    return {
      view: 'staff' as const,
      lead: toStaffLead(record),
      qualification,
      whatsappState: await whatsappState(tx, projectId, record.contactId),
      owners: await tx
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.role, 'manager'), eq(users.status, 'active')))
        .orderBy(asc(users.name), asc(users.id)),
      timeline: await timeline(tx, projectId, id),
    };
  });
}

/** From the contact's newest message: inbound means nobody has answered yet. No chat (or no message) is 'none'. */
async function whatsappState(
  tx: Tx,
  projectId: string,
  contactId: string,
): Promise<'none' | 'replied' | 'unreplied'> {
  const [last] = await tx
    .select({ direction: waMessages.direction })
    .from(waMessages)
    .innerJoin(waConversations, eq(waConversations.id, waMessages.conversationId))
    .where(and(eq(waConversations.projectId, projectId), eq(waConversations.contactId, contactId)))
    .orderBy(desc(waMessages.ts), desc(waMessages.id))
    .limit(1);
  if (!last) return 'none';
  return last.direction === 'in' ? 'unreplied' : 'replied';
}

/** The owner an "assigned" event points at: `ownerId` from round-robin, `to` from a manual assign. */
const assignedTo = (kind: string, data: Record<string, unknown>): string | null => {
  if (kind !== 'assigned') return null;
  const id = data.ownerId ?? data.to;
  return typeof id === 'string' ? id : null;
};

/** Newest first, ties by id (D6). An "assigned" entry also carries the owner's name, which an id cannot show. */
async function timeline(tx: Tx, projectId: string, leadId: string) {
  const events = await tx
    .select({
      id: leadEvents.id,
      kind: leadEvents.kind,
      data: leadEvents.data,
      actorKind: leadEvents.actorKind,
      actorName: users.name,
      at: leadEvents.at,
    })
    .from(leadEvents)
    .leftJoin(users, eq(users.id, leadEvents.actorId))
    .where(and(eq(leadEvents.leadId, leadId), eq(leadEvents.projectId, projectId)))
    .orderBy(desc(leadEvents.at), desc(leadEvents.id))
    .limit(TIMELINE_CAP);

  const ownerIds = [...new Set(events.flatMap((e) => assignedTo(e.kind, e.data) ?? []))];
  const owners = ownerIds.length
    ? await tx
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, ownerIds))
    : [];

  return events.map((e) => {
    const owner = assignedTo(e.kind, e.data);
    return {
      ...e,
      data: owner
        ? { ...e.data, ownerName: owners.find((o) => o.id === owner)?.name ?? null }
        : e.data,
      at: e.at.toISOString(),
    };
  });
}
