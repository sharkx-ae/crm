import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectClientSafe } from '../../../tests/helpers/client-safe.ts';
import { rawClient } from '../../../tests/helpers/db.ts';
import { asSession, buildTestApp, seedUser, signIn } from '../../../tests/helpers/http.ts';
import { clientLeadRow, type LeadsPage, leadsPage } from '../../contracts/leads.ts';
import { getPool } from '../../db/index.ts';
import { buildSeed, type SeedLead } from '../../db/seed/build.ts';
import { CLIENTS } from '../../db/seed/data.ts';
import { seed } from '../../db/seed.ts';
import { setEmailTransport } from '../../lib/email/index.ts';
import { likePattern, phoneDigits } from './filters.ts';

// GET /leads on the seed (F4b S1, S2, S7). The expected rows come from buildSeed, not from the query under test.

const expected = JSON.parse(readFileSync('tests/fixtures/seed/expected.json', 'utf8')) as {
  now: string;
  clients: Record<string, { byStatus: Record<'new' | 'mql' | 'sql' | 'not_qualified', number> }>;
};
const NOW = new Date(expected.now);
const plan = buildSeed(NOW);
const realOf = (key: string): SeedLead[] =>
  plan.clients.find((c) => c.client.key === key)?.leads.filter((l) => !l.isTest) ?? [];

let app: FastifyInstance;
let managerToken: string;
let clientToken: string;
const project: Record<string, string> = {};
const manager: Record<string, string> = {};
const db = rawClient();

beforeAll(async () => {
  await db.connect();
  await seed({ appEnv: 'local', password: 'Seed-password-2026', reset: true, now: NOW });
  const built = await buildTestApp();
  app = built.app;
  const { rows } = await db.query<{ id: string; name: string }>('select id, name from projects');
  for (const c of CLIENTS) project[c.key] = rows.find((r) => r.name === c.name)?.id as string;
  const managers = await db.query<{ id: string; email: string }>(
    "select id, email from users where email like '%@sharkx.test'",
  );
  for (const m of managers.rows) manager[m.email.split('.')[0] as string] = m.id;
  managerToken = (await signIn(app, built.mail, (await seedUser({ role: 'manager' })).email)).token;
  clientToken = (
    await signIn(
      app,
      built.mail,
      (
        await seedUser({ role: 'client', projectId: project.lum })
      ).email,
    )
  ).token;
});
afterAll(async () => {
  await app.close();
  await db.end();
  setEmailTransport(undefined);
  await getPool().end();
});

const get = (params: Record<string, string>, token = managerToken) =>
  app.inject({
    method: 'GET',
    url: `/leads?${new URLSearchParams(params)}`,
    headers: asSession(token),
  });

async function page(params: Record<string, string>, token = managerToken): Promise<LeadsPage> {
  const res = await get(params, token);
  expect(res.statusCode, res.body).toBe(200);
  return leadsPage.parse(res.json());
}

const phones = (p: LeadsPage) => p.rows.map((r) => r.phone).sort();
const phonesOf = (ls: SeedLead[]) => ls.map((l) => l.phoneE164).sort();
const matching = (key: string, q: string) =>
  realOf(key).filter((l) =>
    [l.name, l.campaign].some((v) => v.toLowerCase().includes(q.toLowerCase())),
  );

describe('tab counts', () => {
  it('equal the hand-checked seed numbers for every client, and add up', async () => {
    for (const c of CLIENTS) {
      const by = expected.clients[c.key]?.byStatus;
      const p = await page({ projectId: project[c.key] as string });
      expect(p.counts, c.name).toEqual({
        all: realOf(c.key).length,
        unreviewed: by?.new,
        mql: by?.mql,
        sql: by?.sql,
        not_qualified: by?.not_qualified,
      });
      expect(p.counts.all).toBe(
        p.counts.unreviewed + p.counts.mql + p.counts.sql + p.counts.not_qualified,
      );
      expect(p.total).toBe(p.counts.all);
    }
  });

  it('do not change with the tab; total and rows follow the tab', async () => {
    const all = await page({ projectId: project.lum as string });
    for (const tab of ['unreviewed', 'mql', 'sql', 'not_qualified'] as const) {
      const p = await page({ projectId: project.lum as string, tab });
      const status = tab === 'unreviewed' ? 'new' : tab;
      expect(p.counts, tab).toEqual(all.counts);
      expect(p.total, tab).toBe(all.counts[tab]);
      expect(phones(p), tab).toEqual(phonesOf(realOf('lum').filter((l) => l.status === status)));
      expect(p.rows.every((r) => r.status === status)).toBe(true);
    }
  });

  it('follow the filters', async () => {
    const p = await page({ projectId: project.lum as string, q: 'botox', tab: 'mql' });
    const hits = matching('lum', 'botox');
    expect(p.counts.all).toBe(hits.length);
    expect(p.counts.mql).toBe(hits.filter((l) => l.status === 'mql').length);
    expect(p.total).toBe(p.counts.mql);
  });
});

