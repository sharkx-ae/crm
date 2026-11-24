import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rawClient } from '../../../tests/helpers/db.ts';
import { seedUser } from '../../../tests/helpers/http.ts';
import type { IngestLeadInput } from '../../contracts/functions.ts';
import { getPool } from '../../db/index.ts';
import { withSystem } from '../../lib/tenant/index.ts';
import { users } from '../auth/schema.ts';
import { integrations } from '../integrations/hub/schema.ts';
import { pipelineStages } from '../pipeline/schema.ts';
import { projects } from '../projects/schema.ts';
import { nextManager } from './assign.ts';
import { ingestLead } from './ingest.ts';
import { leadForms } from './schema.ts';

const db = rawClient();
beforeAll(() => db.connect());
afterAll(async () => {
  await db.end();
  await getPool().end();
});

/** A fresh client with the default stages, so every test starts from nothing. */
async function newProject(city = 'Dubai'): Promise<string> {
  const id = randomUUID();
  await withSystem(id, async (tx) => {
    await tx.insert(projects).values({ id, name: `Ingest ${id}`, city });
    await tx.insert(pipelineStages).values(
      ['New', 'Contacted', 'Qualified'].map((name, i) => ({
        projectId: id,
        name,
        position: i + 1,
      })),
    );
  });
  return id;
}

const base = (projectId: string, extra: Partial<IngestLeadInput> = {}): IngestLeadInput => ({
  projectId,
  source: 'meta',
  answers: {},
  receivedAt: new Date().toISOString(),
  ...extra,
});
const one = async <T>(sql: string, params: unknown[]): Promise<T> =>
  (await db.query(sql, params)).rows[0] as T;
const count = async (sql: string, params: unknown[]) =>
  Number((await one<{ n: string }>(sql, params)).n);

describe('ingestLead: dedupe and merge', () => {
  it('a new phone creates a contact and a lead, normalised to E.164', async () => {
    const p = await newProject();
    const r = await ingestLead(base(p, { name: 'Omar Haddad', phone: '050 412 7781' }));
    expect(r).toMatchObject({ created: true, merged: false });
    const c = await one<{ phone_e164: string; name: string }>(
      'select phone_e164, name from contacts where id = $1',
      [r.contactId],
    );
    expect(c).toEqual({ phone_e164: '+971504127781', name: 'Omar Haddad' });
  });

  it('the same phone with an open lead merges into its timeline, from any source', async () => {
    const p = await newProject();
    const first = await ingestLead(base(p, { phone: '+971 50 111 2233', campaign: 'A' }));
    const again = await ingestLead(
      base(p, { phone: '0501112233', source: 'google', campaign: 'B' }),
    );
    expect(again).toEqual({ ...first, created: false, merged: true });
    expect(await count('select count(*) n from leads where project_id = $1', [p])).toBe(1);
    const ev = await one<{ data: { source: string; campaign: string } }>(
      "select data from lead_events where lead_id = $1 and kind = 'merged'",
      [first.leadId],
    );
    expect(ev.data).toMatchObject({ source: 'google', campaign: 'B' });
  });

  it('the same phone whose lead is not qualified gets a new lead on the same contact', async () => {
    const p = await newProject();
    const first = await ingestLead(base(p, { phone: '+971 50 222 3344' }));
    await db.query(
      "update leads set status = 'not_qualified', reason = 'No budget' where id = $1",
      [first.leadId],
    );
    const second = await ingestLead(base(p, { phone: '+971 50 222 3344' }));
    expect(second.created).toBe(true);
    expect(second.contactId).toBe(first.contactId);
    expect(second.leadId).not.toBe(first.leadId);
  });

  it('without a phone, the email matches (case-insensitive)', async () => {
    const p = await newProject();
    const first = await ingestLead(base(p, { email: 'Lina@Example.com' }));
    const again = await ingestLead(base(p, { email: ' lina@example.com ' }));
    expect(again).toMatchObject({ leadId: first.leadId, merged: true });
  });

  it('the phone wins over a different email', async () => {
    const p = await newProject();
    const first = await ingestLead(base(p, { phone: '+971 50 333 4455', email: 'a@x.ae' }));
    const again = await ingestLead(base(p, { phone: '+971 50 333 4455', email: 'b@x.ae' }));
    expect(again).toMatchObject({ contactId: first.contactId, merged: true });
  });

  it('no phone and no email: a new contact every time, no match attempted', async () => {
    const p = await newProject();
    const a = await ingestLead(base(p, { name: 'Anon' }));
    const b = await ingestLead(base(p, { name: 'Anon' }));
    expect(a.contactId).not.toBe(b.contactId);
    expect(b.created).toBe(true);
  });

  it('an invalid phone is kept raw on the event, never matched', async () => {
    const p = await newProject();
    const a = await ingestLead(base(p, { phone: 'call me later' }));
    const b = await ingestLead(base(p, { phone: 'call me later' }));
    expect(a.contactId).not.toBe(b.contactId);
    const ev = await one<{ data: { phoneInvalid: boolean; phoneRaw: string } }>(
      "select data from lead_events where lead_id = $1 and kind = 'created'",
      [a.leadId],
    );
    expect(ev.data).toMatchObject({ phoneInvalid: true, phoneRaw: 'call me later' });
    expect(
      (
        await one<{ phone_e164: string | null }>('select phone_e164 from contacts where id = $1', [
          a.contactId,
        ])
      ).phone_e164,
    ).toBeNull();
  });

  it('a Moroccan client reads local numbers as Moroccan', async () => {
    const p = await newProject('Morocco');
    const r = await ingestLead(base(p, { phone: '06 61 23 45 78' }));
    expect(
      (
        await one<{ phone_e164: string }>('select phone_e164 from contacts where id = $1', [
          r.contactId,
        ])
      ).phone_e164,
    ).toBe('+212661234578');
  });
});

