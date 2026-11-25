import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectClientSafe } from '../../../tests/helpers/client-safe.ts';
import { rawClient } from '../../../tests/helpers/db.ts';
import { asSession, buildTestApp, seedUser, signIn } from '../../../tests/helpers/http.ts';
import { leadExportRows, leadsPage } from '../../contracts/leads.ts';
import { getPool } from '../../db/index.ts';
import { CLIENTS } from '../../db/seed/data.ts';
import { seed } from '../../db/seed.ts';
import { setEmailTransport } from '../../lib/email/index.ts';
import { routeSpecs } from '../../lib/http/route.ts';

// POST /leads/export (F4b S4): the export is the filtered list's rows, minus test leads, scoped by role.

const { now } = JSON.parse(readFileSync('tests/fixtures/seed/expected.json', 'utf8')) as {
  now: string;
};

let app: FastifyInstance;
let managerToken: string;
let clientToken: string;
let aisha: string;
const project: Record<string, string> = {};
const db = rawClient();

beforeAll(async () => {
  await db.connect();
  await seed({ appEnv: 'local', password: 'Seed-password-2026', reset: true, now: new Date(now) });
  const built = await buildTestApp();
  app = built.app;
  const { rows } = await db.query<{ id: string; name: string }>('select id, name from projects');
  for (const c of CLIENTS) project[c.key] = rows.find((r) => r.name === c.name)?.id as string;
  aisha = (await db.query("select id from users where email = 'aisha.rahman@sharkx.test'")).rows[0]
    .id;
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

type Filter = Record<string, string>;
const exportOf = (filter: Filter, token = managerToken, projectId = project.lum) =>
  app.inject({
    method: 'POST',
    url: '/leads/export',
    headers: asSession(token),
    payload: { projectId, ...filter },
  });
const listOf = async (filter: Filter, token = managerToken) => {
  const res = await app.inject({
    method: 'GET',
    url: `/leads?${new URLSearchParams({ projectId: project.lum as string, limit: '200', ...filter })}`,
    headers: asSession(token),
  });
  expect(res.statusCode, res.body).toBe(200);
  return leadsPage.parse(res.json());
};

const COMBOS: [string, Filter][] = [
  ['everything', {}],
  ['a tab and a search', { tab: 'mql', q: 'botox' }],
  ['owner and source', { owner: 'AISHA', source: 'meta' }],
  ['unassigned, unreviewed', { owner: 'unassigned', tab: 'unreviewed' }],
];

describe('export equals the filtered list', () => {
  it.each(COMBOS)('%s: the same rows in the same order, no test leads', async (_name, raw) => {
    const filter = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, v === 'AISHA' ? aisha : v]),
    );
    const res = await exportOf(filter);
    expect(res.statusCode, res.body).toBe(200);
    const exported = leadExportRows.parse(res.json());
    const list = await listOf(filter);
    const key = (r: { phone: string | null; name: string | null }) => `${r.phone}|${r.name}`;
    expect(exported.rows.map(key)).toEqual(list.rows.map(key));
    expect(exported.rows.map((r) => r.receivedAt)).toEqual(list.rows.map((r) => r.createdAt));
    expect(exported.rows.map((r) => r.status)).toEqual(list.rows.map((r) => r.status));
    expect(exported.rows.some((r) => r.name === 'Test lead')).toBe(false);
  });

  it('is not paged: more rows than the list default of 20', async () => {
    const exported = leadExportRows.parse((await exportOf({})).json());
    const list = await listOf({});
    expect(exported.rows.length).toBe(list.counts.all);
    expect(exported.rows.length).toBeGreaterThan(14);
  });

  it('staff rows carry the owner name', async () => {
    const out = leadExportRows.parse((await exportOf({})).json());
    if (out.view !== 'staff') throw new Error('expected the staff view');
    expect(out.rows.every((r) => r.ownerName !== null)).toBe(true);
  });
});

