import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectClientSafe } from '../../../tests/helpers/client-safe.ts';
import { rawClient } from '../../../tests/helpers/db.ts';
import { asSession, buildTestApp, seedUser, signIn } from '../../../tests/helpers/http.ts';
import { getPool } from '../../db/index.ts';
import { CLIENTS, REASONS } from '../../db/seed/data.ts';
import { seed } from '../../db/seed.ts';
import { setEmailTransport } from '../../lib/email/index.ts';
import { routeSpecs } from '../../lib/http/route.ts';

// POST /leads/:id/status (F4b S6). Mappings are inserted here: the seed has none (D9).

const { now } = JSON.parse(readFileSync('tests/fixtures/seed/expected.json', 'utf8')) as {
  now: string;
};

let app: FastifyInstance;
let managerToken: string;
let clientToken: string;
let managerId: string;
let clientUserId: string;
const project: Record<string, string> = {};
const db = rawClient();

beforeAll(async () => {
  await db.connect();
  await seed({ appEnv: 'local', password: 'Seed-password-2026', reset: true, now: new Date(now) });
  const built = await buildTestApp();
  app = built.app;
  const { rows } = await db.query<{ id: string; name: string }>('select id, name from projects');
  for (const c of CLIENTS) project[c.key] = rows.find((r) => r.name === c.name)?.id as string;
  const manager = await seedUser({ role: 'manager' });
  managerId = manager.id;
  managerToken = (await signIn(app, built.mail, manager.email)).token;
  const client = await seedUser({ role: 'client', projectId: project.lum });
  clientUserId = client.id;
  clientToken = (await signIn(app, built.mail, client.email)).token;
});
afterAll(async () => {
  await app.close();
  await db.end();
  setEmailTransport(undefined);
  await getPool().end();
});

async function setMappings(
  projectId: string,
  rows: { status: string; meta?: string; google?: string; enabled?: boolean }[],
) {
  await db.query('delete from conversion_mappings where project_id = $1', [projectId]);
  for (const r of rows) {
    await db.query(
      'insert into conversion_mappings (project_id, status, meta_event, google_event, enabled) values ($1,$2,$3,$4,$5)',
      [projectId, r.status, r.meta ?? null, r.google ?? null, r.enabled ?? true],
    );
  }
}

/** A fresh unreviewed lead (status_seq 0) so every test starts from the same state. */
async function newLead(key = 'lum'): Promise<string> {
  const contact = await db.query<{ id: string }>(
    'insert into contacts (project_id, name, phone_e164) values ($1, $2, $3) returning id',
    [project[key], 'Mark Test', `+9715${Math.floor(1e7 + Math.random() * 9e7)}`],
  );
  const lead = await db.query<{ id: string }>(
    "insert into leads (project_id, contact_id, source) values ($1, $2, 'website') returning id",
    [project[key], contact.rows[0]?.id],
  );
  return lead.rows[0]?.id as string;
}

const mark = (
  id: string,
  body: { to: string; reason?: string },
  token = managerToken,
  projectId = project.lum,
) =>
  app.inject({
    method: 'POST',
    url: `/leads/${id}/status`,
    headers: asSession(token),
    payload: { projectId, ...body },
  });

const one = async <T>(sql: string, args: unknown[]) => (await db.query(sql, args)).rows as T[];
const auditRows = (id: string) =>
  one<{ actor_kind: string; actor_id: string; meta: Record<string, unknown> }>(
    "select actor_kind, actor_id, meta from audit_log where entity_id = $1 and action = 'lead.status_changed' order by at",
    [id],
  );
const events = (id: string) =>
  one<{ actor_kind: string; actor_id: string; data: Record<string, unknown> }>(
    "select actor_kind, actor_id, data from lead_events where lead_id = $1 and kind = 'status_changed' order by at, id",
    [id],
  );
const outbox = (id: string) =>
  one<{ status: string; status_seq: number; platform: string; state: string }>(
    'select status, status_seq, platform, state from conversion_events where lead_id = $1 order by status_seq, platform::text',
    [id],
  );
const state = async (id: string) =>
  (
    await one<{ status: string; status_seq: number; reason: string | null }>(
      'select status, status_seq, reason from leads where id = $1',
      [id],
    )
  )[0];
