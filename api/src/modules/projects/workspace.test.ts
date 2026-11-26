import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSuperAdmin, rawClient } from '../../../tests/helpers/db.ts';
import {
  asSession,
  buildTestApp,
  type Mail,
  seedUser,
  signIn,
  signInSuperAdmin,
} from '../../../tests/helpers/http.ts';
import {
  type BusinessHoursDay,
  projectDetail,
  projectsHomeResponse,
} from '../../contracts/projects.ts';
import { getPool } from '../../db/index.ts';
import { buildSeed, summarise } from '../../db/seed/build.ts';
import { CLIENTS } from '../../db/seed/data.ts';
import { seed } from '../../db/seed.ts';
import { setEmailTransport } from '../../lib/email/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { DEFAULT_STAGES, nameFromEmail } from './create.ts';
import { projectsHome } from './home.ts';

const expected = JSON.parse(readFileSync('tests/fixtures/seed/expected.json', 'utf8')) as {
  now: string;
  clients: Record<string, { newToday: number; unreplied: number; overdueTasks: number }>;
};
const NOW = new Date(expected.now);

let app: FastifyInstance;
let mail: Mail;
let superToken: string;
let managerToken: string;
let clientToken: string;
let staff: ResolvedSession;
let lumiere: string;
const db = rawClient();

beforeAll(async () => {
  await db.connect();
  await seed({ appEnv: 'local', password: 'Seed-password-2026', reset: true, now: NOW });
  const built = await buildTestApp();
  app = built.app;
  mail = built.mail;
  const superId = await ensureSuperAdmin();
  superToken = (await signInSuperAdmin(app, mail)).token;
  managerToken = (await signIn(app, mail, (await seedUser({ role: 'manager' })).email)).token;
  lumiere = (await db.query("select id from projects where name = 'Lumière Aesthetics'")).rows[0]
    .id;
  clientToken = (
    await signIn(app, mail, (await seedUser({ role: 'client', projectId: lumiere })).email)
  ).token;
  staff = {
    userId: superId,
    role: 'super_admin',
    projectIds: [],
    locale: 'en',
    stage: 'active',
    sessionId: 'test',
    name: 'Super',
    email: 'super-admin@test.local',
  };
});
afterAll(async () => {
  await app.close();
  await db.end();
  setEmailTransport(undefined);
  await getPool().end();
});

const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: asSession(token), payload });

