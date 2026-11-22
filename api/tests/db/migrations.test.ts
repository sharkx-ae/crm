import { readdirSync } from 'node:fs';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_SCHEMA, MIGRATIONS_TABLE } from '../../src/db/migrator.ts';
import { getTestDbUrl } from '../../src/lib/env.ts';

const pool = new pg.Pool({ connectionString: getTestDbUrl(), max: 1 });
afterAll(() => pool.end());

describe('test database', () => {
  it('is reachable', async () => {
    const { rows } = await pool.query<{ ok: number }>('select 1 as ok');
    expect(rows[0]?.ok).toBe(1);
  });

  it('applied every migration from global setup on an empty database', async () => {
    const { rows } = await pool.query<{ n: string }>(
      `select count(*)::text as n from ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`,
    );
    const onDisk = readdirSync('src/db/migrations').filter((f) => f.endsWith('.sql')).length;
    expect(Number(rows[0]?.n)).toBe(onDisk);
  });

  it('created the 27 base tables', async () => {
    const { rows } = await pool.query<{ n: string }>(
      `select count(*)::text as n from pg_tables where schemaname = 'public'`,
    );
    // 27 from 0001 plus the tenant_tables registry from 0002; later migrations add their own.
    expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(28);
  });
});