const feed = async (id: string) =>
  Number(
    (await db.query("select count(*) n from change_feed where ref_id = $1 and kind = 'lead'", [id]))
      .rows[0].n,
  );

describe('a staff mark', () => {
  it('writes status, event, audit, change feed and one pending row per enabled mapping and platform', async () => {
    await setMappings(project.lum as string, [
      { status: 'mql', meta: 'Lead', google: 'qualified_lead' },
      { status: 'sql', meta: 'QualifiedLead', enabled: false },
    ]);
    const id = await newLead();
    const feedBefore = await feed(id);
    const res = await mark(id, { to: 'mql' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      view: 'staff',
      outboxQueued: 2,
      lead: { id, status: 'mql' },
    });

    expect(await state(id)).toEqual({ status: 'mql', status_seq: 1, reason: null });
    expect(await events(id)).toEqual([
      { actor_kind: 'user', actor_id: managerId, data: { from: 'new', to: 'mql' } },
    ]);
    const audit = await auditRows(id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_kind: 'user', actor_id: managerId });
    expect(audit[0]?.meta).toEqual({ from: 'new', to: 'mql', statusSeq: 1 });
    expect(await outbox(id)).toEqual([
      { status: 'mql', status_seq: 1, platform: 'google', state: 'pending' },
      { status: 'mql', status_seq: 1, platform: 'meta', state: 'pending' },
    ]);
    expect(await feed(id)).toBe(feedBefore + 1);
  });

  it('a disabled mapping queues nothing; no mapping at all is outboxQueued 0', async () => {
    const id = await newLead();
    expect((await mark(id, { to: 'sql' })).json().outboxQueued).toBe(0); // sql is disabled above
    expect(await outbox(id)).toEqual([]);
    await setMappings(project.lum as string, []);
    const other = await newLead();
    const res = await mark(other, { to: 'mql' });
    expect(res.json()).toMatchObject({ outboxQueued: 0, lead: { status: 'mql' } });
    expect(await outbox(other)).toEqual([]);
  });

  it('a mapping with only one platform event queues only that platform', async () => {
    await setMappings(project.lum as string, [{ status: 'mql', meta: 'Lead' }]);
    const id = await newLead();
    expect((await mark(id, { to: 'mql' })).json().outboxQueued).toBe(1);
    expect((await outbox(id)).map((o) => o.platform)).toEqual(['meta']);
  });

  it('re-marking moves the sequence on and queues a new row each time', async () => {
    await setMappings(project.lum as string, [
      { status: 'mql', meta: 'Lead' },
      { status: 'sql', meta: 'QualifiedLead' },
    ]);
    const id = await newLead();
    for (const to of ['mql', 'sql', 'mql']) expect((await mark(id, { to })).statusCode).toBe(200);
    expect((await state(id))?.status_seq).toBe(3);
    expect((await outbox(id)).map((o) => [o.status, o.status_seq])).toEqual([
      ['mql', 1],
      ['sql', 2],
      ['mql', 3],
    ]);
    expect(await events(id)).toHaveLength(3);
    expect(await auditRows(id)).toHaveLength(3);
  });
});

describe('a client mark', () => {
  it('is recorded as the client, and the response is client-safe', async () => {
    await setMappings(project.lum as string, [{ status: 'sql', meta: 'QualifiedLead' }]);
    const id = await newLead();
    const res = await mark(id, { to: 'sql' }, clientToken);
    expect(res.statusCode, res.body).toBe(200);
    expectClientSafe(res.body);
    expect(res.json()).toMatchObject({ view: 'client', outboxQueued: 1, lead: { status: 'sql' } });
    expect((await auditRows(id))[0]).toMatchObject({
      actor_kind: 'client',
      actor_id: clientUserId,
    });
    expect((await events(id))[0]).toMatchObject({ actor_kind: 'client', actor_id: clientUserId });
    expect(await outbox(id)).toHaveLength(1);
  });

  it("cannot mark another client's lead, by its client id or this one", async () => {
    const id = await newLead('prl');
    expect((await mark(id, { to: 'mql' }, clientToken, project.prl)).statusCode).toBe(404);
    expect((await mark(id, { to: 'mql' }, clientToken, project.lum)).statusCode).toBe(404);
    expect((await state(id))?.status).toBe('new');
  });
});

