import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectClientSafe } from '../../../tests/helpers/client-safe.ts';
import { ensureSuperAdmin, first, rawClient } from '../../../tests/helpers/db.ts';
import { asSession, buildTestApp, seedUser, signIn } from '../../../tests/helpers/http.ts';
import type { LeadStatus, Source } from '../../contracts/common.ts';
import { type OverviewResponse, overviewResponse } from '../../contracts/reports.ts';
import { getPool } from '../../db/index.ts';
import * as s from '../../db/schema/index.ts';
import { CLIENTS } from '../../db/seed/data.ts';
import { seed } from '../../db/seed.ts';
import { setEmailTransport } from '../../lib/email/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { withSystem } from '../../lib/tenant/index.ts';
import { getOverview, WAITING_LIST_SIZE } from './overview.ts';

// F13a S1–S3: the Overview on the seed (numbers from expected.json, worked out from buildSeed by hand), then small
// hand-built clients for the time-zone, window, DST and first-reply rules (plan D1–D5, D9).

type Expected = {
  now: string;
  clients: Record<
    string,
    {
      newToday: number;
      byStatus: Record<LeadStatus, number>;
      overview: {
        leads30: number;
        mqlRate: number | null;
        sqlRate: number | null;
        medianFirstReplyMin: number | null;
        bySource: Record<string, number>;
        peak: { date: string; count: number };
      };
    }
  >;
};
const expected = JSON.parse(readFileSync('tests/fixtures/seed/expected.json', 'utf8')) as Expected;
const NOW = new Date(expected.now);
const MIN = 60_000;

let app: FastifyInstance;
let staff: ResolvedSession;
let managerToken: string;
let clientToken: string;
const clientOfProject: Record<string, ResolvedSession> = {};
const project: Record<string, string> = {};
const db = rawClient();

const session = (
  userId: string,
  role: ResolvedSession['role'],
  projectIds: string[] = [],
): ResolvedSession => ({
  userId,
  role,
  projectIds,
  locale: 'en',
  stage: 'active',
  sessionId: 'test',
  name: 'Test',
  email: 'test@test.local',
});

beforeAll(async () => {
  await db.connect();
  await seed({ appEnv: 'local', password: 'Seed-password-2026', reset: true, now: NOW });
  const built = await buildTestApp();
  app = built.app;
  staff = session(await ensureSuperAdmin(), 'super_admin');
  const { rows } = await db.query<{ id: string; name: string }>('select id, name from projects');
  for (const c of CLIENTS) project[c.key] = rows.find((r) => r.name === c.name)?.id as string;
  managerToken = (await signIn(app, built.mail, (await seedUser({ role: 'manager' })).email)).token;
  const lumUser = await seedUser({ role: 'client', projectId: project.lum });
  clientToken = (await signIn(app, built.mail, lumUser.email)).token;
  clientOfProject.lum = session(lumUser.id, 'client', [project.lum as string]);
  const oasUser = await seedUser({ role: 'client', projectId: project.oas });
  clientOfProject.oas = session(oasUser.id, 'client', [project.oas as string]);
});
afterAll(async () => {
  await app.close();
  await db.end();
  setEmailTransport(undefined);
  await getPool().end();
});

const staffOf = (r: OverviewResponse) => {
  if (r.view !== 'staff') throw new Error('expected the staff view');
  return r;
};
const clientOf = (r: OverviewResponse) => {
  if (r.view !== 'client') throw new Error('expected the client view');
  return r;
};

