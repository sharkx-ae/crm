import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectClientSafe } from '../../../tests/helpers/client-safe.ts';
import { rawClient } from '../../../tests/helpers/db.ts';
import { asSession, buildTestApp, seedUser, signIn } from '../../../tests/helpers/http.ts';
import { type LeadDetail, leadDetail } from '../../contracts/leads.ts';
import { getPool } from '../../db/index.ts';
import { buildSeed, type SeedLead } from '../../db/seed/build.ts';
import { CLIENTS, DEFINITIONS, REASONS } from '../../db/seed/data.ts';
import { seed } from '../../db/seed.ts';
import { setEmailTransport } from '../../lib/email/index.ts';
import { DEFAULT_REASONS } from './qualification.ts';

// GET /leads/:id on the seed (F4b S5, S7).

const { now } = JSON.parse(readFileSync('tests/fixtures/seed/expected.json', 'utf8')) as {
  now: string;
};
const NOW = new Date(now);
const plan = buildSeed(NOW);

let app: FastifyInstance;
let managerToken: string;
let clientToken: string;
const project: Record<string, string> = {};
const db = rawClient();

beforeAll(async () => {
  await db.connect();
  await seed({ appEnv: 'local', password: 'Seed-password-2026', reset: true, now: NOW });
  const built = await buildTestApp();
  app = built.app;
  const { rows } = await db.query<{ id: string; name: string }>('select id, name from projects');
  for (const c of CLIENTS) project[c.key] = rows.find((r) => r.name === c.name)?.id as string;
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

/** The first seeded lead matching `test`, with its database id. */
async function seeded(
  test: (l: SeedLead) => boolean,
  keys = CLIENTS.map((c) => c.key),
): Promise<{ key: string; id: string; lead: SeedLead }> {
  for (const key of keys) {
    const leads = plan.clients.find((c) => c.client.key === key)?.leads ?? [];
    const i = leads.findIndex((l) => !l.isTest && test(l));
    if (i < 0) continue;
    const { rows } = await db.query<{ id: string }>(
      'select id from leads where project_id = $1 and external_id = $2',
      [project[key], `seed-${key}-${i}`],
    );
    return { key, id: rows[0]?.id as string, lead: leads[i] as SeedLead };
  }
  throw new Error('no seeded lead matches');
}

const get = (id: string, projectId: string | undefined, token = managerToken) =>
  app.inject({
    method: 'GET',
    url: `/leads/${id}${projectId ? `?projectId=${projectId}` : ''}`,
    headers: asSession(token),
  });

async function staffDetail(id: string, key: string) {
  const res = await get(id, project[key]);
  expect(res.statusCode, res.body).toBe(200);
  const d: LeadDetail = leadDetail.parse(res.json());
  if (d.view !== 'staff') throw new Error('expected the staff view');
  return d;
}

describe('staff detail', () => {
  it('carries the lead, its definitions and reasons, and the active managers', async () => {
    const { id, lead } = await seeded((l) => l.status !== 'new', ['lum']);
    const d = await staffDetail(id, 'lum');
    expect(d.lead).toMatchObject({
      id,
      name: lead.name,
      phone: lead.phoneE164,
      email: lead.email,
      campaign: lead.campaign,
      status: lead.status,
      answers: lead.answers,
    });
    expect(d.qualification).toEqual({
      mqlDefinition: DEFINITIONS.aesthetic.mql,
      sqlDefinition: DEFINITIONS.aesthetic.sql,
      reasons: REASONS,
    });
    const names = d.owners.map((o) => o.name);
    expect(names).toEqual(expect.arrayContaining(['Aisha Rahman', 'Rami Haddad', 'Sana Idrissi']));
    expect(names).not.toContain('Yara Nassar');
  });

  it('timeline: newest first, actor and owner names resolved', async () => {
    const { id, lead } = await seeded((l) => l.status !== 'new', ['lum']);
    const d = await staffDetail(id, 'lum');
    expect(d.timeline.map((e) => e.kind).sort()).toEqual(['assigned', 'created', 'status_changed']);
    expect(d.timeline[0]).toMatchObject({
      kind: 'status_changed',
      actorKind: 'client',
      actorName: 'Dr. Lina Haddad',
      data: { from: 'new', to: lead.status },
    });
    const times = d.timeline.map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(d.timeline.find((e) => e.kind === 'assigned')?.data.ownerName).toBe(d.lead.ownerName);
  });

  it('events at the same instant are ordered by id, newest id first', async () => {
    const { id } = await seeded((l) => l.status === 'new', ['lum']);
    const low = `00000000-0000-4000-8000-${randomUUID().slice(-12)}`;
    const high = `ffffffff-ffff-4fff-8fff-${randomUUID().slice(-12)}`;
    for (const eventId of [low, high]) {
      await db.query(
        `insert into lead_events (id, project_id, lead_id, kind, actor_kind, at)
         values ($1, $2, $3, 'something_new', 'system', timestamptz '2027-01-01')`,
        [eventId, project.lum, id],
      );
    }
    const d = await staffDetail(id, 'lum');
    expect(d.timeline.slice(0, 2).map((e) => e.id)).toEqual([high, low]);
  });

  it('whatsappState from the newest message of the chat', async () => {
    const cases = [
      ['none', (l: SeedLead) => l.chat.length === 0],
      ['unreplied', (l: SeedLead) => l.chat.at(-1)?.dir === 'in'],
      ['replied', (l: SeedLead) => l.chat.at(-1)?.dir === 'out'],
    ] as const;
    for (const [state, test] of cases) {
      const { key, id } = await seeded(test);
      expect((await staffDetail(id, key)).whatsappState, state).toBe(state);
    }
  });
});

describe('qualification without a settings row', () => {
  it('falls back to the same reasons the column defaults to', async () => {
    const { id } = await seeded(() => true, ['oas']);
    await db.query('delete from qualification_settings where project_id = $1', [project.oas]);
    expect((await staffDetail(id, 'oas')).qualification).toEqual({
      mqlDefinition: '',
      sqlDefinition: '',
      reasons: DEFAULT_REASONS,
    });
    const { rows } = await db.query(
      'insert into qualification_settings (project_id) values ($1) returning reasons',
      [project.oas],
    );
    expect(rows[0].reasons).toEqual(DEFAULT_REASONS);
  });
});

describe('client detail', () => {
  it('is the lead and the qualification, nothing else', async () => {
    const { id } = await seeded((l) => l.status !== 'new' && l.chat.length > 0, ['lum']);
    const res = await get(id, project.lum, clientToken);
    expect(res.statusCode, res.body).toBe(200);
    expectClientSafe(res.body);
    expect(Object.keys(res.json()).sort()).toEqual(['lead', 'qualification', 'view']);
    expect(res.json().view).toBe('client');
  });

  it('another client is not found, by its own id or through this one', async () => {
    const other = await seeded(() => true, ['prl']);
    expect((await get(other.id, project.prl, clientToken)).statusCode).toBe(404);
    expect((await get(other.id, project.lum, clientToken)).statusCode).toBe(404);
  });
});

describe('not found', () => {
  it('a test lead, a wrong client and an unknown id are 404 for staff too', async () => {
    const { rows } = await db.query<{ id: string }>(
      'select id from leads where project_id = $1 and is_test',
      [project.lum],
    );
    expect((await get(rows[0]?.id as string, project.lum)).statusCode).toBe(404);
    const other = await seeded(() => true, ['prl']);
    expect((await get(other.id, project.lum)).statusCode).toBe(404);
    expect((await get(randomUUID(), project.lum)).statusCode).toBe(404);
  });

  it('needs the client id', async () => {
    expect((await get(randomUUID(), undefined)).statusCode).toBe(422);
    expect((await get('not-a-uuid', project.lum)).statusCode).toBe(422);
  });
});
