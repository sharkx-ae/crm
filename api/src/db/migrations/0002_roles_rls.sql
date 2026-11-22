-- 0002: database roles, grants and row-level security (ARCHITECTURE §4, F1 plan §3.2).
-- The connecting user (owner/migrator) switches into app_user / app_system with SET LOCAL ROLE
-- (see src/lib/tenant). Neither role owns tables or bypasses RLS; every table below uses ENABLE + FORCE.
-- Unset context gives NULL, so every policy matches nothing (zero rows, never an error).

-- ---------- 1. roles ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN CREATE ROLE app_user NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_system') THEN CREATE ROLE app_system NOLOGIN; END IF;
  EXECUTE format('GRANT app_user, app_system TO %I', current_user);
END $$;
--> statement-breakpoint

-- ---------- 2. schema usage ----------
GRANT USAGE ON SCHEMA public TO app_user, app_system;
--> statement-breakpoint

-- ---------- 3. context readers: LANGUAGE sql STABLE, security invoker (never SECURITY DEFINER) ----------
CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_project_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.project_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.role', true), '') $$;
--> statement-breakpoint
CREATE FUNCTION app_is_staff() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT current_user = 'app_user' AND coalesce(app_role() IN ('super_admin', 'manager'), false) $$;
--> statement-breakpoint
-- A client belongs to exactly one project, so this is a scalar. Policies call it as (SELECT app_client_project())
-- so Postgres evaluates it once per statement (initplan), not once per row.
CREATE FUNCTION app_client_project() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT m.project_id FROM project_members m WHERE app_role() = 'client' AND m.user_id = app_user_id() $$;
--> statement-breakpoint

-- ---------- 4. registry and policy generator ----------
-- Every table with a tenant key is registered here with what a client may do on it. No grants: app roles never read it.
CREATE TABLE tenant_tables (
  table_name text PRIMARY KEY,
  client_access text NOT NULL CHECK (client_access IN ('none', 'read', 'write'))
);
--> statement-breakpoint
ALTER TABLE tenant_tables ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant_tables FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- S (staff or the system context of this project) always passes; C (the client's own project, plus the optional
-- client_filter) passes per client_access. 'write' lets a client SELECT, INSERT and UPDATE; DELETE is staff/system only.
-- Column limits stay in services (ARCHITECTURE §4).
CREATE FUNCTION app_secure_tenant_table(
  t regclass, client_access text, key text DEFAULT 'project_id', client_filter text DEFAULT 'true'
) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  s text := format('(app_is_staff() OR (current_user = ''app_system'' AND %I = app_project_id()))', key);
  c text := format('(%I = (SELECT app_client_project()) AND (%s))', key, client_filter);
  read_cond text;
  write_cond text;
BEGIN
  IF client_access NOT IN ('none', 'read', 'write') THEN
    RAISE EXCEPTION 'client_access must be none, read or write, got %', client_access;
  END IF;
  read_cond := CASE WHEN client_access = 'none' THEN s ELSE format('%s OR %s', s, c) END;
  write_cond := CASE WHEN client_access = 'write' THEN format('%s OR %s', s, c) ELSE s END;

  INSERT INTO tenant_tables (table_name, client_access) VALUES (t::text, client_access)
    ON CONFLICT (table_name) DO UPDATE SET client_access = EXCLUDED.client_access;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_read ON %s', t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %s', t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %s', t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON %s', t);
  EXECUTE format('CREATE POLICY tenant_read ON %s FOR SELECT TO app_user, app_system USING (%s)', t, read_cond);
  EXECUTE format('CREATE POLICY tenant_insert ON %s FOR INSERT TO app_user, app_system WITH CHECK (%s)', t, write_cond);
  EXECUTE format('CREATE POLICY tenant_update ON %s FOR UPDATE TO app_user, app_system USING (%s) WITH CHECK (%s)', t, write_cond, write_cond);
  EXECUTE format('CREATE POLICY tenant_delete ON %s FOR DELETE TO app_user, app_system USING (%s)', t, s);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO app_user, app_system', t);
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, app_system;
END $fn$;
--> statement-breakpoint

