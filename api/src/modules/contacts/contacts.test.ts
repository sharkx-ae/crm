import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rawClient } from '../../../tests/helpers/db.ts';
import { asSession, buildTestApp, seedUser, signIn } from '../../../tests/helpers/http.ts';
import {
  type ContactProfile,
  type ContactsPage,
  contactProfile,
  contactsPage,
} from '../../contracts/contacts.ts';
import { getPool } from '../../db/index.ts';
import { buildSeed, type SeedLead } from '../../db/seed/build.ts';
import { CLIENTS } from '../../db/seed/data.ts';
import { seed } from '../../db/seed.ts';
import { setEmailTransport } from '../../lib/email/index.ts';

// GET /contacts and GET /contacts/:id on the seed (F4b S8, S9). Expected rows come from buildSeed.

const expectedFile = JSON.parse(readFileSync('tests/fixtures/seed/expected.json', 'utf8')) as {
  now: string;
};

const NOW = new Date(expectedFile.now);
const plan = buildSeed(NOW);
const realOf = (key: string): SeedLead[] =>
  plan.clients.find((c) => c.client.key === key)?.leads.filter((l) => !l.isTest) ?? [];

/** One contact per non-test lead (the seed inserts a contact for every lead). */
function expectedContacts(leads: SeedLead[]) {
  return leads
    .filter((l) => !l.isTest)
    .map((l) => {
      const lastChat = l.chat.at(-1)?.ts ?? null;
      const last = lastChat && lastChat > l.createdAt ? lastChat : l.createdAt;
      return {
        phone: l.phoneE164,
        name: l.name,
        email: l.email,
        leadCount: 1,
        latestStatus: l.status,
        lastActivityAt: last.toISOString(),
      };
    });
}

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

const get = (url: string, token = managerToken) =>
  app.inject({ method: 'GET', url, headers: asSession(token) });

async function page(params: Record<string, string>, token = managerToken): Promise<ContactsPage> {
  const res = await get(`/contacts?${new URLSearchParams(params)}`, token);
  expect(res.statusCode, res.body).toBe(200);
  return contactsPage.parse(res.json());
}

