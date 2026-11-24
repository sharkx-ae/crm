import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rawClient } from '../helpers/db.ts';

// 0003 converts F1b business hours {days, start, end} into seven per-day windows. The global setup migrates an empty
// database, so this runs the migration's own UPDATE against a legacy row inside a transaction that is rolled back.
const sql = readFileSync('src/db/migrations/0003_project_assign_cursor_daily_hours.sql', 'utf8');
const update = sql
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .find((s) => s.startsWith('UPDATE'));

const client = rawClient();
beforeAll(() => client.connect());
afterAll(() => client.end());

describe('migration 0003', () => {
  it('has the conversion statement', () => {
    expect(update).toBeDefined();
  });

  it('turns legacy hours into seven days and leaves new-shape rows alone', async () => {
    const legacy = randomUUID();
    const modern = randomUUID();
    await client.query('begin');
    try {
      await client.query(
        `insert into projects (id, name, business_hours) values
           ($1, $2, '{"days":[1,2,3,6],"start":"10:00","end":"16:00"}'::jsonb),
           ($3, $4, default)`,
        [legacy, `Legacy ${legacy}`, modern, `Modern ${modern}`],
      );
      await client.query(update as string);
      const { rows } = await client.query<{ id: string; business_hours: unknown }>(
        'select id, business_hours from projects where id = any($1)',
        [[legacy, modern]],
      );
      const byId = Object.fromEntries(rows.map((r) => [r.id, r.business_hours]));
      expect(byId[legacy]).toEqual([
        { day: 1, open: true, from: '10:00', to: '16:00' },
        { day: 2, open: true, from: '10:00', to: '16:00' },
        { day: 3, open: true, from: '10:00', to: '16:00' },
        { day: 4, open: false, from: '10:00', to: '16:00' },
        { day: 5, open: false, from: '10:00', to: '16:00' },
        { day: 6, open: true, from: '10:00', to: '16:00' },
        { day: 7, open: false, from: '10:00', to: '16:00' },
      ]);
      // The column default is already the per-day shape (Mon–Fri open).
      const modernDays = byId[modern] as { day: number; open: boolean }[];
      expect(modernDays).toHaveLength(7);
      expect(modernDays.filter((d) => d.open).map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
    } finally {
      await client.query('rollback');
    }
  });
});
