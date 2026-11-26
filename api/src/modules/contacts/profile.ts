import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { email, leadStatus } from '../../contracts/common.ts';
import type { ContactProfile } from '../../contracts/contacts.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { type Tx, withTenant } from '../../lib/tenant/index.ts';
import { users } from '../auth/schema.ts';
import { assertCan } from '../leads/access.ts';
import {
  leadContactJoin,
  leadOwnerJoin,
  leadRowColumns,
  phoneDisplay,
  toStaffLead,
} from '../leads/projection.ts';
import { leadEvents, leads, notes } from '../leads/schema.ts';
import { waConversations, waMessages, waNumbers } from '../whatsapp/schema.ts';
import { contacts } from './schema.ts';

// GET /contacts/:id (F4b S9). Staff only. Leads are the contact's non-test leads, newest first. A contact that
// only has test leads is not found, the same as the list hiding it.

function safeEmail(raw: string | null): string | null {
  const parsed = raw === null ? null : email.safeParse(raw);
  return parsed?.success ? parsed.data : null;
}

export async function getContactProfile(
  session: ResolvedSession,
  id: string,
  projectId: string,
): Promise<ContactProfile> {
  assertCan(session, 'contact.read', projectId);

  return withTenant(session, async (tx) => {
    const [contact] = await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.projectId, projectId)));
    if (!contact) throw new AppError('NOT_FOUND');

    const records = await tx
      .select(leadRowColumns)
      .from(leads)
      .innerJoin(contacts, leadContactJoin)
      .leftJoin(users, leadOwnerJoin)
      .where(and(eq(leads.contactId, id), eq(leads.projectId, projectId), eq(leads.isTest, false)))
      .orderBy(desc(leads.createdAt), desc(leads.id));
    if (records.length === 0) throw new AppError('NOT_FOUND');

    const shown = records.map(toStaffLead);
    return {
      contact: {
        id: contact.id,
        name: contact.name,
        phone: contact.phoneE164,
        phoneDisplay: phoneDisplay(contact.phoneE164),
        email: safeEmail(contact.email),
        createdAt: contact.createdAt.toISOString(),
      },
      leads: shown,
      chats: await chatsOf(tx, projectId, id),
      notes: await notesOf(tx, projectId, id),
      statusChanges: await marksOf(tx, projectId, id),
    };
  });
}

/** One row per WhatsApp number this person has written on, with how many messages that chat holds. */
async function chatsOf(tx: Tx, projectId: string, contactId: string) {
  const rows = await tx
    .select({
      numberLabel: waNumbers.label,
      phoneE164: waNumbers.phoneE164,
      messages: sql<number>`count(${waMessages.id})::int`,
    })
    .from(waConversations)
    .innerJoin(waNumbers, eq(waNumbers.id, waConversations.numberId))
    .leftJoin(waMessages, eq(waMessages.conversationId, waConversations.id))
    .where(and(eq(waConversations.contactId, contactId), eq(waConversations.projectId, projectId)))
    .groupBy(waNumbers.id, waNumbers.label, waNumbers.phoneE164)
    .orderBy(asc(waNumbers.label), asc(waNumbers.id));
  return rows.map((row) => ({
    numberLabel: row.numberLabel,
    phoneDisplay: phoneDisplay(row.phoneE164),
    messages: row.messages,
  }));
}

async function notesOf(tx: Tx, projectId: string, contactId: string) {
  const rows = await tx
    .select({
      id: notes.id,
      leadId: notes.leadId,
      authorName: users.name,
      text: notes.text,
      createdAt: notes.createdAt,
    })
    .from(notes)
    .innerJoin(leads, eq(leads.id, notes.leadId))
    .leftJoin(users, eq(users.id, notes.authorId))
    .where(
      and(eq(leads.contactId, contactId), eq(leads.projectId, projectId), eq(leads.isTest, false)),
    )
    .orderBy(desc(notes.createdAt), desc(notes.id));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/** Marks from lead_events. `byName` is the actor; a reason is only stored for Not qualified. */
async function marksOf(tx: Tx, projectId: string, contactId: string) {
  const rows = await tx
    .select({
      leadId: leadEvents.leadId,
      data: leadEvents.data,
      byName: users.name,
      at: leadEvents.at,
    })
    .from(leadEvents)
    .innerJoin(leads, eq(leads.id, leadEvents.leadId))
    .leftJoin(users, eq(users.id, leadEvents.actorId))
    .where(
      and(
        eq(leadEvents.kind, 'status_changed'),
        eq(leads.contactId, contactId),
        eq(leads.projectId, projectId),
        eq(leads.isTest, false),
      ),
    )
    .orderBy(desc(leadEvents.at), desc(leadEvents.id));

  const out: ContactProfile['statusChanges'] = [];
  for (const row of rows) {
    const from = leadStatus.safeParse(row.data.from);
    const to = leadStatus.safeParse(row.data.to);
    if (!from.success || !to.success) continue;
    out.push({
      leadId: row.leadId,
      from: from.data,
      to: to.data,
      reason: typeof row.data.reason === 'string' ? row.data.reason : null,
      byName: row.byName,
      at: row.at.toISOString(),
    });
  }
  return out;
}