describe('the Overview on the seed', () => {
  it('KPIs, buckets and sources equal expected.json for every client (staff)', async () => {
    for (const c of CLIENTS) {
      const e = expected.clients[c.key];
      if (!e) throw new Error(c.key);
      const o = staffOf(await getOverview(staff, project[c.key] as string, NOW));
      expect(o.kpis.leads30, c.key).toBe(e.overview.leads30);
      expect(o.kpis.newToday, c.key).toBe(e.newToday);
      expect(o.kpis.medianFirstReplyMin, c.key).toBe(e.overview.medianFirstReplyMin);
      expect(o.kpis.mqlRate, c.key).toBeCloseTo(e.overview.mqlRate as number, 4);
      expect(o.kpis.sqlRate, c.key).toBeCloseTo(e.overview.sqlRate as number, 4);

      expect(o.perDay).toHaveLength(30);
      expect(o.perDay.at(-1)?.date).toBe('2026-11-25');
      expect(o.perDay.reduce((n, d) => n + d.count, 0)).toBe(o.kpis.leads30);
      const peak = Math.max(...o.perDay.map((d) => d.count));
      expect(o.perDay.find((d) => d.count === peak)).toEqual(e.overview.peak);

      expect(Object.fromEntries(o.bySource.map((x) => [x.source, x.count]))).toEqual(
        e.overview.bySource,
      );
      const order = [...o.bySource].sort(
        (a, b) => b.count - a.count || a.source.localeCompare(b.source),
      );
      expect(o.bySource).toEqual(order);
      expect(o).not.toHaveProperty('waiting');
    }
  });

  it("the client's own Overview: same numbers, plus the waiting tile and the newest few, client-safe", async () => {
    const lum = expected.clients.lum;
    const res = await app.inject({
      method: 'GET',
      url: `/reports/overview?projectId=${project.lum}`,
      headers: asSession(clientToken),
    });
    expect(res.statusCode).toBe(200);
    expectClientSafe(res.body);
    const o = clientOf(overviewResponse.parse(res.json()));
    expect(o.kpis.waiting).toBe(lum?.byStatus.new);
    expect(o.waiting.length).toBe(Math.min(WAITING_LIST_SIZE, lum?.byStatus.new ?? 0));
    expect(o.waiting.every((l) => l.status === 'new')).toBe(true);
    const times = o.waiting.map((l) => Date.parse(l.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));

    const direct = clientOf(
      await getOverview(clientOfProject.lum as ResolvedSession, project.lum as string, NOW),
    );
    expect(direct.kpis.leads30).toBe(lum?.overview.leads30);
    expect(direct.kpis.medianFirstReplyMin).toBe(lum?.overview.medianFirstReplyMin);
  });

  it('staff over HTTP get the staff shape; a staff request for an unknown client is 404', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: `/reports/overview?projectId=${project.prl}`,
      headers: asSession(managerToken),
    });
    expect(ok.statusCode).toBe(200);
    expect(overviewResponse.parse(ok.json()).view).toBe('staff');
    const unknown = await app.inject({
      method: 'GET',
      url: `/reports/overview?projectId=${randomUUID()}`,
      headers: asSession(managerToken),
    });
    expect(unknown.statusCode).toBe(404);
  });

  it("the seed's leads.first_reply_at equals the reply worked out from the messages (F3b must keep it so)", async () => {
    const { rows } = await db.query<{ id: string }>(`
      select l.id from leads l
      left join lateral (
        select min(m.ts) as first_in from wa_messages m join wa_conversations c on c.id = m.conversation_id
        where c.contact_id = l.contact_id and m.direction = 'in' and m.ts >= l.created_at) fi on true
      left join lateral (
        select min(m.ts) as first_out from wa_messages m join wa_conversations c on c.id = m.conversation_id
        where c.contact_id = l.contact_id and m.direction = 'out' and m.ts > fi.first_in) fo on true
      where l.first_reply_at is distinct from fo.first_out`);
    expect(rows).toEqual([]);
  });

  it('is read-only: no audit, no change feed', async () => {
    const counts = async () =>
      (
        await db.query<{ a: number; c: number }>(
          'select (select count(*) from audit_log)::int a, (select count(*) from change_feed)::int c',
        )
      ).rows[0];
    const before = await counts();
    await getOverview(staff, project.oas as string, NOW);
    await getOverview(clientOfProject.oas as ResolvedSession, project.oas as string, NOW);
    expect(await counts()).toEqual(before);
  });
});

// ---- small hand-built clients -------------------------------------------------------------------------------------

type Msg = { dir: 'in' | 'out'; at: Date; origin?: 'customer' | 'app' | 'history' };

async function newClient(timezone: string) {
  const projectId = randomUUID();
  const numberId = await withSystem(projectId, async (tx) => {
    await tx
      .insert(s.projects)
      .values({ id: projectId, name: `Overview ${projectId.slice(0, 6)}`, timezone });
    return first(
      await tx
        .insert(s.waNumbers)
        .values({
          projectId,
          phoneE164: `+9714${String(Math.floor(1e7 + Math.random() * 9e7))}`,
          phoneNumberId: `pn-${randomUUID()}`,
          wabaId: `waba-${randomUUID()}`,
        })
        .returning({ id: s.waNumbers.id }),
    ).id;
  });
  return { projectId, numberId };
}