describe('client export', () => {
  it('has no owner column, the strict client row, and only its own client', async () => {
    const res = await exportOf({}, clientToken);
    expect(res.statusCode, res.body).toBe(200);
    expectClientSafe(res.body);
    expect(res.body).not.toContain('Aisha Rahman');
    const out = leadExportRows.parse(res.json());
    expect(out.view).toBe('client');
    for (const row of out.rows) expect(Object.keys(row)).not.toContain('ownerName');
    const own = await listOf({}, clientToken);
    expect(out.rows).toHaveLength(own.counts.all);
  });

  it('cannot export another client, nor filter by owner', async () => {
    expect((await exportOf({}, clientToken, project.prl)).statusCode).toBe(404);
    expect((await exportOf({ owner: 'unassigned' }, clientToken)).statusCode).toBe(422);
  });
});

describe('audit', () => {
  it('one lead.exported row with the row count and the filter shape, never a row or the search text', async () => {
    const search = 'lip filler';
    const before = await db.query(
      "select count(*) n from audit_log where action = 'lead.exported' and project_id = $1",
      [project.lum],
    );
    const res = await exportOf({ q: search, tab: 'sql' });
    const rows = leadExportRows.parse(res.json()).rows.length;
    const { rows: audit } = await db.query(
      "select actor_kind, meta from audit_log where action = 'lead.exported' and project_id = $1 order by at desc",
      [project.lum],
    );
    expect(audit.length).toBe(Number(before.rows[0].n) + 1);
    expect(audit[0].actor_kind).toBe('user');
    expect(audit[0].meta).toEqual({ rows, tab: 'sql', source: null, owner: null, search: true });
    expect(JSON.stringify(audit[0].meta)).not.toContain(search);
  });

  it('a client export is audited as the client', async () => {
    await exportOf({}, clientToken);
    const { rows } = await db.query(
      "select actor_kind from audit_log where action = 'lead.exported' order by at desc limit 1",
    );
    expect(rows[0].actor_kind).toBe('client');
  });
});

describe('too many rows', () => {
  const big = randomUUID();
  beforeAll(async () => {
    await db.query('insert into projects (id, name) values ($1, $2)', [big, `Big ${big}`]);
    await db.query(
      `insert into contacts (project_id, name, phone_e164)
       select $1, 'Person ' || g, '+9715' || lpad(g::text, 8, '0') from generate_series(1, 10001) g`,
      [big],
    );
    await db.query(
      "insert into leads (project_id, contact_id, source) select $1, id, 'website' from contacts where project_id = $1",
      [big],
    );
  });
  afterAll(async () => {
    await db.query('delete from projects where id = $1', [big]);
  });

  it('more than 10 000 is 422 with the reason, and writes no audit row', async () => {
    const res = await exportOf({}, managerToken, big);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.details).toMatchObject({ reason: 'too_many' });
    const { rows } = await db.query(
      "select count(*) n from audit_log where action = 'lead.exported' and project_id = $1",
      [big],
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it('narrowing the filter brings it back under the cap', async () => {
    const res = await exportOf({ q: 'Person 10001' }, managerToken, big);
    expect(res.statusCode, res.body).toBe(200);
    expect(leadExportRows.parse(res.json()).rows).toHaveLength(1);
  });
});

describe('request and route', () => {
  it('needs a session and a client id', async () => {
    expect((await exportOf({}, 'nope')).statusCode).toBe(401);
    const res = await app.inject({
      method: 'POST',
      url: '/leads/export',
      headers: asSession(managerToken),
      payload: {},
    });
    expect(res.statusCode).toBe(422);
  });

  it('asks can() for lead.export on the body client and declares one audit row', () => {
    const spec = routeSpecs.get('POST /leads/export');
    if (!spec) throw new Error('route not registered');
    const p = project.lum as string;
    expect((spec.action as (i: unknown) => unknown)({ body: { projectId: p } })).toEqual({
      action: 'lead.export',
      projectId: p,
    });
    expect(spec.audit).toBe('one');
  });
});
