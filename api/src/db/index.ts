import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { getDbEnv } from '../lib/env.ts';
import * as schema from './schema/index.ts';

// One lazy pool per process. Application code must NOT query through this directly:
// use withTenant()/withSystem() from lib/tenant, which switch to a restricted role so RLS applies.
let pool: pg.Pool | undefined;
let db: ReturnType<typeof create> | undefined;

const create = (p: pg.Pool) => drizzle(p, { schema });

export type Db = ReturnType<typeof create>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: getDbEnv().DATABASE_URL, max: 10 });
  return pool;
}

export function getDb(): Db {
  db ??= create(getPool());
  return db;
}

export async function pingDb(timeoutMs = 2000): Promise<'ok' | 'error'> {
  try {
    await Promise.race([
      getPool().query('select 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return 'ok';
  } catch {
    return 'error';
  }
}