async function addLead(
  c: { projectId: string; numberId: string },
  o: {
    at: Date;
    status?: LeadStatus;
    source?: Source;
    isTest?: boolean;
    contactId?: string;
    chat?: Msg[];
  },
) {
  return withSystem(c.projectId, async (tx) => {
    const contactId =
      o.contactId ??
      first(
        await tx
          .insert(s.contacts)
          .values({ projectId: c.projectId, name: 'Hand-built' })
          .returning({ id: s.contacts.id }),
      ).id;
    const lead = first(
      await tx
        .insert(s.leads)
        .values({
          projectId: c.projectId,
          contactId,
          source: o.source ?? 'meta',
          status: o.status ?? 'new',
          isTest: o.isTest ?? false,
          createdAt: o.at,
        })
        .returning({ id: s.leads.id }),
    );
    if (o.chat?.length) {
      await tx
        .insert(s.waConversations)
        .values({ projectId: c.projectId, numberId: c.numberId, contactId })
        .onConflictDoNothing();
      const conv = first(
        await tx
          .select({ id: s.waConversations.id })
          .from(s.waConversations)
          .where(
            and(
              eq(s.waConversations.numberId, c.numberId),
              eq(s.waConversations.contactId, contactId),
            ),
          ),
      );
      await tx.insert(s.waMessages).values(
        o.chat.map((m) => ({
          projectId: c.projectId,
          conversationId: conv.id,
          waMessageId: randomUUID(),
          direction: m.dir,
          origin: m.origin ?? (m.dir === 'in' ? ('customer' as const) : ('app' as const)),
          ts: m.at,
        })),
      );
    }
    return { leadId: lead.id, contactId };
  });
}

const plus = (base: Date, minutes: number) => new Date(base.getTime() + minutes * MIN);
const T = new Date('2026-11-20T08:00:00Z'); // inside the 30-day window of NOW
const median = async (projectId: string) =>
  (await getOverview(staff, projectId, NOW)).kpis.medianFirstReplyMin;

describe('median first reply (D1–D3)', () => {
  it('no chats → null; inbound only and outbound only are left out', async () => {
    const c = await newClient('Asia/Dubai');
    await addLead(c, { at: T });
    expect(await median(c.projectId)).toBeNull();
    await addLead(c, { at: T, chat: [{ dir: 'in', at: plus(T, 1) }] });
    await addLead(c, { at: T, chat: [{ dir: 'out', at: plus(T, 1) }] });
    expect(await median(c.projectId)).toBeNull();
  });

  it('measures from the first inbound to the first outbound strictly after it', async () => {
    const c = await newClient('Asia/Dubai');
    await addLead(c, {
      at: T,
      chat: [
        { dir: 'out', at: plus(T, 0) }, // the agency wrote first: not a reply
        { dir: 'in', at: plus(T, 5) },
        { dir: 'out', at: plus(T, 5) }, // same instant: not after
        { dir: 'out', at: plus(T, 12) },
      ],
    });
    expect(await median(c.projectId)).toBe(7);
  });

  it('even count → the mean of the two middle values; ties are kept', async () => {
    const even = await newClient('Asia/Dubai');
    for (const m of [10, 20]) {
      await addLead(even, {
        at: T,
        chat: [
          { dir: 'in', at: T },
          { dir: 'out', at: plus(T, m) },
        ],
      });
    }
    expect(await median(even.projectId)).toBe(15);

    const ties = await newClient('Asia/Dubai');
    for (const m of [9, 9, 22, 25, 34]) {
      await addLead(ties, {
        at: T,
        chat: [
          { dir: 'in', at: T },
          { dir: 'out', at: plus(T, m) },
        ],
      });
    }
    expect(await median(ties.projectId)).toBe(22);
  });

  it('a 20-second reply rounds to 0; a reply sent from the phone counts', async () => {
    const c = await newClient('Asia/Dubai');
    await addLead(c, {
      at: T,
      chat: [
        { dir: 'in', at: T },
        { dir: 'out', at: new Date(T.getTime() + 20_000), origin: 'history' },
      ],
    });
    expect(await median(c.projectId)).toBe(0);
  });

  it("each lead uses its own messages: older chats and the contact's next lead are cut off", async () => {
    const c = await newClient('Asia/Dubai');
    // An old chat before the first lead was created (a WhatsApp talk before a Meta form): ignored.
    const a = await addLead(c, {
      at: T,
      status: 'not_qualified',
      chat: [
        { dir: 'in', at: plus(T, -1000) },
        { dir: 'out', at: plus(T, -990) },
        { dir: 'in', at: plus(T, 1) },
        { dir: 'out', at: plus(T, 4) }, // lead A: 3 min
      ],
    });
    await addLead(c, {
      at: plus(T, 60),
      contactId: a.contactId,
      chat: [
        { dir: 'in', at: plus(T, 61) },
        { dir: 'out', at: plus(T, 81) }, // lead B: 20 min
      ],
    });
    expect(await median(c.projectId)).toBe(12); // (3 + 20) / 2 = 11.5 → 12
  });

  it('a lead outside the window does not count', async () => {
    const c = await newClient('Asia/Dubai');
    const old = new Date('2026-10-01T08:00:00Z');
    await addLead(c, {
      at: old,
      chat: [
        { dir: 'in', at: old },
        { dir: 'out', at: plus(old, 50) },
      ],
    });
    await addLead(c, {
      at: T,
      chat: [
        { dir: 'in', at: T },
        { dir: 'out', at: plus(T, 5) },
      ],
    });
    expect(await median(c.projectId)).toBe(5);
  });
});

