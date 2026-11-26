import { and, count, desc, eq, type SQL, sql } from 'drizzle-orm';
import type { Source } from '../../contracts/common.ts';
import type { OverviewResponse } from '../../contracts/reports.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { type Tx, withTenant } from '../../lib/tenant/index.ts';
import { users } from '../auth/schema.ts';
import { contacts } from '../contacts/schema.ts';
import { assertCan } from '../leads/access.ts';
import { leadContactJoin, leadOwnerJoin, leadRowColumns } from '../leads/projection.ts';
import { leads } from '../leads/schema.ts';
import { projectOverview } from './projection.ts';

// GET /reports/overview (F13a S1–S3). Read-only aggregates in one withTenant transaction, never cached.
// - Window: the last 30 calendar days in the client's own time zone, today included. The bounds are computed once and
//   the column is compared with them (so leads_project_created_idx serves it); `at time zone` per day handles DST.
//   Leads (30 d) is the sum of the 30 buckets, and the rates and the median use the same leads.
// - Test leads never count, for any role (an explicit `not is_test` in every statement).
// - First reply (plan D1–D3) is computed from wa_messages, the source of truth: for each lead, its first inbound
//   message on or after the lead was created (and before the contact's next lead), then the first outbound message
//   (any origin) strictly after it. Leads without both are left out. True median, rounded to whole minutes.

/** The waiting-for-review list on the client's Overview (the tile shows the full count). */
export const WAITING_LIST_SIZE = 5;

type DayRow = { date: string; count: number; qualified: number; sql_count: number };
type SourceRow = { source: Source; count: number };
type MedianRow = { median_s: number | null };

/** CTE `b` (the client's zone and today) and `w` (this client's real leads in the window, with their local day). */
function windowCtes(projectId: string, now: Date): SQL {
  return sql`
    b as (
      select p.timezone as tz, (${now.toISOString()}::timestamptz at time zone p.timezone)::date as today
      from projects p where p.id = ${projectId}
    ),
    w as (
      select l.id, l.contact_id, l.created_at, l.status, l.source,
        (l.created_at at time zone b.tz)::date as day
      from leads l, b
      where l.project_id = ${projectId} and not l.is_test
        and l.created_at >= ((b.today - 29)::timestamp at time zone b.tz)
        and l.created_at < ((b.today + 1)::timestamp at time zone b.tz)
    )`;
}

export async function getOverview(
  session: ResolvedSession,
  projectId: string,
  now: Date = new Date(),
): Promise<OverviewResponse> {
  assertCan(session, 'report.read', projectId);
  const ctes = windowCtes(projectId, now);

  return withTenant(session, async (tx) => {
    // 1. Thirty zero-filled buckets, with the status counts the rates need.
    const days = (
      await tx.execute<DayRow>(sql`
        with ${ctes},
        days as (
          select d::date as day from b, generate_series(b.today - 29, b.today, interval '1 day') d
        )
        select to_char(days.day, 'YYYY-MM-DD') as date,
          count(w.id)::int as count,
          (count(w.id) filter (where w.status in ('mql', 'sql')))::int as qualified,
          (count(w.id) filter (where w.status = 'sql'))::int as sql_count
        from days left join w on w.day = days.day
        group by days.day
        order by days.day`)
    ).rows;
    // RLS hid the project, or it does not exist (assertCan already turned a foreign client into 404).
    if (days.length === 0) throw new AppError('NOT_FOUND');

    // 2. Every source in the window, biggest first (the web folds the tail into "Other").
    const sources = (
      await tx.execute<SourceRow>(sql`
        with ${ctes}
        select w.source, count(*)::int as count from w
        group by w.source
        order by count(*) desc, w.source::text asc`)
    ).rows;

    // 3. Median first reply.
    const [median] = (
      await tx.execute<MedianRow>(sql`
        with ${ctes},
        contact_leads as (
          select l.id, lead(l.created_at) over (partition by l.contact_id order by l.created_at, l.id) as next_at
          from leads l where l.project_id = ${projectId} and not l.is_test
        ),
        firsts as (
          select w.contact_id, (
            select min(m.ts) from wa_messages m join wa_conversations c on c.id = m.conversation_id
            where c.project_id = ${projectId} and c.contact_id = w.contact_id and m.direction = 'in'
              and m.ts >= w.created_at and (cl.next_at is null or m.ts < cl.next_at)
          ) as first_in
          from w join contact_leads cl on cl.id = w.id
        ),
        replies as (
          select f.first_in, (
            select min(m.ts) from wa_messages m join wa_conversations c on c.id = m.conversation_id
            where c.project_id = ${projectId} and c.contact_id = f.contact_id and m.direction = 'out'
              and m.ts > f.first_in
          ) as first_out
          from firsts f where f.first_in is not null
        )
        select percentile_cont(0.5) within group (
          order by extract(epoch from first_out - first_in)
        ) as median_s
        from replies where first_out is not null`)
    ).rows;

    const leads30 = sum(days, (d) => d.count);
    const qualified = sum(days, (d) => d.qualified);
    const sqlCount = sum(days, (d) => d.sql_count);
    const medianS = median?.median_s == null ? null : Number(median.median_s);
    const waiting =
      session.role === 'client' ? await waitingLeads(tx, projectId) : { count: 0, rows: [] };

    return projectOverview(session, {
      kpis: {
        leads30,
        newToday: days.at(-1)?.count ?? 0,
        medianFirstReplyMin: medianS === null ? null : Math.round(medianS / 60),
        mqlRate: leads30 ? qualified / leads30 : null,
        sqlRate: leads30 ? sqlCount / leads30 : null,
      },
      perDay: days.map((d) => ({ date: d.date, count: d.count })),
      bySource: sources.map((s) => ({ source: s.source, count: s.count })),
      waitingCount: waiting.count,
      waiting: waiting.rows,
    });
  });
}

/** Unreviewed real leads, all time (the same number as the Leads screen's tab), and the newest few. */
async function waitingLeads(tx: Tx, projectId: string) {
  const where = and(
    eq(leads.projectId, projectId),
    eq(leads.isTest, false),
    eq(leads.status, 'new'),
  );
  const [total] = await tx.select({ n: count() }).from(leads).where(where);
  const rows = await tx
    .select(leadRowColumns)
    .from(leads)
    .innerJoin(contacts, leadContactJoin)
    .leftJoin(users, leadOwnerJoin)
    .where(where)
    .orderBy(desc(leads.createdAt), desc(leads.id))
    .limit(WAITING_LIST_SIZE);
  return { count: total?.n ?? 0, rows };
}

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