describe('filters', () => {
  it('source', async () => {
    const source = realOf('lum')[0]?.source as string;
    const p = await page({ projectId: project.lum as string, source });
    expect(phones(p)).toEqual(phonesOf(realOf('lum').filter((l) => l.source === source)));
  });

  it('owner, and owner combined with source', async () => {
    const aisha = realOf('lum').filter((l) => l.ownerIndex === 0);
    const p = await page({ projectId: project.lum as string, owner: manager.aisha as string });
    expect(aisha.length).toBeGreaterThan(0);
    expect(phones(p)).toEqual(phonesOf(aisha));
    const source = aisha[0]?.source as string;
    const both = await page({
      projectId: project.lum as string,
      owner: manager.aisha as string,
      source,
    });
    expect(phones(both)).toEqual(phonesOf(aisha.filter((l) => l.source === source)));
  });

  it("owner 'unassigned'", async () => {
    const lead = realOf('lum')[2] as SeedLead;
    const where = 'where project_id = $1 and external_id = $2';
    const externalId = `seed-lum-${plan.clients[0]?.leads.indexOf(lead)}`;
    const before = await db.query(`select owner_id from leads ${where}`, [project.lum, externalId]);
    await db.query(`update leads set owner_id = null ${where}`, [project.lum, externalId]);
    const p = await page({ projectId: project.lum as string, owner: 'unassigned' });
    expect(phones(p)).toEqual([lead.phoneE164]);
    expect(p.counts.all).toBe(1);
    await db.query('update leads set owner_id = $3 where project_id = $1 and external_id = $2', [
      project.lum,
      externalId,
      before.rows[0].owner_id,
    ]);
  });

  it('search on name and campaign, any case', async () => {
    const name = realOf('lum')[0]?.name.slice(0, 5).toUpperCase() as string;
    expect(phones(await page({ projectId: project.lum as string, q: name }))).toEqual(
      phonesOf(matching('lum', name)),
    );
    const byCampaign = await page({ projectId: project.lum as string, q: 'lip filler' });
    expect(byCampaign.rows.length).toBeGreaterThan(0);
    expect(phones(byCampaign)).toEqual(phonesOf(matching('lum', 'lip filler')));
  });

  it('search on a phone, written the local way or with +971', async () => {
    const lead = realOf('lum')[0] as SeedLead;
    const rest = lead.phoneE164.slice(4); // after +971
    const local = `0${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`;
    for (const q of [local, `+971 ${rest}`, `00971${rest}`, lead.phoneE164]) {
      expect(phones(await page({ projectId: project.lum as string, q })), q).toEqual([
        lead.phoneE164,
      ]);
    }
    expect(phoneDigits('050 412')).toBe('50412');
    expect(phoneDigits('+971 50 412')).toBe('97150412');
    expect(phoneDigits('Botox 12')).toBeNull();
  });

  it('% and _ are literal', async () => {
    for (const q of ['%', '_', 'bot_x']) {
      expect((await page({ projectId: project.lum as string, q })).rows, q).toEqual([]);
    }
    const phone = realOf('lum')[1]?.phoneE164 as string;
    const rename = (campaign: string) =>
      db.query(
        `update leads set campaign = $3 from contacts c
         where c.id = leads.contact_id and leads.project_id = $1 and c.phone_e164 = $2`,
        [project.lum, phone, campaign],
      );
    await rename('50% off');
    const p = await page({ projectId: project.lum as string, q: '50%' });
    expect(phones(p)).toEqual([phone]);
    await rename(realOf('lum')[1]?.campaign as string);
    expect(likePattern('a\\b%c_')).toBe('%a\\\\b\\%c\\_%');
  });

  it('sources list what the client has, whatever is filtered', async () => {
    const want = [...new Set(realOf('lum').map((l) => l.source))].sort();
    const p = await page({
      projectId: project.lum as string,
      q: 'nothing matches this',
      tab: 'sql',
    });
    expect(p.rows).toEqual([]);
    expect([...p.sources].sort()).toEqual(want);
  });
});

