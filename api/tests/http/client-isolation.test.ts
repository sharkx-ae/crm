import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '../../src/db/index.ts';
import * as s from '../../src/db/schema/index.ts';
import { seed } from '../../src/db/seed.ts';
import { setEmailTransport } from '../../src/lib/email/index.ts';
import { withTenant } from '../../src/lib/tenant/index.ts';
import { expectClientSafe } from '../helpers/client-safe.ts';
import { rawClient } from '../helpers/db.ts';
import {
  asSession,
  buildTestApp,
  freshIp,
  internal,
  lastCode,
  lastLinkToken,
  type Mail,
  post,
  seedUser,
  signIn,
  signInSuperAdmin,
} from '../helpers/http.ts';

// F10a: a client user of A, on the seeded data, through the real routes and the real RLS. A foreign client's URL is
// not found; a staff-only route is forbidden; the database returns none of B's rows. RLS by table is proven in
// tests/rls; this file proves the routes and services built on top of it keep the same promise.
const SEED_PASSWORD = 'Seed-password-2026';
const NEW_PASSWORD = 'Front-desk-pass-88';

let app: FastifyInstance;
let mail: Mail;
let superId: string;
let managerToken: string;
let lina: { token: string; userId: string };
let lumiere: string;
let pearl: string;
const db = rawClient();

const hours = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
  day,
  open: day <= 5,
  from: '09:00',
  to: '18:00',
}));
const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: asSession(token), payload });

beforeAll(async () => {
  await db.connect();
  await seed({ appEnv: 'local', password: SEED_PASSWORD, reset: true });
  ({ app, mail } = await buildTestApp());
  superId = (await signInSuperAdmin(app, mail)).id;
  managerToken = (await signIn(app, mail, (await seedUser({ role: 'manager' })).email)).token;
  const ids = await db.query<{ name: string; id: string }>('select name, id from projects');
  const byName = (n: string) => ids.rows.find((r) => r.name === n)?.id as string;
  lumiere = byName('Lumière Aesthetics');
  pearl = byName('Pearl Derma Clinic');
  const signed = await signIn(app, mail, 'lina@lumiere.test', SEED_PASSWORD);
  lina = { token: signed.token, userId: signed.me.userId };
});
afterAll(async () => {
  await app.close();
  await db.end();
  setEmailTransport(undefined);
  await getPool().end();
});

