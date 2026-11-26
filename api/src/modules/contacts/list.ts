import { and, asc, desc, eq, ilike, like, or, type SQL, sql } from 'drizzle-orm';
import { email, leadStatus } from '../../contracts/common.ts';
import type { ContactRow, ContactsPage, ContactsQuery } from '../../contracts/contacts.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { withTenant } from '../../lib/tenant/index.ts';
import { assertCan } from '../leads/access.ts';
import { likePattern, phoneDigits } from '../leads/filters.ts';
import { phoneDisplay } from '../leads/projection.ts';
import { leads } from '../leads/schema.ts';
import { waConversations, waMessages } from '../whatsapp/schema.ts';
import { contacts } from './schema.ts';

// GET /contacts (F4b S8). Staff only. Counts, latest status and last activity are over non-test leads, so a
// person who only exists as a test lead is not in the list. Newest activity first. The api applies the page (`limit` rows
// from `(page - 1) * limit`); `total` is the whole filtered set.

/** A stored address the contract would refuse must not fail the whole page. */
function safeEmail(raw: string | null): string | null {
  const parsed = raw === null ? null : email.safeParse(raw);
  return parsed?.success ? parsed.data : null;
}

function stamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Name, email, or (when there are enough digits) the phone. `%` and `_` mean themselves. */
function searchSql(q: string | undefined) {
  const text = q?.trim();
  if (!text) return undefined;
  const digits = phoneDigits(text);
  return or(
    ilike(contacts.name, likePattern(text)),
    ilike(contacts.email, likePattern(text)),
    digits ? like(contacts.phoneE164, `%${digits}%`) : undefined,
  );
}

/** The requested column and direction, then newest activity first, then id (a stable order for paging). */
function contactOrder(
  q: ContactsQuery,
  c: {
    lastActivity: SQL<Date>;
    stats: { leadCount: SQL.Aliased<number>; latestStatus: SQL.Aliased<string> };
  },
) {
  const columns = {
    contact: sql`lower(coalesce(${contacts.name}, ${contacts.phoneE164}, ''))`,
    email: sql`lower(coalesce(${contacts.email}, ''))`,
    leads: c.stats.leadCount,
    status: c.stats.latestStatus,
    activity: c.lastActivity,
  };
  const by = q.sort ? (q.dir === 'asc' ? asc : desc)(columns[q.sort]) : undefined;
  return [...(by ? [by] : []), desc(c.lastActivity), desc(contacts.id)];
}

export async function listContacts(
  session: ResolvedSession,
  q: ContactsQuery,
): Promise<ContactsPage> {
  assertCan(session, 'contact.read', q.projectId);

  return withTenant(session, async (tx) => {
    // One row per contact that has a real lead. Test leads never count.
    const stats = tx
      .select({
        contactId: leads.contactId,
        leadCount: sql<number>`count(*)::int`.as('lead_count'),
        latestStatus:
          sql<string>`(array_agg(${leads.status} order by ${leads.createdAt} desc, ${leads.id} desc))[1]`.as(
            'latest_status',
          ),
        lastLeadAt: sql<Date>`max(${leads.createdAt})`.as('last_lead_at'),
      })
      .from(leads)
      .where(and(eq(leads.projectId, q.projectId), eq(leads.isTest, false)))
      .groupBy(leads.contactId)
      .as('lead_stats');

    const chats = tx
      .select({
        contactId: waConversations.contactId,
        lastMessageAt: sql<Date | null>`max(${waMessages.ts})`.as('last_message_at'),
      })
      .from(waConversations)
      .leftJoin(waMessages, eq(waMessages.conversationId, waConversations.id))
      .where(eq(waConversations.projectId, q.projectId))
      .groupBy(waConversations.contactId)
      .as('contact_chats');

    // greatest ignores nulls on Postgres 18; coalesce covers a null message time either way.
    const lastActivity = sql<Date>`coalesce(greatest(${stats.lastLeadAt}, ${chats.lastMessageAt}), ${stats.lastLeadAt})`;
    const where = and(eq(contacts.projectId, q.projectId), searchSql(q.q));

    const [counted] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(contacts)
      .innerJoin(stats, eq(stats.contactId, contacts.id))
      .where(where);

    const records = await tx
      .select({
        id: contacts.id,
        name: contacts.name,
        phoneE164: contacts.phoneE164,
        email: contacts.email,
        leadCount: stats.leadCount,
        latestStatus: stats.latestStatus,
        lastActivityAt: lastActivity,
      })
      .from(contacts)
      .innerJoin(stats, eq(stats.contactId, contacts.id))
      .leftJoin(chats, eq(chats.contactId, contacts.id))
      .where(where)
      .orderBy(...contactOrder(q, { lastActivity, stats }))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit);

    const rows: ContactRow[] = records.map((row) => {
      const status = leadStatus.safeParse(row.latestStatus);
      if (!status.success) throw new AppError('INTERNAL');
      return {
        id: row.id,
        name: row.name,
        phone: row.phoneE164,
        phoneDisplay: phoneDisplay(row.phoneE164),
        email: safeEmail(row.email),
        leadCount: row.leadCount,
        latestStatus: status.data,
        lastActivityAt: stamp(row.lastActivityAt),
      };
    });

    return { rows, total: counted?.total ?? 0 };
  });
}
