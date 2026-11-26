import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rawClient } from '../helpers/db.ts';

// 0005 makes wa_numbers.phone_number_id / waba_id and integration_tokens.account_ref NOT NULL. Demo-seeded databases
// already hold rows without them, so the migration backfills first. The global setup migrates an empty database, so
// this relaxes the columns inside a transaction (DDL rolls back too), inserts legacy rows and runs the migration's own
// UPDATE statements.
const statements = readFileSync('src/db/migrations/0005_f3a_wa_routing_keys.sql', 'utf8')
  .split('--> statement-breakpoint')
  .map((s) => s.trim());
const updates = statements.filter((s) => /^UPDATE/m.test(s.replace(/^--.*$/gm, '').trim()));

const client = rawClient();
beforeAll(() => client.connect());
afterAll(() => client.end());

describe('migration 0005', () => {
  it('has a backfill for each column it makes NOT NULL', () => {
    const text = updates.join('\n');
    expect(text).toMatch(/UPDATE "wa_numbers" SET "phone_number_id"/);
    expect(text).toMatch(/UPDATE "wa_numbers" SET "waba_id"/);
    expect(text).toMatch(/UPDATE "integration_tokens" SET "account_ref"/);
  });

  it('gives legacy rows unique placeholders and leaves real values alone', async () => {
    const projectId = randomUUID();
    const [a, b, real] = [randomUUID(), randomUUID(), randomUUID()];
    await client.query('begin');
    try {
      await client.query('alter table wa_numbers alter column phone_number_id drop not null');
      await client.query('alter table wa_numbers alter column waba_id drop not null');
      await client.query('alter table integration_tokens alter column account_ref drop not null');
      await client.query('insert into projects (id, name) values ($1, $2)', [
        projectId,
        `P ${projectId}`,
      ]);
      await client.query(
        `insert into wa_numbers (id, project_id, phone_e164, phone_number_id, waba_id) values
           ($1, $4, '+97140000001', null, null),
           ($2, $4, '+97140000002', null, null),
           ($3, $4, '+97140000003', '555', '666')`,
        [a, b, real, projectId],
      );
      const integration = randomUUID();
      await client.query(
        `insert into integrations (id, project_id, platform) values ($1, $2, 'whatsapp')`,
        [integration, projectId],
      );
      await client.query(
        `insert into integration_tokens (project_id, integration_id, enc_value, key_id, account_ref)
         values ($1, $2, 'enc', 'k1', null)`,
        [projectId, integration],
      );

      for (const u of updates) await client.query(u);

      const { rows } = await client.query<{ id: string; phone_number_id: string; waba_id: string }>(
        'select id, phone_number_id, waba_id from wa_numbers where project_id = $1',
        [projectId],
      );
      const by = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(by[a]?.phone_number_id).toBe(`legacy-${a}`);
      expect(by[b]?.waba_id).toBe(`legacy-${b}`);
      expect(by[a]?.phone_number_id).not.toBe(by[b]?.phone_number_id);
      expect(by[real]).toMatchObject({ phone_number_id: '555', waba_id: '666' });

      const tokens = await client.query<{ account_ref: string | null }>(
        'select account_ref from integration_tokens where project_id = $1',
        [projectId],
      );
      expect(tokens.rows[0]?.account_ref).toMatch(/^legacy-/);

      // and the NOT NULL can now be applied
      await client.query('alter table wa_numbers alter column phone_number_id set not null');
      await client.query('alter table wa_numbers alter column waba_id set not null');
      await client.query('alter table integration_tokens alter column account_ref set not null');
    } finally {
      await client.query('rollback');
    }
  });
});