describe('a client user of A, through the routes', () => {
  it('belongs to A only', async () => {
    const me = await call('GET', '/me', lina.token);
    expect(me.json()).toMatchObject({ role: 'client', projectIds: [lumiere] });
  });

  it('the switcher options list A only', async () => {
    const res = await call('GET', '/projects/options', lina.token);
    expect(res.statusCode).toBe(200);
    expect(res.json().options.map((o: { id: string }) => o.id)).toEqual([lumiere]);
  });

  it('reads A; B does not exist for it (404, same as an unknown id)', async () => {
    expect((await call('GET', `/projects/${lumiere}`, lina.token)).statusCode).toBe(200);
    const foreign = await call('GET', `/projects/${pearl}`, lina.token);
    const unknown = await call('GET', '/projects/00000000-0000-4000-8000-000000000000', lina.token);
    expect(foreign.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(foreign.json()).toEqual(unknown.json());
  });

  it('staff-only routes: clients home and create are 403', async () => {
    expect((await call('GET', '/projects', lina.token)).statusCode).toBe(403);
    const create = await call('POST', '/projects', lina.token, {
      name: 'Sneaky Clinic',
      city: 'Dubai',
      industry: 'Dental',
      firstUser: { email: 'sneaky@test.local' },
    });
    expect(create.statusCode).toBe(403);
  });

  it("settings: 403 on its own client, 404 on another's; nothing changes", async () => {
    const before = await db.query('select timezone, business_hours from projects where id = $1', [
      lumiere,
    ]);
    const own = await call('PATCH', `/projects/${lumiere}/settings`, lina.token, {
      projectId: lumiere,
      timezone: 'Africa/Casablanca',
      businessHours: hours,
    });
    const foreign = await call('PATCH', `/projects/${pearl}/settings`, lina.token, {
      projectId: pearl,
      timezone: 'Africa/Casablanca',
      businessHours: hours,
    });
    expect(own.statusCode).toBe(403);
    expect(foreign.statusCode).toBe(404);
    const after = await db.query('select timezone, business_hours from projects where id = $1', [
      lumiere,
    ]);
    expect(after.rows).toEqual(before.rows);
  });

  it('client users: 403 for its own client, 404 for another', async () => {
    const own = await call('GET', `/users?kind=client&projectId=${lumiere}`, lina.token);
    const foreign = await call('GET', `/users?kind=client&projectId=${pearl}`, lina.token);
    expect(own.statusCode).toBe(403);
    expect(foreign.statusCode).toBe(404);
  });
});

describe('a client user of A, in the database (withTenant)', () => {
  const asLina = <T>(fn: Parameters<typeof withTenant<T>>[1]) =>
    withTenant({ userId: lina.userId, role: 'client' }, fn);

  it("reads none of B's leads, contacts, conversations or qualification settings", async () => {
    await asLina(async (tx) => {
      for (const [name, table] of [
        ['leads', s.leads],
        ['contacts', s.contacts],
        ['wa_conversations', s.waConversations],
        ['qualification_settings', s.qualificationSettings],
      ] as const) {
        const rows = await tx.select().from(table).where(eq(table.projectId, pearl));
        expect(rows, name).toHaveLength(0);
      }
    });
  });

  it('reads its own leads, but never stages, tasks, notes or lead events (staff-only tables)', async () => {
    await asLina(async (tx) => {
      expect((await tx.select().from(s.leads)).length).toBeGreaterThan(0);
      for (const r of await tx.select({ p: s.leads.projectId }).from(s.leads))
        expect(r.p).toBe(lumiere);
      for (const [name, table] of [
        ['pipeline_stages', s.pipelineStages],
        ['tasks', s.tasks],
        ['notes', s.notes],
        ['lead_events', s.leadEvents],
      ] as const) {
        expect(await tx.select().from(table), name).toHaveLength(0);
      }
    });
  });

  it('staff still see every client', async () => {
    const seen = await withTenant({ userId: superId, role: 'super_admin' }, async (tx) =>
      tx.selectDistinct({ p: s.leads.projectId }).from(s.leads),
    );
    expect(seen.map((r) => r.p)).toEqual(expect.arrayContaining([lumiere, pearl]));
  });
});

describe('client users of a seeded client (F10a S2, against the real F1c routes)', () => {
  it('invite → accept → signed in to A only → disable (signed out) → enable; audited', async () => {
    const email = `front-desk-${Date.now()}@test.local`;
    const invited = await call('POST', '/users/invite', managerToken, {
      kind: 'client',
      name: 'Front Desk',
      email,
      projectId: lumiere,
    });
    expect(invited.statusCode).toBe(200);
    const userId = invited.json().id as string;

    const list = await call('GET', `/users?kind=client&projectId=${lumiere}`, managerToken);
    expect(list.json().users).toEqual(
      expect.arrayContaining([expect.objectContaining({ email, status: 'invited' })]),
    );

    const accepted = await post(
      app,
      '/auth/invite/accept',
      { token: lastLinkToken(mail, 'invite', email), password: NEW_PASSWORD },
      internal({ 'x-client-ip': freshIp() }),
    );
    expect(accepted.statusCode).toBe(200);
    const verified = await post(
      app,
      '/auth/code/verify',
      { code: lastCode(mail, email) },
      asSession(accepted.json().sessionToken),
    );
    expect(verified.json().me).toMatchObject({ role: 'client', projectIds: [lumiere] });
    const token = verified.json().sessionToken as string;
    expect((await call('GET', `/projects/${pearl}`, token)).statusCode).toBe(404);

    const disabled = await call('POST', `/users/${userId}/status`, managerToken, {
      status: 'disabled',
    });
    expect(disabled.json()).toMatchObject({ status: 'disabled' });
    expect((await call('GET', '/me', token)).statusCode).toBe(401);

    const enabled = await call('POST', `/users/${userId}/status`, managerToken, {
      status: 'active',
    });
    expect(enabled.json()).toMatchObject({ status: 'active' });
    const again = await signIn(app, mail, email, NEW_PASSWORD);
    expect(again.me.projectIds).toEqual([lumiere]);

    const rows = await withTenant({ userId: superId, role: 'super_admin' }, async (tx) =>
      tx.select().from(s.auditLog).where(eq(s.auditLog.entityId, userId)),
    );
    const actions = rows.map((r) => [r.action, r.projectId]);
    expect(actions).toEqual(
      expect.arrayContaining([
        ['user.invited', lumiere],
        ['user.status_changed', lumiere],
        ['user.status_changed', lumiere],
      ]),
    );
    expect(rows.filter((r) => r.action === 'user.status_changed')).toHaveLength(2);
  });
});

describe('F4b leads routes: a client user of A', () => {
  const leadOf = async (projectId: string) =>
    (
      await db.query('select id from leads where project_id = $1 and not is_test limit 1', [
        projectId,
      ])
    ).rows[0].id as string;

  it('lists and opens its own leads, client-safe', async () => {
    const list = await call('GET', `/leads?projectId=${lumiere}`, lina.token);
    expect(list.statusCode).toBe(200);
    expectClientSafe(list.body);
    const one = await call(
      'GET',
      `/leads/${await leadOf(lumiere)}?projectId=${lumiere}`,
      lina.token,
    );
    expect(one.statusCode).toBe(200);
    expectClientSafe(one.body);
  });

  it("gets 404 for B's list, and for B's lead under B's id or A's", async () => {
    const theirs = await leadOf(pearl);
    expect((await call('GET', `/leads?projectId=${pearl}`, lina.token)).statusCode).toBe(404);
    for (const projectId of [pearl, lumiere]) {
      const res = await call('GET', `/leads/${theirs}?projectId=${projectId}`, lina.token);
      expect(res.statusCode, projectId).toBe(404);
      const mark = await call('POST', `/leads/${theirs}/status`, lina.token, {
        projectId,
        to: 'mql',
      });
      expect(mark.statusCode, projectId).toBe(404);
    }
  });

  it('contacts are staff only: 403 on the list and on a profile', async () => {
    const contactId = (
      await db.query<{ id: string }>('select id from contacts where project_id = $1 limit 1', [
        lumiere,
      ])
    ).rows[0]?.id as string;
    expect((await call('GET', `/contacts?projectId=${lumiere}`, lina.token)).statusCode).toBe(403);
    expect(
      (await call('GET', `/contacts/${contactId}?projectId=${lumiere}`, lina.token)).statusCode,
    ).toBe(403);
  });

  it('staff reach every client', async () => {
    for (const projectId of [lumiere, pearl]) {
      expect((await call('GET', `/leads?projectId=${projectId}`, managerToken)).statusCode).toBe(
        200,
      );
    }
  });
});
