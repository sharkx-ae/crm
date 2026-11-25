import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rawClient } from '../../../tests/helpers/db.ts';
import {
  asSession,
  buildTestApp,
  seedUser,
  signIn,
  signInSuperAdmin,
} from '../../../tests/helpers/http.ts';
import { getPool } from '../../db/index.ts';
import { CLIENTS } from '../../db/seed/data.ts';
import { seed } from '../../db/seed.ts';
import { setEmailTransport } from '../../lib/email/index.ts';
import { routeSpecs } from '../../lib/http/route.ts';

// POST /leads/:id/assign (F4b S3). Staff only; the owner is an active manager or null.

const { now } = JSON.parse(readFileSync('tests/fixtures/seed/expected.json', 'utf8')) as {
  now: string;
};

let app: FastifyInstance;
let managerToken: string;
let managerId: string;
let superId: string;
let superToken: string;
let clientToken: string;
let clientUserId: string;
let activeOwner: string;
let disabledManager: string;
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
  const superSession = await signInSuperAdmin(app, built.mail);
  superId = superSession.id;
  superToken = superSession.token;
  const client = await seedUser({ role: 'client', projectId: project.lum });
  clientUserId = client.id;
  clientToken = (await signIn(app, built.mail, client.email)).token;
  activeOwner = (await seedUser({ role: 'manager' })).id;
  disabledManager = (await seedUser({ role: 'manager', status: 'disabled' })).id;
});
afterAll(async () => {
  await app.close();
  await db.end();
  setEmailTransport(undefined);
  await getPool().end();
});

async function newLead(key = 'lum', ownerId: string | null = null): Promise<string> {
  const contact = await db.query<{ id: string }>(
    'insert into contacts (project_id, name, phone_e164) values ($1, $2, $3) returning id',
    [project[key], 'Assign Test', `+9715${Math.floor(1e7 + Math.random() * 9e7)}`],
  );
  const lead = await db.query<{ id: string }>(
    "insert into leads (project_id, contact_id, source, owner_id) values ($1, $2, 'website', $3) returning id",
    [project[key], contact.rows[0]?.id, ownerId],
  );
  return lead.rows[0]?.id as string;
}

const assign = (
  id: string,
  ownerId: string | null,
  token = managerToken,
  projectId = project.lum,
) =>
  app.inject({
    method: 'POST',
    url: `/leads/${id}/assign`,
    headers: asSession(token),
    payload: { projectId, ownerId },
  });

const rows = async <T>(sql: string, args: unknown[]) => (await db.query(sql, args)).rows as T[];
const ownerOf = async (id: string) =>
  (await rows<{ owner_id: string | null }>('select owner_id from leads where id = $1', [id]))[0]
    ?.owner_id;
const events = (id: string) =>
  rows<{ actor_kind: string; actor_id: string; data: Record<string, unknown> }>(
    "select actor_kind, actor_id, data from lead_events where lead_id = $1 and kind = 'assigned' order by at, id",
    [id],
  );
const audits = (id: string) =>
  rows<{ actor_kind: string; meta: Record<string, unknown> }>(
    "select actor_kind, meta from audit_log where entity_id = $1 and action = 'lead.assigned' order by at",
    [id],
  );

