import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Application code must reach the database only through withTenant()/withSystem(), because the raw
// connection is a superuser that bypasses RLS. Only these folders may touch the pool or `pg`.
const ALLOWED = ['src/db/', 'src/lib/tenant/'];
const FORBIDDEN = /\bgetPool\b|\bgetDb\b|from ['"]pg['"]/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('database access', () => {
  it('only db/ and lib/tenant/ use the raw pool', () => {
    const offenders = files('src')
      .map((f) => relative('.', f).replaceAll('\\', '/'))
      .filter((f) => !ALLOWED.some((a) => f.startsWith(a)) && !f.endsWith('.test.ts'))
      .filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')));
    expect(offenders, 'use withTenant()/withSystem() from lib/tenant instead').toEqual([]);
  });
});