describe('contacts list', () => {
  it('counts and latest status match the seed, test-only contacts are hidden, newest activity first', async () => {
    for (const c of CLIENTS) {
      const want = expectedContacts(realOf(c.key));
      const p = await page({ projectId: project[c.key] as string, limit: '200' });
      expect(p.total, c.name).toBe(want.length);
      expect(p.rows, c.name).toHaveLength(want.length);
      const byPhone = new Map(want.map((row) => [row.phone, row]));
      for (const row of p.rows) {
        const expected = byPhone.get(row.phone as string);
        expect(expected, row.phone ?? '').toMatchObject({
          name: row.name,
          email: row.email,
          leadCount: row.leadCount,
          latestStatus: row.latestStatus,
        });
        expect(new Date(row.lastActivityAt as string).getTime()).toBe(
          new Date(expected?.lastActivityAt as string).getTime(),
        );
      }
      const times = p.rows.map((row) => new Date(row.lastActivityAt as string).getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
    }
    const hidden = plan.clients.find((c) => c.client.key === 'lum')?.leads.find((l) => l.isTest)
      ?.phoneE164 as string;
    const lum = await page({ projectId: project.lum as string, limit: '200' });
    expect(lum.rows.map((row) => row.phone)).not.toContain(hidden);
  });

  it('searches name, phone (with a leading 0 and spaces) and email, and % is literal', async () => {
    const lead = realOf('lum')[0] as SeedLead;
    const byName = await page({ projectId: project.lum as string, q: lead.name.toLowerCase() });
    expect(byName.rows.every((row) => row.name?.toLowerCase() === lead.name.toLowerCase())).toBe(
      true,
    );
    expect(byName.rows.map((row) => row.phone)).toContain(lead.phoneE164);

    const national = lead.phoneE164.slice(4);
    const spaced = `0${national.slice(0, 2)} ${national.slice(2)}`;
    const byPhone = await page({ projectId: project.lum as string, q: spaced });
    expect(byPhone.rows.map((row) => row.phone)).toContain(lead.phoneE164);

    const byEmail = await page({ projectId: project.lum as string, q: lead.email });
    expect(byEmail.rows.map((row) => row.phone)).toEqual([lead.phoneE164]);

    expect((await page({ projectId: project.lum as string, q: '%' })).rows).toEqual([]);
    const testPhone = plan.clients.find((c) => c.client.key === 'lum')?.leads.find((l) => l.isTest)
      ?.phoneE164 as string;
    expect((await page({ projectId: project.lum as string, q: testPhone })).rows).toEqual([]);
  });

  it('limit grows by the requested page and never past the cap', async () => {
    const all = await page({ projectId: project.lum as string, limit: '200' });
    const first = await page({ projectId: project.lum as string, limit: '5' });
    expect(first.total).toBe(all.total);
    expect(first.rows).toHaveLength(5);
    expect(first.rows.map((row) => row.id)).toEqual(all.rows.slice(0, 5).map((row) => row.id));
    const over = await get(
      `/contacts?${new URLSearchParams({ projectId: project.lum as string, limit: '500' })}`,
    );
    expect(over.statusCode).toBe(422);
  });

  it('a client is forbidden on its own client', async () => {
    const res = await get(`/contacts?projectId=${project.lum}`, clientToken);
    expect(res.statusCode).toBe(403);
  });
});

describe('contact profile', () => {
  it('leads newest first, chats per number, notes, and status changes from lead_events', async () => {
    const client = CLIENTS.find((c) => c.key === 'lum');
    const sample = realOf('lum').find((l) => l.status !== 'new' && l.chat.length > 0);
    if (!sample) throw new Error('seed has no marked lead with a chat');
    const found = await page({ projectId: project.lum as string, q: sample.phoneE164 });
    const id = found.rows[0]?.id as string;

    const leadId = (
      await db.query<{ id: string }>('select id from leads where contact_id = $1 and not is_test', [
        id,
      ])
    ).rows[0]?.id as string;
    const older = await db.query<{ id: string }>(
      `insert into leads (project_id, contact_id, source, external_id, campaign, status, created_at)
       values ($1, $2, 'website', 'contacts-test-older', 'Older campaign', 'sql', '2020-01-01T00:00:00Z')
       returning id`,
      [project.lum, id],
    );
    const note = await db.query<{ id: string }>(
      `insert into notes (project_id, lead_id, author_id, text)
       select $1, $2, u.id, 'Called back and booked Thursday.'
       from users u where u.email = $3
       returning id`,
      [project.lum, leadId, client?.user.email],
    );

    try {
      const res = await get(`/contacts/${id}?projectId=${project.lum}`);
      expect(res.statusCode, res.body).toBe(200);
      const profile: ContactProfile = contactProfile.parse(res.json());
      expect(profile.leads.map((l) => l.campaign)).toEqual([sample?.campaign, 'Older campaign']);
      expect(profile.leads[0]?.status).toBe(sample?.status);
      expect(profile.leads[0]).toHaveProperty('ownerName');
      expect(profile.chats).toEqual([
        expect.objectContaining({
          numberLabel: client?.numbers[0]?.label,
          messages: sample?.chat.length,
        }),
      ]);
      expect(profile.notes.map((n) => n.text)).toContain('Called back and booked Thursday.');
      expect(profile.notes.find((n) => n.text.startsWith('Called'))?.authorName).toBe(
        client?.user.name,
      );
      const mark = profile.statusChanges.find((s) => s.leadId === leadId);
      expect(mark).toMatchObject({ from: 'new', to: sample?.status, byName: client?.user.name });
      if (sample?.status === 'not_qualified') expect(mark?.reason).toBe(sample.reason);
      else expect(mark?.reason).toBeNull();
    } finally {
      await db.query('delete from leads where id = $1', [older.rows[0]?.id]);
      await db.query('delete from notes where id = $1', [note.rows[0]?.id]);
    }
  });

  it('a contact with only a test lead is not found, and a client is forbidden', async () => {
    const testPhone = plan.clients.find((c) => c.client.key === 'lum')?.leads.find((l) => l.isTest)
      ?.phoneE164 as string;
    const id = (
      await db.query<{ id: string }>(
        'select id from contacts where project_id = $1 and phone_e164 = $2',
        [project.lum, testPhone],
      )
    ).rows[0]?.id as string;
    expect((await get(`/contacts/${id}?projectId=${project.lum}`)).statusCode).toBe(404);
    expect((await get(`/contacts/${id}?projectId=${project.lum}`, clientToken)).statusCode).toBe(
      403,
    );
  });
});