-- ---------- 5. the 19 registrations (tests/rls/structure.test.ts holds this map) ----------
SELECT app_secure_tenant_table('projects', 'read', 'id');
--> statement-breakpoint
SELECT app_secure_tenant_table('pipeline_stages', 'none');
--> statement-breakpoint
SELECT app_secure_tenant_table('contacts', 'read');
--> statement-breakpoint
SELECT app_secure_tenant_table('leads', 'write');
--> statement-breakpoint
SELECT app_secure_tenant_table('lead_events', 'none');
--> statement-breakpoint
SELECT app_secure_tenant_table('lead_forms', 'write');
--> statement-breakpoint
SELECT app_secure_tenant_table('notes', 'none');
--> statement-breakpoint
SELECT app_secure_tenant_table('tasks', 'none');
--> statement-breakpoint
SELECT app_secure_tenant_table('qualification_settings', 'read');
--> statement-breakpoint
SELECT app_secure_tenant_table('automation_rules', 'none');
--> statement-breakpoint
SELECT app_secure_tenant_table('integrations', 'write');
--> statement-breakpoint
SELECT app_secure_tenant_table('integration_tokens', 'none');
--> statement-breakpoint
SELECT app_secure_tenant_table('wa_numbers', 'write');
--> statement-breakpoint
SELECT app_secure_tenant_table('wa_conversations', 'read');
--> statement-breakpoint
SELECT app_secure_tenant_table('wa_messages', 'read');
--> statement-breakpoint
SELECT app_secure_tenant_table('conversion_mappings', 'none');
--> statement-breakpoint
SELECT app_secure_tenant_table('conversion_events', 'none');
--> statement-breakpoint
SELECT app_secure_tenant_table('change_feed', 'read', 'project_id', $f$kind IN ('lead', 'message', 'health', 'notification')$f$);
--> statement-breakpoint
-- A client reads and marks only its own notifications.
SELECT app_secure_tenant_table('notifications', 'write', 'project_id', 'user_id = app_user_id()');
--> statement-breakpoint

-- ---------- 6. extra policies on registered tables ----------
-- Cron loops list every client without a project context, then work one project at a time.
CREATE POLICY projects_list ON projects FOR SELECT TO app_system USING (true);
--> statement-breakpoint
-- The daily maintenance job prunes the polling feed across projects (project context unset).
CREATE POLICY change_feed_prune ON change_feed FOR DELETE TO app_system
  USING (app_project_id() IS NULL AND at < now() - interval '7 days');
--> statement-breakpoint
-- Tokens are decrypted only in adapters (system role).
REVOKE ALL ON integration_tokens FROM app_user;
--> statement-breakpoint

-- ---------- 7. hand-written policies (not registered) ----------
-- project_members: client users only. System reads every membership because session resolution runs in withSystem(null).
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE project_members FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY members_read ON project_members FOR SELECT TO app_user, app_system
  USING (app_is_staff() OR user_id = app_user_id() OR current_user = 'app_system');
--> statement-breakpoint
CREATE POLICY members_insert ON project_members FOR INSERT TO app_user, app_system
  WITH CHECK (app_is_staff() OR (current_user = 'app_system' AND project_id = app_project_id()));
--> statement-breakpoint
CREATE POLICY members_update ON project_members FOR UPDATE TO app_user, app_system
  USING (app_is_staff() OR (current_user = 'app_system' AND project_id = app_project_id()))
  WITH CHECK (app_is_staff() OR (current_user = 'app_system' AND project_id = app_project_id()));
--> statement-breakpoint
CREATE POLICY members_delete ON project_members FOR DELETE TO app_user, app_system
  USING (app_is_staff() OR (current_user = 'app_system' AND project_id = app_project_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON project_members TO app_user, app_system;
--> statement-breakpoint

-- audit_log: append-only. A web user cannot write rows in someone else's name; only the super admin reads.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_insert ON audit_log FOR INSERT TO app_user, app_system
  WITH CHECK (
    (current_user = 'app_system' AND (project_id IS NULL OR project_id = app_project_id()))
    OR (current_user = 'app_user' AND actor_id = app_user_id()
        AND (project_id IS NULL OR app_is_staff() OR project_id = (SELECT app_client_project())))
  );
--> statement-breakpoint
CREATE POLICY audit_read ON audit_log FOR SELECT TO app_user, app_system
  USING (
    (current_user = 'app_user' AND app_role() = 'super_admin')
    OR (current_user = 'app_system' AND project_id IS NOT NULL AND project_id = app_project_id())
  );
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_log TO app_user, app_system;
--> statement-breakpoint

-- users: staff read all, a client reads itself; pw_hash is never readable by app_user (column grant below).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_read ON users FOR SELECT TO app_user
  USING (app_is_staff() OR id = app_user_id());
--> statement-breakpoint
CREATE POLICY users_system ON users FOR ALL TO app_system USING (true) WITH CHECK (true);
--> statement-breakpoint

-- ---------- 8. grants on non-tenant tables ----------
GRANT SELECT (id, email, name, role, locale, status, invited_by, created_at, updated_at) ON users TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, auth_tokens, rate_limits, error_log, webhook_events TO app_system;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, app_system;
--> statement-breakpoint

-- ---------- 9. one super admin ----------
CREATE UNIQUE INDEX users_one_super_admin ON users ((1)) WHERE role = 'super_admin';
