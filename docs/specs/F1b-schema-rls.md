# F1b · Schema, RLS, tenant helpers
Owner: A (Alex) · full stack (web + api + db + tests) · Days 3–4 · Release 1 · Tracker: F1.2 · PRD: [F1](../PRD.md#f1)

## Goal
All base tables exist with database-level client isolation, and every query runs through a tenant helper.

## Acceptance criteria
- [ ] A client user reads zero rows from other clients, and none of its own client's staff-only tables (notes, tasks, lead_events, automation, conversion), via UI, actions, API and polling (isolation suite proves it). Super admin and managers read all clients.

## Data model / API / job changes
- Create every table in CONTRACTS §3 (base columns only): `0001_base_tables.sql` (generated) and `0002_roles_rls.sql` (hand-written). Built: 29 tables, minus `client_links` (dropped with the secure link: regenerate `0001`/`0002` before the first push); `integration_tokens` and `notes` also got `project_id`. Role enum is `super_admin|manager|client` (CONTRACTS §1).
- DB roles: the connecting user is owner/migrator; `app_user` (web) and `app_system` (worker, webhooks) are NOLOGIN roles entered with `SET LOCAL ROLE`. Runtime roles own nothing, no BYPASSRLS. One connection string.
- ENABLE + FORCE RLS on all tenant tables. Policy via `app_secure_tenant_table(table, client_access)`: role `super_admin` or `manager`, or `project_id = app.project_id`, or a client in `project_members` and the table's `client_access` (`none` | `read` | `write`, ARCHITECTURE §4) allows it. `project_members` holds client users only.
- `withTenant(actor, fn)` and `withSystem(projectId | null, fn)`: one transaction, `set_config(..., true)` (transaction-local).
- `audit_log` INSERT-only grant. `emitChange()` helper (CONTRACTS §4).

## Files touched
- A (Alex): src/lib/db/*, src/lib/tenant/*, drizzle/*, A-owned modules' schema.ts
- B (John): first versions of B-owned modules' schema.ts written here from CONTRACTS §3; John reviews, then owns them

## Dependencies
F1a.

## Edge cases
- No context set → zero rows, never an error that leaks existence.
- Connection reused after a failed transaction keeps no setting.
- Super admin and manager see all projects; a client sees only its own project's `read`/`write` tables; system context sees exactly one.
- Client of project A reading `notes`, `tasks`, `lead_events`, `automation_rules`, `conversion_*`, `pipeline_stages` or `audit_log` of project A → zero rows.
- Table owner bypass prevented by FORCE.
- Users/sessions/auth_tokens are not tenant tables: column grants keep `pw_hash`/token hashes inside `modules/auth`.

## Out of scope
Auth flows (F1c), seed data (F4a), any UI.

## Test plan
- Isolation suite per tenant table: user of project A cannot read/insert/update/delete project B rows; unset context returns zero rows.
- Per-role matrix: for every tenant table, super admin, manager and client are tested against its declared `client_access`; the structure test fails on a table without one.
- Pool test: two concurrent transactions with different contexts never cross.
- Migration runs clean on an empty database in CI.