describe('Not qualified needs a reason from the client list', () => {
  it('without a reason, or with one that is not in the list: 422 and nothing changes', async () => {
    const id = await newLead();
    for (const body of [{ to: 'not_qualified' }, { to: 'not_qualified', reason: 'Because' }]) {
      expect((await mark(id, body)).statusCode, JSON.stringify(body)).toBe(422);
    }
    expect(await state(id)).toMatchObject({ status: 'new', status_seq: 0 });
    expect(await events(id)).toEqual([]);
    expect(await auditRows(id)).toEqual([]);
  });

  it('a listed reason is stored on the lead, the event and the audit row', async () => {
    const id = await newLead();
    const reason = REASONS[0] as string;
    const res = await mark(id, { to: 'not_qualified', reason });
    expect(res.json()).toMatchObject({ lead: { status: 'not_qualified', reason } });
    expect((await events(id))[0]?.data).toEqual({ from: 'new', to: 'not_qualified', reason });
    expect((await auditRows(id))[0]?.meta).toMatchObject({ reason });
  });

  it('a reason sent with MQL is dropped; leaving Not qualified clears it', async () => {
    const id = await newLead();
    await mark(id, { to: 'not_qualified', reason: REASONS[1] as string });
    const res = await mark(id, { to: 'mql', reason: 'ignored' });
    expect(res.json().lead.reason).toBeNull();
    expect(await state(id)).toMatchObject({ status: 'mql', reason: null });
  });

  it('a new reason on a Not qualified lead is a change; the same one is not', async () => {
    const id = await newLead();
    await mark(id, { to: 'not_qualified', reason: REASONS[0] as string });
    expect((await mark(id, { to: 'not_qualified', reason: REASONS[1] as string })).statusCode).toBe(
      200,
    );
    expect((await state(id))?.status_seq).toBe(2);
  });
});

describe('the same status again', () => {
  it('changes nothing but writes one audit row marked noop', async () => {
    await setMappings(project.lum as string, [{ status: 'mql', meta: 'Lead' }]);
    const id = await newLead();
    await mark(id, { to: 'mql' });
    const res = await mark(id, { to: 'mql' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ outboxQueued: 0, lead: { status: 'mql' } });
    expect(await state(id)).toMatchObject({ status_seq: 1 });
    expect(await events(id)).toHaveLength(1);
    expect(await outbox(id)).toHaveLength(1);
    const audit = await auditRows(id);
    expect(audit).toHaveLength(2);
    expect(audit[1]?.meta).toMatchObject({ noop: true, to: 'mql' });
  });
});

describe('what can be marked', () => {
  it('a test lead, an unknown id and a lead of another client are 404 for staff too', async () => {
    const test = await one<{ id: string }>(
      'select id from leads where project_id = $1 and is_test',
      [project.lum],
    );
    expect((await mark(test[0]?.id as string, { to: 'mql' })).statusCode).toBe(404);
    expect((await mark(randomUUID(), { to: 'mql' })).statusCode).toBe(404);
    const other = await newLead('prl');
    expect((await mark(other, { to: 'mql' })).statusCode).toBe(404);
  });

  it("'new' is not a target; the body needs a client id", async () => {
    const id = await newLead();
    expect((await mark(id, { to: 'new' })).statusCode).toBe(422);
    const res = await app.inject({
      method: 'POST',
      url: `/leads/${id}/status`,
      headers: asSession(managerToken),
      payload: { to: 'mql' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('needs a session', async () => {
    expect((await mark(await newLead(), { to: 'mql' }, 'nope')).statusCode).toBe(401);
  });
});

describe('route declaration', () => {
  it('asks can() for lead.mark on the body client and declares one audit row', () => {
    const spec = routeSpecs.get('POST /leads/:id/status');
    if (!spec) throw new Error('route not registered');
    const p = project.lum as string;
    expect((spec.action as (i: unknown) => unknown)({ body: { projectId: p } })).toEqual({
      action: 'lead.mark',
      projectId: p,
    });
    expect(spec.audit).toBe('one');
  });
});