describe('assigning', () => {
  it('an active manager becomes the owner; event, audit and change feed follow', async () => {
    const id = await newLead();
    const res = await assign(id, activeOwner);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().lead).toMatchObject({ id, ownerId: activeOwner });
    expect(res.json().lead.ownerName).toBe('Test User');
    expect(await ownerOf(id)).toBe(activeOwner);
    expect(await events(id)).toEqual([
      { actor_kind: 'user', actor_id: managerId, data: { from: null, to: activeOwner } },
    ]);
    const audit = await audits(id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_kind: 'user', meta: { from: null, to: activeOwner } });
    const feed = await rows<{ n: string }>(
      "select count(*) n from change_feed where ref_id = $1 and kind = 'lead'",
      [id],
    );
    expect(Number(feed[0]?.n)).toBe(1);
  });

  it('a new owner replaces the old one and the event keeps both', async () => {
    const id = await newLead('lum', activeOwner);
    expect((await assign(id, managerId)).statusCode).toBe(200);
    expect((await events(id))[0]?.data).toEqual({ from: activeOwner, to: managerId });
  });

  it('null unassigns', async () => {
    const id = await newLead('lum', activeOwner);
    const res = await assign(id, null);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().lead).toMatchObject({ ownerId: null, ownerName: null });
    expect(await ownerOf(id)).toBeNull();
    expect((await events(id))[0]?.data).toEqual({ from: activeOwner, to: null });
  });

  it('never touches the status', async () => {
    const id = await newLead();
    await db.query("update leads set status = 'sql', status_seq = 4 where id = $1", [id]);
    await assign(id, activeOwner);
    const [lead] = await rows<{ status: string; status_seq: number }>(
      'select status, status_seq from leads where id = $1',
      [id],
    );
    expect(lead).toEqual({ status: 'sql', status_seq: 4 });
  });

  it('the super admin may assign too', async () => {
    const id = await newLead();
    expect((await assign(id, activeOwner, superToken)).statusCode).toBe(200);
    expect(await ownerOf(id)).toBe(activeOwner);
  });
});

describe('the same owner again', () => {
  it('changes nothing but writes one audit row marked noop', async () => {
    const id = await newLead('lum', activeOwner);
    const res = await assign(id, activeOwner);
    expect(res.statusCode, res.body).toBe(200);
    expect(await events(id)).toEqual([]);
    const audit = await audits(id);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.meta).toEqual({ noop: true });
  });

  it('unassigning an unassigned lead is a noop too', async () => {
    const id = await newLead();
    expect((await assign(id, null)).statusCode).toBe(200);
    expect(await events(id)).toEqual([]);
    expect((await audits(id))[0]?.meta).toEqual({ noop: true });
  });
});

describe('who can be an owner', () => {
  it('a client user, a disabled manager, the super admin and an unknown id are 422', async () => {
    const id = await newLead();
    for (const owner of [clientUserId, disabledManager, superId, randomUUID()]) {
      expect((await assign(id, owner)).statusCode, owner).toBe(422);
    }
    expect(await ownerOf(id)).toBeNull();
    expect(await events(id)).toEqual([]);
    expect(await audits(id)).toEqual([]);
  });
});

describe('who can assign', () => {
  it('a client user gets 403 for its own client and 404 for another', async () => {
    const id = await newLead();
    expect((await assign(id, activeOwner, clientToken)).statusCode).toBe(403);
    const other = await newLead('prl');
    expect((await assign(other, activeOwner, clientToken, project.prl)).statusCode).toBe(404);
    expect(await ownerOf(id)).toBeNull();
  });

  it('a test lead, an unknown id and a lead of another client are 404 for staff', async () => {
    const test = await rows<{ id: string }>(
      'select id from leads where project_id = $1 and is_test',
      [project.lum],
    );
    expect((await assign(test[0]?.id as string, activeOwner)).statusCode).toBe(404);
    expect((await assign(randomUUID(), activeOwner)).statusCode).toBe(404);
    expect((await assign(await newLead('prl'), activeOwner)).statusCode).toBe(404);
  });

  it('needs a session, a client id and a valid owner id', async () => {
    const id = await newLead();
    expect((await assign(id, activeOwner, 'nope')).statusCode).toBe(401);
    const bad = (payload: object) =>
      app.inject({
        method: 'POST',
        url: `/leads/${id}/assign`,
        headers: asSession(managerToken),
        payload,
      });
    expect((await bad({ ownerId: activeOwner })).statusCode).toBe(422);
    expect((await bad({ projectId: project.lum, ownerId: 'not-a-uuid' })).statusCode).toBe(422);
  });
});

describe('route declaration', () => {
  it('asks can() for lead.assign on the body client and declares one audit row', () => {
    const spec = routeSpecs.get('POST /leads/:id/assign');
    if (!spec) throw new Error('route not registered');
    const p = project.lum as string;
    expect((spec.action as (i: unknown) => unknown)({ body: { projectId: p } })).toEqual({
      action: 'lead.assign',
      projectId: p,
    });
    expect(spec.audit).toBe('one');
  });
});