describe('ingestLead: idempotency and concurrency', () => {
  it('the same externalId returns the same lead (created: false)', async () => {
    const p = await newProject();
    const input = base(p, { externalId: 'meta-123', phone: '+971 50 444 5566' });
    const first = await ingestLead(input);
    const replay = await ingestLead(input);
    expect(replay).toEqual({ ...first, created: false, merged: false });
    expect(await count('select count(*) n from leads where project_id = $1', [p])).toBe(1);
  });

  it('replaying a submission that was merged does not merge it twice', async () => {
    const p = await newProject();
    await ingestLead(base(p, { phone: '+971 50 555 6677' }));
    const merged = base(p, { phone: '+971 50 555 6677', source: 'google', externalId: 'g-9' });
    expect((await ingestLead(merged)).merged).toBe(true);
    expect((await ingestLead(merged)).merged).toBe(false);
    expect(
      await count("select count(*) n from lead_events where project_id = $1 and kind = 'merged'", [
        p,
      ]),
    ).toBe(1);
  });

  it('two submissions of one phone at the same moment give one contact and one lead', async () => {
    const p = await newProject();
    const [a, b] = await Promise.all([
      ingestLead(base(p, { phone: '+971 50 666 7788' })),
      ingestLead(base(p, { phone: '+971 50 666 7788', source: 'website' })),
    ]);
    expect(a.contactId).toBe(b.contactId);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(await count('select count(*) n from contacts where project_id = $1', [p])).toBe(1);
  });

  it('a blank externalId means "none": no idempotency key, no unique-key crash on the second lead', async () => {
    const p = await newProject();
    const a = await ingestLead(base(p, { externalId: '', phone: '+971 50 121 2121' }));
    const b = await ingestLead(base(p, { externalId: '  ', phone: '+971 50 343 4343' }));
    expect([a.created, b.created]).toEqual([true, true]);
    expect(
      await count('select count(*) n from leads where project_id = $1 and external_id is null', [
        p,
      ]),
    ).toBe(2);
  });

  it('an unknown client is NOT_FOUND', async () => {
    await expect(ingestLead(base(randomUUID(), { phone: '+971501234567' }))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('ingestLead: mapping, test leads, side effects', () => {
  it('applies the form mapping: name/phone/email fields, notes, ignore, custom', async () => {
    const p = await newProject();
    await withSystem(p, async (tx) => {
      const [integ] = await tx
        .insert(integrations)
        .values({ projectId: p, platform: 'meta' })
        .returning({ id: integrations.id });
      await tx.insert(leadForms).values({
        projectId: p,
        integrationId: integ?.id as string,
        externalFormId: 'form-1',
        name: 'Botox form',
        mapping: {
          'Full name': 'name',
          Mobile: 'phone',
          'Anything else?': 'notes',
          Consent: 'ignore',
          'Which treatment?': 'custom',
        },
      });
    });
    const r = await ingestLead(
      base(p, {
        formId: 'form-1',
        answers: {
          'Full name': 'Sara Benali',
          Mobile: '055 300 8812',
          'Anything else?': 'Prefers evenings',
          Consent: 'yes',
          'Which treatment?': 'Botox',
          Unmapped: 'kept',
        },
      }),
    );
    const lead = await one<{ answers: Record<string, string> }>(
      'select answers from leads where id = $1',
      [r.leadId],
    );
    expect(lead.answers).toEqual({ 'Which treatment?': 'Botox', Unmapped: 'kept' });
    expect(await one('select name, phone_e164 from contacts where id = $1', [r.contactId])).toEqual(
      { name: 'Sara Benali', phone_e164: '+971553008812' },
    );
    expect(
      (await one<{ text: string }>('select text from notes where lead_id = $1', [r.leadId])).text,
    ).toBe('Anything else?: Prefers evenings');

    // A blank explicit phone does not hide the mapped one.
    const blank = await ingestLead(
      base(p, { formId: 'form-1', phone: '', answers: { Mobile: '055 300 9900' } }),
    );
    expect(await one('select phone_e164 from contacts where id = $1', [blank.contactId])).toEqual({
      phone_e164: '+971553009900',
    });
  });

  it('test and real leads never merge into each other', async () => {
    const p = await newProject();
    const phone = '+971 50 565 6565';
    const test = await ingestLead(base(p, { phone, isTest: true }));
    const real = await ingestLead(base(p, { phone, source: 'website' }));
    expect(real).toMatchObject({ created: true, merged: false, contactId: test.contactId });
    expect(real.leadId).not.toBe(test.leadId);
    const realRow = await one<{ is_test: boolean; owner_id: string | null }>(
      'select is_test, owner_id from leads where id = $1',
      [real.leadId],
    );
    expect(realRow.is_test).toBe(false);

    // A second test submission from that phone joins the test lead, not the real one.
    const again = await ingestLead(base(p, { phone, isTest: true, source: 'google' }));
    expect(again).toMatchObject({ leadId: test.leadId, merged: true });
  });

  it('a new lead writes the created event, one audit row, a change-feed row, the first stage and an owner', async () => {
    const p = await newProject();
    await seedUser({ role: 'manager' });
    const r = await ingestLead(base(p, { phone: '+971 50 777 8899' }));
    const lead = await one<{ stage: string; owner_id: string | null }>(
      'select s.name stage, l.owner_id from leads l join pipeline_stages s on s.id = l.stage_id where l.id = $1',
      [r.leadId],
    );
    expect(lead.stage).toBe('New');
    expect(lead.owner_id).not.toBeNull();
    expect(
      await count(
        "select count(*) n from audit_log where entity_id = $1 and action = 'lead.created'",
        [r.leadId],
      ),
    ).toBe(1);
    expect(
      await count("select count(*) n from change_feed where ref_id = $1 and kind = 'lead'", [
        r.leadId,
      ]),
    ).toBe(1);
  });

  it('notifies managers and the client users of a new lead, never for a test lead', async () => {
    const p = await newProject();
    const manager = await seedUser({ role: 'manager' });
    const client = await seedUser({ role: 'client', projectId: p });
    const real = await ingestLead(base(p, { phone: '+971 50 888 9900' }));
    const notified = await db.query<{ user_id: string }>(
      "select user_id from notifications where ref_id = $1 and kind = 'new_lead'",
      [real.leadId],
    );
    const ids = notified.rows.map((r) => r.user_id);
    expect(ids).toContain(manager.id);
    expect(ids).toContain(client.id);

    const test = await ingestLead(base(p, { phone: '+971 50 999 0011', isTest: true }));
    expect(
      await count('select count(*) n from notifications where ref_id = $1', [test.leadId]),
    ).toBe(0);
    const t = await one<{ is_test: boolean; owner_id: string | null }>(
      'select is_test, owner_id from leads where id = $1',
      [test.leadId],
    );
    expect(t).toEqual({ is_test: true, owner_id: null });
  });
});

describe('round-robin', () => {
  it('assigns in turn through the active managers, skips disabled ones, never a client user', async () => {
    const p = await newProject();
    const disabled = await seedUser({ role: 'manager', status: 'disabled' });
    await seedUser({ role: 'manager' });
    await seedUser({ role: 'manager' });
    const client = await seedUser({ role: 'client', projectId: p });

    const active = (
      await db.query<{ id: string }>(
        "select id from users where role = 'manager' and status = 'active' order by created_at, id",
      )
    ).rows.map((r) => r.id);
    const n = active.length;
    expect(n).toBeGreaterThanOrEqual(2);

    const owners: string[] = [];
    for (let i = 0; i < n * 2; i++) {
      const r = await ingestLead(base(p, { phone: `+97150${String(1000000 + i)}` }));
      owners.push(
        (await one<{ owner_id: string }>('select owner_id from leads where id = $1', [r.leadId]))
          .owner_id,
      );
    }
    // Every active manager gets exactly two of 2n leads, in the same order both rounds.
    expect(new Set(owners).size).toBe(n);
    expect(owners.slice(0, n)).toEqual(owners.slice(n));
    expect(owners).not.toContain(disabled.id);
    expect(owners).not.toContain(client.id);
    for (const id of active) expect(owners.filter((o) => o === id)).toHaveLength(2);
  });

  it('no active manager → unassigned (inside a rolled-back transaction, other files keep their managers)', async () => {
    const p = await newProject();
    await seedUser({ role: 'manager' });
    const rollback = new Error('rollback');
    let picked: string | null | undefined;
    await expect(
      withSystem(p, async (tx) => {
        await tx.update(users).set({ status: 'disabled' }).where(eq(users.role, 'manager'));
        picked = await nextManager(tx, p);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(picked).toBeNull();
    expect(
      await count("select count(*) n from users where role = 'manager' and status = 'active'", []),
    ).toBeGreaterThan(0);
  });
});