describe('time zones, the window and test leads', () => {
  it('a lead at 20:30 UTC is today in Dubai and yesterday in Casablanca', async () => {
    const at = new Date('2026-11-24T20:30:00Z');
    const dubai = await newClient('Asia/Dubai');
    const casa = await newClient('Africa/Casablanca');
    await addLead(dubai, { at });
    await addLead(casa, { at });
    const d = await getOverview(staff, dubai.projectId, NOW);
    const m = await getOverview(staff, casa.projectId, NOW);
    expect(d.kpis.newToday).toBe(1);
    expect(d.perDay.at(-1)).toEqual({ date: '2026-11-25', count: 1 });
    expect(m.kpis.newToday).toBe(0);
    expect(m.perDay.at(-2)).toEqual({ date: '2026-11-24', count: 1 });
  });

  it('the window starts at local midnight 29 days ago: on the edge is in, a second earlier is out', async () => {
    const c = await newClient('Asia/Dubai');
    const edge = new Date('2026-10-26T20:00:00Z'); // 27 Oct 00:00 in Dubai
    await addLead(c, { at: edge, status: 'sql' });
    await addLead(c, { at: new Date(edge.getTime() - 1000), status: 'sql' });
    const o = await getOverview(staff, c.projectId, NOW);
    expect(o.kpis.leads30).toBe(1);
    expect(o.perDay[0]).toEqual({ date: '2026-10-27', count: 1 });
    expect(o.kpis.sqlRate).toBe(1);
  });

  it('across a DST change: 30 consecutive days, each lead in its local day', async () => {
    const c = await newClient('Europe/Paris'); // clocks went back on 25 Oct 2026
    await addLead(c, { at: new Date('2026-10-24T22:30:00Z') }); // 00:30 CEST on 25 Oct
    await addLead(c, { at: new Date('2026-10-25T22:30:00Z') }); // 23:30 CET on 25 Oct
    const o = await getOverview(staff, c.projectId, new Date('2026-11-10T12:00:00Z'));
    expect(o.perDay).toHaveLength(30);
    expect(o.perDay[0]?.date).toBe('2026-10-12');
    expect(o.perDay.at(-1)?.date).toBe('2026-11-10');
    expect(new Set(o.perDay.map((d) => d.date)).size).toBe(30);
    expect(o.perDay.find((d) => d.date === '2026-10-25')?.count).toBe(2);
    expect(o.kpis.leads30).toBe(2);
  });

  it('test leads count for nobody, staff included', async () => {
    const c = await newClient('Asia/Dubai');
    await addLead(c, {
      at: T,
      status: 'sql',
      chat: [
        { dir: 'in', at: T },
        { dir: 'out', at: plus(T, 30) },
      ],
    });
    await addLead(c, {
      at: plus(NOW, -10),
      isTest: true,
      source: 'website',
      chat: [
        { dir: 'in', at: plus(NOW, -9) },
        { dir: 'out', at: plus(NOW, -8) },
      ],
    });
    const viewer = await seedUser({ role: 'client', projectId: c.projectId });
    for (const who of [staff, session(viewer.id, 'client', [c.projectId])]) {
      const o = await getOverview(who, c.projectId, NOW);
      expect(o.kpis).toMatchObject({
        leads30: 1,
        newToday: 0,
        medianFirstReplyMin: 30,
        sqlRate: 1,
        mqlRate: 1,
      });
      expect(o.bySource).toEqual([{ source: 'meta', count: 1 }]);
      if (o.view === 'client') {
        expect(o.kpis.waiting).toBe(0);
        expect(o.waiting).toEqual([]);
      }
    }
  });

  it('a client with no leads: zeros, nulls and 30 empty days', async () => {
    const c = await newClient('Africa/Casablanca');
    const viewer = await seedUser({ role: 'client', projectId: c.projectId });
    const o = clientOf(
      await getOverview(session(viewer.id, 'client', [c.projectId]), c.projectId, NOW),
    );
    expect(o.kpis).toEqual({
      leads30: 0,
      newToday: 0,
      medianFirstReplyMin: null,
      mqlRate: null,
      sqlRate: null,
      waiting: 0,
    });
    expect(o.perDay.every((d) => d.count === 0)).toBe(true);
    expect(o.bySource).toEqual([]);
    expect(o.waiting).toEqual([]);
  });
});
