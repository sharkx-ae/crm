import { and, asc, desc, eq, exists, or, sql } from 'drizzle-orm';
import type { LeadsPage, LeadsQuery } from '../../contracts/leads.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { type Tx, withTenant } from '../../lib/tenant/index.ts';
import { users } from '../auth/schema.ts';
import { contacts } from '../contacts/schema.ts';
import { assertCan } from './access.ts';
import { leadFilterSql, tabSql } from './filters.ts';
import {
  leadContactJoin,
  leadOwnerJoin,
  leadRowColumns,
  type OwnerChoice,
  projectLeadsPage,
} from './projection.ts';
import { leads } from './schema.ts';

// GET /leads (F4b S1, S2). Paging is server-side: the api applies the tab, the filters, the search and the page
// (`limit` rows from `(page - 1) * limit`). Counts and `total` ignore the page, and the counts ignore the tab, so the
// tabs always add up and stay right under any filter. A page past the end is empty with the true total. Nothing is cached.

const countWhere = (status: string) =>
  sql<number>`count(*) filter (where ${leads.status} = ${status})::int`;

export async function listLeads(session: ResolvedSession, q: LeadsQuery): Promise<LeadsPage> {
  assertCan(session, 'lead.read', q.projectId);
  const filter = leadFilterSql(session, q);

  return withTenant(session, async (tx) => {
    const [row] = await tx
      .select({
        all: sql<number>`count(*)::int`,
        unreviewed: countWhere('new'),
        mql: countWhere('mql'),
        sql: countWhere('sql'),
        not_qualified: countWhere('not_qualified'),
      })
      .from(leads)
      .innerJoin(contacts, leadContactJoin)
      .where(filter);
    const counts = row ?? { all: 0, unreviewed: 0, mql: 0, sql: 0, not_qualified: 0 };

    const records = await tx
      .select(leadRowColumns)
      .from(leads)
      .innerJoin(contacts, leadContactJoin)
      .leftJoin(users, leadOwnerJoin)
      .where(and(filter, tabSql(q.tab)))
      .orderBy(desc(leads.createdAt), desc(leads.id))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit);

    // Every source this client has, whatever is filtered: the select must not shrink as you use it.
    const sources = await tx
      .selectDistinct({ source: leads.source })
      .from(leads)
      .where(and(eq(leads.projectId, q.projectId), eq(leads.isTest, false)))
      .orderBy(asc(leads.source));

    const base = { counts, total: counts[q.tab], sources: sources.map((s) => s.source) };
    const owners = session.role === 'client' ? [] : await ownerChoices(tx, q.projectId);
    return projectLeadsPage(session, base, records, owners);
  });
}

/** For the owner filter: every active manager, plus a disabled or invited one who still owns a lead here. */
function ownerChoices(tx: Tx, projectId: string): Promise<OwnerChoice[]> {
  return tx
    .select({
      id: users.id,
      name: users.name,
      active: sql<boolean>`${users.status} = 'active'`,
    })
    .from(users)
    .where(
      and(
        eq(users.role, 'manager'),
        or(
          eq(users.status, 'active'),
          exists(
            tx
              .select({ one: sql`1` })
              .from(leads)
              .where(
                and(
                  eq(leads.ownerId, users.id),
                  eq(leads.projectId, projectId),
                  eq(leads.isTest, false),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(asc(sql`lower(${users.name})`), asc(users.id));
}