describe('test leads', () => {
  it('are in no row, count or search, for staff and client', async () => {
    const { rows } = await db.query<{ id: string }>(
      'select id from leads where project_id = $1 and is_test',
      [project.lum],
    );
    expect(rows).toHaveLength(1);
    for (const token of [managerToken, clientToken]) {
      const all = await page({ projectId: project.lum as string, limit: '200' }, token);
      expect(all.rows.map((r) => r.id)).not.toContain(rows[0]?.id);
      expect(all.rows).toHaveLength(all.counts.all);
      const search = await page({ projectId: project.lum as string, q: 'Test lead' }, token);
      expect(search.rows).toEqual([]);
      expect(search.counts.all).toBe(0);
    }
  });
});

describe('order and paging', () => {
  const bulk = randomUUID();
  beforeAll(async () => {
    await db.query('insert into projects (id, name) values ($1, $2)', [bulk, `Paging ${bulk}`]);
    await db.query(
      `insert into contacts (project_id, name, phone_e164)
       select $1, 'Person ' || g, '+97150' || lpad(g::text, 7, '0') from generate_series(1, 230) g`,
      [bulk],
    );
    // Pairs share a timestamp, so the id has to settle the order.
    await db.query(
      `insert into leads (project_id, contact_id, source, created_at)
       select $1, id, 'website', timestamptz '2026-11-01' + (substr(phone_e164, 7)::int / 2) * interval '1 minute'
       from contacts where project_id = $1`,
      [bulk],
    );
  });

  it('newest first, ties by id', async () => {
    const p = await page({ projectId: bulk, limit: '40' });
    const { rows } = await db.query<{ id: string }>(
      'select id from leads where project_id = $1 order by created_at desc, id desc limit 40',
      [bulk],
    );
    expect(p.rows.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  it('20 by default, grows with limit, stops at 200; counts and total stay the full numbers', async () => {
    for (const [limit, n] of [
      [undefined, 20],
      ['40', 40],
      ['200', 200],
    ] as const) {
      const p = await page({ projectId: bulk, ...(limit ? { limit } : {}) });
      expect(p.rows, String(limit)).toHaveLength(n);
      expect(p.total).toBe(230);
      expect(p.counts.all).toBe(230);
    }
    expect((await get({ projectId: bulk, limit: '201' })).statusCode).toBe(422);
  });
});

describe('staff view', () => {
  it('rows carry the owner name; the filter choices are the active managers', async () => {
    const p = await page({ projectId: project.lum as string });
    if (p.view !== 'staff') throw new Error('expected the staff view');
    const names = ['Aisha Rahman', 'Rami Haddad', 'Sana Idrissi'];
    expect(p.rows.every((r) => names.includes(r.ownerName as string))).toBe(true);
    for (const name of names) {
      expect(p.owners.find((o) => o.name === name)).toMatchObject({ active: true });
    }
    // Invited and without a lead here: not a choice.
    expect(p.owners.map((o) => o.id)).not.toContain(manager.yara);
  });

  it('a disabled manager who still owns a lead stays a choice, marked inactive', async () => {
    await db.query("update users set status = 'disabled' where id = $1", [manager.sana]);
    const p = await page({ projectId: project.lum as string });
    await db.query("update users set status = 'active' where id = $1", [manager.sana]);
    if (p.view !== 'staff') throw new Error('expected the staff view');
    expect(p.owners.find((o) => o.id === manager.sana)).toMatchObject({ active: false });
  });
});

describe('client view', () => {
  it('only the strict client fields, no owner names or choices', async () => {
    const res = await get({ projectId: project.lum as string, limit: '200' }, clientToken);
    expect(res.statusCode).toBe(200);
    expectClientSafe(res.body);
    expect(res.body).not.toContain('Aisha Rahman');
    const body = res.json();
    expect(body.view).toBe('client');
    expect(body.rows).toHaveLength(realOf('lum').length);
    for (const row of body.rows) expect(clientLeadRow.safeParse(row).success).toBe(true);
  });

  it('may not filter by owner', async () => {
    for (const owner of ['unassigned', manager.aisha as string]) {
      const res = await get({ projectId: project.lum as string, owner }, clientToken);
      expect(res.statusCode, owner).toBe(422);
    }
  });

  it('another client is not found', async () => {
    expect((await get({ projectId: project.prl as string }, clientToken)).statusCode).toBe(404);
  });

  it('needs a session and a client id', async () => {
    expect((await get({ projectId: project.lum as string }, 'nope')).statusCode).toBe(401);
    expect((await get({})).statusCode).toBe(422);
  });
});