describe('clients home (GET /projects)', () => {
  it('every number matches the hand-checked seed numbers for the frozen now', async () => {
    const home = await projectsHome(staff, undefined, NOW);
    for (const c of CLIENTS) {
      const row = home.rows.find((r) => r.name === c.name);
      const e = expected.clients[c.key];
      expect(
        { newToday: row?.newToday, unreplied: row?.unreplied, overdue: row?.overdue },
        c.name,
      ).toEqual({
        newToday: e?.newToday,
        unreplied: e?.unreplied,
        overdue: e?.overdueTasks,
      });
    }
  });

  it("'new today' starts at each client's own midnight (Dubai vs Casablanca)", async () => {
    // 21:30 UTC: already tomorrow in Dubai (01:30), still today in Casablanca (22:30). Nova's leads of the day
    // count; a query that used one zone for every client would show 0 for Nova (or 2+ for the Dubai clients).
    const late = new Date(NOW.getTime() + 11.5 * 3_600_000);
    const want = summarise(buildSeed(NOW), late);
    const home = await projectsHome(staff, undefined, late);
    for (const c of CLIENTS) {
      expect(home.rows.find((r) => r.name === c.name)?.newToday, c.name).toBe(
        want[c.key]?.newToday,
      );
    }
    expect(want.nov?.newToday).toBeGreaterThan(0);
    expect(want.lum?.newToday).toBe(0);
  });

  it('totals add up, count connections to fix, and ignore the search', async () => {
    const all = await projectsHome(staff, undefined, NOW);
    const sumOf = (k: 'newToday' | 'unreplied' | 'overdueTasks') =>
      Object.values(expected.clients).reduce((n, c) => n + c[k], 0);
    // Seed mix: Nova WhatsApp + Google need attention, Falcon Google broken.
    expect(all.totals).toEqual({
      newToday: sumOf('newToday'),
      unreplied: sumOf('unreplied'),
      overdue: sumOf('overdueTasks'),
      toFix: 3,
    });
    const byName = await projectsHome(staff, 'casa', NOW);
    expect(byName.rows.map((r) => r.name)).toEqual(['Nova Skin Casablanca']);
    expect((await projectsHome(staff, 'no such client', NOW)).rows).toEqual([]);
    const byCity = await projectsHome(staff, 'morocco', NOW);
    expect(byCity.rows.map((r) => r.name)).toEqual(['Nova Skin Casablanca']);
    expect(byCity.totals).toEqual(all.totals);
  });

  it('rows are sorted by new today, then unreplied; dots come in a fixed order', async () => {
    const { rows } = await projectsHome(staff, undefined, NOW);
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1];
      const b = rows[i];
      if (!a || !b) continue;
      expect(
        a.newToday > b.newToday || (a.newToday === b.newToday && a.unreplied >= b.unreplied),
      ).toBe(true);
    }
    expect(rows[0]?.integrations.map((i) => i.platform)).toEqual([
      'whatsapp',
      'meta',
      'google',
      'tiktok',
      'linkedin',
      'snapchat',
      'website',
    ]);
  });

  it('staff reach it over HTTP; a client user is refused', async () => {
    const res = await call('GET', '/projects?q=pearl', managerToken);
    expect(res.statusCode).toBe(200);
    expect(projectsHomeResponse.parse(res.json()).rows.map((r) => r.name)).toEqual([
      'Pearl Derma Clinic',
    ]);
    expect((await call('GET', '/projects', clientToken)).statusCode).toBe(403);
  });

  // F13a S4: the agency view's definitions hold when a test lead has an unanswered chat and an overdue task.
  it("a test lead's unreplied chat and overdue task count nowhere", async () => {
    const { rows } = await db.query<{ id: string; contact_id: string }>(
      'select id, contact_id from leads where project_id = $1 and is_test',
      [lumiere],
    );
    const testLead = rows[0];
    if (!testLead) throw new Error('the seed has a test lead in Lumière');
    const number = await db.query<{ id: string }>(
      'select id from wa_numbers where project_id = $1 limit 1',
      [lumiere],
    );
    // The seed gives test leads no chat, so this is the test lead's only conversation.
    const conv = await db.query<{ id: string }>(
      `insert into wa_conversations (project_id, number_id, contact_id) values ($1, $2, $3) returning id`,
      [lumiere, number.rows[0]?.id, testLead.contact_id],
    );
    const convId = conv.rows[0]?.id;
    const task = await db.query<{ id: string }>(
      `insert into tasks (project_id, lead_id, assignee_id, title, due_at)
       values ($1, $2, $3, 'Call back', $4) returning id`,
      [lumiere, testLead.id, staff.userId, new Date(NOW.getTime() - 3_600_000)],
    );
    try {
      await db.query(
        `insert into wa_messages (project_id, conversation_id, wa_message_id, direction, origin, ts)
         values ($1, $2, $3, 'in', 'customer', $4)`,
        [lumiere, convId, `f13a-test-${Date.now()}`, new Date(NOW.getTime() - 60_000)],
      );
      const row = (await projectsHome(staff, undefined, NOW)).rows.find((r) => r.id === lumiere);
      expect({ unreplied: row?.unreplied, overdue: row?.overdue }).toEqual({
        unreplied: expected.clients.lum?.unreplied,
        overdue: expected.clients.lum?.overdueTasks,
      });
    } finally {
      // Leave the seed as the next tests expect it (the conversation's messages go with it).
      await db.query('delete from tasks where id = $1', [task.rows[0]?.id]);
      await db.query('delete from wa_conversations where id = $1', [convId]);
    }
  });
});

