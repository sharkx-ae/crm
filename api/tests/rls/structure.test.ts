import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLIENT_ACCESS } from '../helpers/access.ts';
import { rawClient } from '../helpers/db.ts';

const client = rawClient();
beforeAll(() => client.connect());
afterAll(() => client.end());

// Tables with a project_id column that are protected by hand-written policies or by grants instead.
// webhook_events: inbound events arrive before their project is known, so it is system-role-only (grants).
const HAND_WRITTEN = ['project_members', 'audit_log', 'webhook_events'];

describe('row-level security structure', () => {
  it('every table with a project_id column, plus projects, is registered with the expected client_access', async () => {
    const { rows: tables } = await client.query<{ relname: string }>(`
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and (c.relname = 'projects' or exists (
          select 1 from pg_attribute a
          where a.attrelid = c.oid and a.attname = 'project_id' and not a.attisdropped))
      order by c.relname`);
    const needRegistration = tables.map((r) => r.relname).filter((t) => !HAND_WRITTEN.includes(t));

    const { rows: registered } = await client.query<{ table_name: string; client_access: string }>(
      'select table_name, client_access from tenant_tables order by table_name',
    );
    const registry = Object.fromEntries(registered.map((r) => [r.table_name, r.client_access]));

    const missing = needRegistration.filter((t) => !(t in registry));
    expect(
      missing,
      `tables missing from tenant_tables (call app_secure_tenant_table('<t>', '<client_access>') in their migration): ${missing}`,
    ).toEqual([]);
    expect(registry).toEqual(CLIENT_ACCESS);
    expect(Object.keys(CLIENT_ACCESS)).toHaveLength(19);
  });

  it('every registered table has RLS enabled, forced and the four tenant policies', async () => {
    const { rows } = await client.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      policies: string[];
    }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity,
              coalesce((select array_agg(p.policyname::text order by p.policyname) from pg_policies p
                        where p.schemaname = 'public' and p.tablename = c.relname
                          and p.policyname like 'tenant\\_%'), '{}') as policies
       from pg_class c join tenant_tables t on t.table_name = c.relname
       where c.relnamespace = 'public'::regnamespace
       order by c.relname`,
    );
    expect(rows).toHaveLength(Object.keys(CLIENT_ACCESS).length);
    for (const r of rows) {
      expect(r.relrowsecurity, `${r.relname} enabled`).toBe(true);
      expect(r.relforcerowsecurity, `${r.relname} forced`).toBe(true);
      expect(r.policies, r.relname).toEqual([
        'tenant_delete',
        'tenant_insert',
        'tenant_read',
        'tenant_update',
      ]);
    }
  });

  it('users, audit_log and project_members have RLS forced', async () => {
    const { rows } = await client.query<{ relname: string; f: boolean; e: boolean }>(
      `select relname, relforcerowsecurity as f, relrowsecurity as e from pg_class
       where relnamespace = 'public'::regnamespace and relname in ('users', 'audit_log', 'project_members')`,
    );
    expect(rows.map((r) => r.relname).sort()).toEqual(['audit_log', 'project_members', 'users']);
    for (const r of rows) {
      expect(r.e, `${r.relname} enabled`).toBe(true);
      expect(r.f, `${r.relname} forced`).toBe(true);
    }
  });

  it('app roles own nothing and cannot bypass RLS', async () => {
    const { rows } = await client.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `select rolname, rolsuper, rolbypassrls from pg_roles where rolname in ('app_user', 'app_system')`,
    );
    expect(rows.map((r) => r.rolname).sort()).toEqual(['app_system', 'app_user']);
    for (const r of rows) {
      expect(r.rolsuper).toBe(false);
      expect(r.rolbypassrls).toBe(false);
    }
    const owned = await client.query(
      `select 1 from pg_class c join pg_roles r on r.oid = c.relowner
       where r.rolname in ('app_user', 'app_system') and c.relnamespace = 'public'::regnamespace`,
    );
    expect(owned.rowCount).toBe(0);
  });

  it('context functions are security invoker', async () => {
    const { rows } = await client.query<{ proname: string; prosecdef: boolean }>(
      `select proname, prosecdef from pg_proc
       where pronamespace = 'public'::regnamespace and proname like 'app\\_%'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.filter((r) => r.prosecdef).map((r) => r.proname)).toEqual([]);
  });

  it('privileges: tokens and secrets are out of reach of app_user', async () => {
    const q = (sql: string) => client.query<{ ok: boolean }>(sql).then((r) => r.rows[0]?.ok);
    for (const t of [
      'sessions',
      'auth_tokens',
      'rate_limits',
      'error_log',
      'webhook_events',
      'integration_tokens',
      'tenant_tables',
    ]) {
      expect(await q(`select has_table_privilege('app_user', '${t}', 'select') as ok`), t).toBe(
        false,
      );
    }
    expect(
      await q(`select has_column_privilege('app_user', 'users', 'pw_hash', 'select') as ok`),
    ).toBe(false);
    expect(
      await q(`select has_column_privilege('app_user', 'users', 'email', 'select') as ok`),
    ).toBe(true);
    for (const role of ['app_user', 'app_system']) {
      expect(await q(`select has_table_privilege('${role}', 'audit_log', 'update') as ok`)).toBe(
        false,
      );
      expect(await q(`select has_table_privilege('${role}', 'audit_log', 'delete') as ok`)).toBe(
        false,
      );
      expect(await q(`select has_table_privilege('${role}', 'audit_log', 'insert') as ok`)).toBe(
        true,
      );
    }
  });

  it('there can be only one super admin', async () => {
    const { rows } = await client.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where indexname = 'users_one_super_admin'`,
    );
    expect(rows).toHaveLength(1);
  });
});
