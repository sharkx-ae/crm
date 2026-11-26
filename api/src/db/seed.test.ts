import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rawClient } from '../../tests/helpers/db.ts';
import { seedUser } from '../../tests/helpers/http.ts';
import { verifyPassword } from '../lib/crypto/index.ts';
import { ingestLead } from '../modules/leads/index.ts';
import { getPool } from './index.ts';
import { buildSeed, summarise } from './seed/build.ts';
import { CLIENTS } from './seed/data.ts';
import { SeedRefused, seed } from './seed.ts';

// tests/fixtures/seed/expected.json holds the per-client numbers for a frozen `now`, checked by hand once. Later specs
// (clients home F2b, overview F13a) compare their aggregates against the same file.
const expected = JSON.parse(readFileSync('tests/fixtures/seed/expected.json', 'utf8')) as {
  now: string;
  totalLeads: number;
  clients: Record<string, ReturnType<typeof summarise>[string]>;
};
const NOW = new Date(expected.now);
const PASSWORD = 'Seed-password-2026';

const db = rawClient();
beforeAll(() => db.connect());
afterAll(async () => {
  await db.end();
  await getPool().end();
});

describe('buildSeed (pure)', () => {
  it('is deterministic and matches expected.json', () => {
    expect(summarise(buildSeed(NOW), NOW)).toEqual(expected.clients);
    expect(summarise(buildSeed(NOW), NOW)).toEqual(summarise(buildSeed(NOW), NOW));
  });

  it('has the mockup shape: 5 clients, 64 leads, 2 test leads, unique valid phones per client', () => {
    const plan = buildSeed(NOW);
    const leads = plan.clients.flatMap((c) => c.leads);
    expect(plan.clients).toHaveLength(5);
    expect(leads).toHaveLength(expected.totalLeads);
    expect(leads.filter((l) => l.isTest)).toHaveLength(2);
    for (const c of plan.clients) {
      const phones = c.leads.map((l) => l.phoneE164);
      expect(new Set(phones).size).toBe(phones.length);
      for (const p of phones) expect(p).toMatch(/^\+(9715|2126)\d{8}$/);
    }
    expect(leads.every((l) => l.email.endsWith('@mail.test'))).toBe(true);
    expect(leads.filter((l) => l.isTest).every((l) => l.ownerIndex === null)).toBe(true);
  });
});