describe('create client (POST /projects)', () => {
  const body = (name: string, email: string) => ({
    name,
    city: 'Morocco',
    industry: 'Dental clinic',
    firstUser: { email },
  });

  it('creates the client, its six stages and the invite in one go, with two audit rows', async () => {
    const res = await call(
      'POST',
      '/projects',
      superToken,
      body('Marina Dental', 'sara.idrissi@marina.test'),
    );
    expect(res.statusCode).toBe(200);
    const { projectId } = res.json() as { projectId: string };

    const p = (
      await db.query('select timezone, business_hours, color from projects where id = $1', [
        projectId,
      ])
    ).rows[0];
    expect(p.timezone).toBe('Africa/Casablanca');
    expect(
      (p.business_hours as BusinessHoursDay[]).filter((d) => d.open).map((d) => d.day),
    ).toEqual([1, 2, 3, 4, 5]);
    const stages = await db.query(
      'select name from pipeline_stages where project_id = $1 order by position',
      [projectId],
    );
    expect(stages.rows.map((r) => r.name)).toEqual(DEFAULT_STAGES);

    const user = (
      await db.query(
        'select u.name, u.status from users u join project_members m on m.user_id = u.id where m.project_id = $1',
        [projectId],
      )
    ).rows[0];
    // D3: no name field; the invite name comes from the email.
    expect(user).toEqual({ name: 'Sara Idrissi', status: 'invited' });
    expect(
      mail.sent.some((m) => m.template === 'invite' && m.to === 'sara.idrissi@marina.test'),
    ).toBe(true);

    const audits = await db.query(
      'select action from audit_log where project_id = $1 order by action',
      [projectId],
    );
    expect(audits.rows.map((r) => r.action)).toEqual(['project.created', 'user.invited']);

    // A client without any data shows zeros and seven grey dots on the Clients home, never an error.
    const row = (await projectsHome(staff, 'marina', NOW)).rows.find((r) => r.id === projectId);
    expect(row).toMatchObject({ newToday: 0, unreplied: 0, overdue: 0 });
    expect(row?.integrations.map((i) => i.status)).toEqual(Array(7).fill('not_connected'));
  });

  it('a failed invite email after the commit still answers the new client, and is reported', async () => {
    setEmailTransport({
      send: async () => {
        throw new Error('provider down');
      },
    });
    try {
      const res = await call(
        'POST',
        '/projects',
        superToken,
        body('Harbour Dental', 'owner@harbour.test'),
      );
      expect(res.statusCode).toBe(200);
      const { projectId } = res.json() as { projectId: string };
      expect(
        (await db.query('select count(*) n from projects where id = $1', [projectId])).rows[0].n,
      ).toBe('1');
      const logged = await db.query(
        "select context from error_log where fingerprint = 'api:/projects:invite_delivery'",
      );
      expect(logged.rows.some((r) => r.context.projectId === projectId)).toBe(true);
    } finally {
      setEmailTransport(mail);
    }
  });

  it('a duplicate name (any case) is 409', async () => {
    const res = await call(
      'POST',
      '/projects',
      superToken,
      body('lumière aesthetics', 'new@x.test'),
    );
    expect(res.statusCode).toBe(409);
  });

  it('an email that already has an account is 409 and leaves nothing behind', async () => {
    const before = Number((await db.query('select count(*) n from projects')).rows[0].n);
    const res = await call(
      'POST',
      '/projects',
      superToken,
      body('Rollback Clinic', 'lina@lumiere.test'),
    );
    expect(res.statusCode).toBe(409);
    expect(Number((await db.query('select count(*) n from projects')).rows[0].n)).toBe(before);
    expect(
      (await db.query("select count(*) n from projects where name = 'Rollback Clinic'")).rows[0].n,
    ).toBe('0');
  });

  it('a manager cannot create a client; bad input is 422', async () => {
    expect(
      (await call('POST', '/projects', managerToken, body('Manager Clinic', 'm@x.test')))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('POST', '/projects', superToken, { name: '', city: 'Paris' })).statusCode,
    ).toBe(422);
  });
});

describe('client settings (PATCH /projects/:id/settings)', () => {
  const week = (openDays: number[], from = '10:00', to = '19:00') =>
    [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, open: openDays.includes(day), from, to }));

  it('staff save the zone and seven days; the detail returns them; audited once', async () => {
    const res = await call('PATCH', `/projects/${lumiere}/settings`, managerToken, {
      projectId: lumiere,
      timezone: 'Africa/Casablanca',
      businessHours: week([1, 2, 3, 4, 6]),
    });
    expect(res.statusCode).toBe(200);
    const detail = projectDetail.parse(res.json());
    expect(detail.timezone).toBe('Africa/Casablanca');
    expect(detail.businessHours.filter((d) => d.open).map((d) => d.day)).toEqual([1, 2, 3, 4, 6]);
    const audits = await db.query(
      "select count(*) n from audit_log where entity_id = $1 and action = 'project.updated'",
      [lumiere],
    );
    expect(Number(audits.rows[0].n)).toBe(1);
  });

  it('closing before opening, a bad zone or six days are 422', async () => {
    const bad = (businessHours: unknown, timezone = 'Asia/Dubai') =>
      call('PATCH', `/projects/${lumiere}/settings`, managerToken, {
        projectId: lumiere,
        timezone,
        businessHours,
      });
    expect((await bad(week([1], '18:00', '09:00'))).statusCode).toBe(422);
    expect((await bad(week([1]), 'Mars/Olympus')).statusCode).toBe(422);
    expect((await bad(week([1]).slice(0, 6))).statusCode).toBe(422);
  });

  it('a client user cannot change settings; a path/body mismatch is 404', async () => {
    const body = { projectId: lumiere, timezone: 'Asia/Dubai', businessHours: week([1]) };
    expect(
      (await call('PATCH', `/projects/${lumiere}/settings`, clientToken, body)).statusCode,
    ).toBe(403);
    const other = (await db.query("select id from projects where name = 'Pearl Derma Clinic'"))
      .rows[0].id;
    expect(
      (await call('PATCH', `/projects/${other}/settings`, managerToken, body)).statusCode,
    ).toBe(404);
  });
});

describe('nameFromEmail', () => {
  it('turns the local part into a readable name', () => {
    expect(nameFromEmail('lina.haddad@clinic.ae')).toBe('Lina Haddad');
    expect(nameFromEmail('omar_farouk+crm@x.ae')).toBe('Omar Farouk');
    expect(nameFromEmail('info@clinic.ae')).toBe('Info');
    expect(nameFromEmail('12345@x.ae')).toBe('12345');
  });
});
