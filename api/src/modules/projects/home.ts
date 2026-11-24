import { sql } from 'drizzle-orm';
import type { HealthState, Source } from '../../contracts/common.ts';
import type { ProjectHomeRow, ProjectsHomeResponse } from '../../contracts/projects.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { withTenant } from '../../lib/tenant/index.ts';
import { colorFor } from './colors.ts';

// Clients home (F2b S1): one row per client with today's numbers and connection health, and a totals strip that
// ignores the search so it stays put while staff type. One query, time-zone aware ("today" starts at the client's
// own midnight); test leads never count; a client without data shows zeros, never an error.

/** Fixed order of the connection dots (csv is not a connection the home page shows). */
export const DOT_ORDER: readonly Source[] = [
  'whatsapp',
  'meta',
  'google',
  'tiktok',
  'linkedin',
  'snapchat',
  'website',
];
const TO_FIX: readonly HealthState[] = ['needs_attention', 'broken'];

type Row = {
  id: string;
  name: string;
  city: string | null;
  industry: string | null;
  color: string | null;
  timezone: string;
  new_today: number;
  unreplied: number;
  overdue: number;
  integrations: { platform: string; status: HealthState }[] | null;
};

export async function projectsHome(
  session: ResolvedSession,
  q?: string,
  now: Date = new Date(),
): Promise<ProjectsHomeResponse> {
  const rows = await withTenant(session, async (tx) => {
    const res = await tx.execute<Row>(sql`
      select p.id, p.name, p.city, p.industry, p.color, p.timezone,
        (select count(*)::int from leads l
          where l.project_id = p.id and not l.is_test
            and (l.created_at at time zone p.timezone)::date = (${now}::timestamptz at time zone p.timezone)::date
        ) as new_today,
        (select count(*)::int from wa_conversations c
          where c.project_id = p.id
            and exists (select 1 from leads lc where lc.contact_id = c.contact_id and not lc.is_test)
            and (select m.direction from wa_messages m where m.conversation_id = c.id order by m.ts desc limit 1) = 'in'
        ) as unreplied,
        (select count(*)::int from tasks k left join leads lt on lt.id = k.lead_id
          where k.project_id = p.id and k.done_at is null and k.due_at < ${now}::timestamptz
            and coalesce(lt.is_test, false) = false
        ) as overdue,
        (select json_agg(json_build_object('platform', i.platform, 'status', i.status))
           from integrations i where i.project_id = p.id
        ) as integrations
      from projects p`);
    return res.rows;
  });

  const all = rows.map(toHomeRow);
  const needle = q?.trim().toLowerCase();
  const shown = needle
    ? all.filter((r) =>
        [r.name, r.city ?? '', r.industry ?? ''].some((v) => v.toLowerCase().includes(needle)),
      )
    : all;
  shown.sort(
    (a, b) => b.newToday - a.newToday || b.unreplied - a.unreplied || a.name.localeCompare(b.name),
  );

  return {
    totals: {
      newToday: sum(all, (r) => r.newToday),
      unreplied: sum(all, (r) => r.unreplied),
      overdue: sum(all, (r) => r.overdue),
      toFix: sum(all, (r) => r.integrations.filter((i) => TO_FIX.includes(i.status)).length),
    },
    rows: shown,
  };
}

function toHomeRow(r: Row): ProjectHomeRow {
  const byPlatform = new Map((r.integrations ?? []).map((i) => [i.platform, i.status]));
  return {
    id: r.id,
    name: r.name,
    city: r.city,
    industry: r.industry,
    color: colorFor(r.id, r.color),
    timezone: r.timezone,
    newToday: Number(r.new_today),
    unreplied: Number(r.unreplied),
    overdue: Number(r.overdue),
    integrations: DOT_ORDER.map((platform) => ({
      platform,
      status: byPlatform.get(platform) ?? 'not_connected',
    })),
  };
}

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