describe('seed (database)', () => {
  it('refuses outside local and staging', async () => {
    await expect(seed({ appEnv: 'production', password: PASSWORD })).rejects.toBeInstanceOf(
      SeedRefused,
    );
  });

  it('loads the numbers in expected.json', async () => {
    const r = await seed({ appEnv: 'local', password: PASSWORD, reset: true, now: NOW });
    expect(r).toEqual({ clients: 5, leads: 64, managers: 4, clientUsers: 5 });

    const rows = await db.query<{
      name: string;
      leads: string;
      tests: string;
      new_today: string;
      new: string;
      mql: string;
      sql: string;
      nq: string;
      with_chat: string;
      unreplied: string;
      overdue: string;
    }>(
      `select p.name,
         (select count(*) from leads l where l.project_id = p.id) leads,
         (select count(*) from leads l where l.project_id = p.id and l.is_test) tests,
         (select count(*) from leads l where l.project_id = p.id and not l.is_test
            and (l.created_at at time zone p.timezone)::date = ($1::timestamptz at time zone p.timezone)::date) new_today,
         (select count(*) from leads l where l.project_id = p.id and not l.is_test and l.status = 'new') new,
         (select count(*) from leads l where l.project_id = p.id and not l.is_test and l.status = 'mql') mql,
         (select count(*) from leads l where l.project_id = p.id and not l.is_test and l.status = 'sql') sql,
         (select count(*) from leads l where l.project_id = p.id and not l.is_test and l.status = 'not_qualified') nq,
         (select count(*) from wa_conversations c where c.project_id = p.id) with_chat,
         (select count(*) from wa_conversations c where c.project_id = p.id and
            (select m.direction from wa_messages m where m.conversation_id = c.id order by m.ts desc limit 1) = 'in') unreplied,
         (select count(*) from tasks k where k.project_id = p.id and k.done_at is null and k.due_at < $1) overdue
       from projects p`,
      [NOW],
    );
    expect(rows.rows).toHaveLength(5);
    for (const c of CLIENTS) {
      const row = rows.rows.find((r) => r.name === c.name);
      const e = expected.clients[c.key];
      expect(row, c.name).toBeDefined();
      expect(
        {
          leads: Number(row?.leads),
          testLeads: Number(row?.tests),
          newToday: Number(row?.new_today),
          byStatus: {
            new: Number(row?.new),
            mql: Number(row?.mql),
            sql: Number(row?.sql),
            not_qualified: Number(row?.nq),
          },
          withChat: Number(row?.with_chat),
          unreplied: Number(row?.unreplied),
          overdueTasks: Number(row?.overdue),
        },
        c.name,
        // The Overview numbers (e.overview) are checked against the database by modules/reports/overview.test.ts.
      ).toEqual({ ...e, overview: undefined });
    }
  });

  it('seeded people can sign in with SEED_PASSWORD; invited ones have no password; no super admin is created', async () => {
    const { rows } = await db.query<{
      email: string;
      role: string;
      status: string;
      pw_hash: string | null;
    }>(
      "select email, role, status, pw_hash from users where email like '%.test' and role <> 'super_admin'",
    );
    const lina = rows.find((r) => r.email === 'lina@lumiere.test');
    expect(lina?.role).toBe('client');
    expect(await verifyPassword(PASSWORD, lina?.pw_hash as string)).toBe(true);
    expect(rows.find((r) => r.email === 'yara.nassar@sharkx.test')).toMatchObject({
      status: 'invited',
      pw_hash: null,
    });
    // The super admin comes from auth:seed-admin only (and survives --reset); the seed adds none.
    const supers = await db.query(
      "select count(*) n from users where role = 'super_admin' and email like '%.test' and email <> 'super-admin@test.local'",
    );
    expect(Number(supers.rows[0].n)).toBe(0);
    expect(rows.every((r) => r.role === 'manager' || r.role === 'client')).toBe(true);
  });

  it('a second run without --reset is refused and changes nothing', async () => {
    await expect(seed({ appEnv: 'local', password: PASSWORD, now: NOW })).rejects.toBeInstanceOf(
      SeedRefused,
    );
    expect(Number((await db.query('select count(*) n from projects')).rows[0].n)).toBe(5);
  });

  it('--reset keeps real staff (non-.test emails) and the super admin', async () => {
    const real = await seedUser({ role: 'manager', email: `staff-${Date.now()}@sharkx.example` });
    await seed({ appEnv: 'local', password: PASSWORD, reset: true, now: NOW });
    const { rows } = await db.query('select id from users where id = $1', [real.id]);
    expect(rows).toHaveLength(1);
    expect(Number((await db.query('select count(*) n from projects')).rows[0].n)).toBe(5);
  });

  it('re-runs without --reset when the clients are gone but the seeded users remain', async () => {
    // Clients deleted by hand (or a run that failed after the managers): the seeded users still exist.
    await db.query('delete from projects');
    const r = await seed({ appEnv: 'local', password: PASSWORD, now: NOW });
    expect(r).toEqual({ clients: 5, leads: 64, managers: 4, clientUsers: 5 });
    expect(
      Number(
        (await db.query("select count(*) n from users where email = 'aisha.rahman@sharkx.test'"))
          .rows[0].n,
      ),
    ).toBe(1);
  });

  it('ingestLead works on top of the seed: a known phone merges into its open lead', async () => {
    const { rows } = await db.query<{ project_id: string; phone_e164: string; id: string }>(
      `select l.project_id, c.phone_e164, l.id from leads l join contacts c on c.id = l.contact_id
       where l.status in ('new', 'mql', 'sql') and not l.is_test limit 1`,
    );
    const known = rows[0];
    const r = await ingestLead({
      projectId: known?.project_id as string,
      source: 'website',
      phone: known?.phone_e164,
      answers: {},
      receivedAt: NOW.toISOString(),
    });
    expect(r).toMatchObject({ leadId: known?.id, merged: true });
  });
});
