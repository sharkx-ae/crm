# CONTRACTS · frozen Day 1

Shared between **Alex (Dev A, Pipes)** and **John (Dev B, Product)** so both build in parallel from Day 1. Mirrored as Zod in `api/src/contracts` (spec F1a); `web/src/contracts` is a generated copy (`node scripts/sync-contracts.mjs`, never edited by hand).
- Layout: `web` (Next.js BFF) calls `api` (Fastify) over HTTP; §4 functions run inside the api (and worker). Each web-facing api endpoint gets a Zod request/response schema in `api/src/contracts`, added by the spec that needs it. Path mapping for specs: CLAUDE.md "Layers and ownership".
- After Day 1: additive changes only (new optional field, new enum value), in a `contracts:` commit that both devs have agreed to. Renames/removals need both devs and an ARCHITECTURE update.
- Change 2026-11-21 (breaking; both devs agree before pushing; one `contracts:` commit): role enum becomes `super_admin|manager|client` (`admin` renamed, `agent` removed); `can()` no longer nests roles; actions changed per §1; `link` removed from `changeKind`; `client_links` table and `/api/portal/*` removed; `contact.read`, `lead.mark`, `qualification.manage`, `integration.test`, `clientuser.manage` added, `link.manage` removed. Scope trim (same commit): `integration.test`, `agency.manage`, `sendTestLead` and the `agency_settings` table removed; `projects.first_reply_minutes` added; export kind `report` dropped. Not pushed yet: regenerate F1b migrations `0001`/`0002` instead of adding a migration.
- Notation: `?` = optional, `uuid`, `iso` = ISO-8601 UTC string, `e164` = `+9715…`.

## 1 Session and permissions
- `Session { userId: uuid, role: super_admin|manager|client, projectIds: uuid[], locale: en|ar|fr, stage: active|pending_2fa }`
- `can(session, action, projectId?) → boolean`. Super admin and manager: every project. Client: only `projectIds` (one client). `pending_2fa` → always false.
- Roles do not nest: each action lists its allowed roles (`actionRoles` in `api/src/contracts/session.ts`, replacing `actionMinRole`).

| Action | Super admin | Manager | Client (own client) |
|---|---|---|---|
| project.read, lead.read, lead.mark, lead.export, chat.read, report.read, integration.manage | ✓ | ✓ | ✓ |
| contact.read, lead.update, lead.assign, chat.note, task.manage, pipeline.manage, automation.manage, conversion.manage, qualification.manage, project.update, clientuser.manage | ✓ | ✓ | |
| project.create, user.manage, audit.read | ✓ | | |

- `lead.mark` = change status MQL/SQL/Not qualified (+ reason); `lead.update` = every other lead edit (stage, details). `chat.note` covers reading and writing internal notes. `integration.manage` = connect, reconnect. `clientuser.manage` = invite/disable client users; `user.manage` = invite/disable managers. `qualification.manage` = MQL/SQL definitions and reasons list (replaces `link.manage`).
- Client-safe projections: responses for the client role never include owner, stage, notes, events or tasks (enforced in services and by RLS, ARCHITECTURE §4).

## 2 Enums
- `source`: meta, google, youtube, tiktok, linkedin, snapchat, website, whatsapp, csv
- `leadStatus`: new, mql, sql, not_qualified
- `health`: connected, needs_attention, broken, not_connected · `mode`: live, fixture, awaiting
- `direction`: in, out · `origin`: customer, app, history · `msgType`: text, image, audio, video, document, sticker, location, other
- `actorKind`: user, client, system (`client` = a user with the client role; actor id = userId) · `conversionState`: pending, sent, retrying, failed, skipped
- `changeKind`: lead, message, task, health, notification (the client role receives lead, message, health, notification only)
- `notificationKind`: new_lead, new_message, no_reply, task_due, connection_issue, client_marked

## 3 Tables (base versions created once in F1b; then each owner evolves its own)
Every tenant table has `project_id uuid not null` (RLS). All have `id uuid`, timestamps `timestamptz` UTC.

| Table | Key columns | Owner |
|---|---|---|
| users | email (unique), name, role, pw_hash, locale, status | A |
| sessions | token_hash, user_id, stage, idle_expires_at, expires_at | A |
| auth_tokens | user_id, kind invite/reset/email_code, token_hash, expires_at, attempts, used_at | A |
| project_members | project_id, user_id (unique pair); client users only, one project per client user | A (lib/tenant) |
| audit_log | at, actor_kind, actor_id, project_id?, action, entity, entity_id, meta jsonb (INSERT-only) | A |
| rate_limits, error_log | key/window/count · fingerprint, message, context | A |
| integrations | project_id, platform, status (health), mode, account_label, last_data_at, note | A |
| integration_tokens | integration_id, enc_value, key_id, expires_at | A |
| webhook_events | provider, external_id (unique pair), project_id?, payload jsonb, processed_at, error | A |
| wa_numbers | project_id, phone_e164, label, phone_number_id, waba_id, sync_state none/syncing/done/missed, sync_pct | A |
| wa_conversations | project_id, number_id, contact_id, last_message_at | A |
| wa_messages | project_id, conversation_id, wa_message_id (unique), direction, origin, type, text?, ts | A |
| conversion_mappings | project_id, status, meta_event, google_event, enabled | A |
| conversion_events | project_id, lead_id, status, status_seq, platform meta/google, state, attempts, last_error, sent_at; unique(lead_id, status_seq, platform) | A |
| change_feed | id bigserial, project_id, kind, ref_id, at | A |
| projects | name, city, industry, timezone (IANA), business_hours jsonb, first_reply_minutes (default 15), color, created_by | B |
| pipeline_stages | project_id, name, position | B |
| contacts | project_id, name?, phone_e164?, email?; unique(project_id, phone_e164) | B |
| leads | project_id, contact_id, source, external_id?, form_id?, campaign?, answers jsonb, attribution jsonb, status, status_seq, reason?, stage_id, owner_id?, is_test, first_reply_at?; unique(project_id, source, external_id) | B |
| lead_events | project_id, lead_id, kind, data jsonb, actor_kind, actor_id?, at | B |
| lead_forms | project_id, integration_id, external_form_id, name, mapping jsonb | B |
| notes, tasks | lead_id, author_id, text · lead_id?, assignee_id, title, due_at, done_at? | B |
| qualification_settings | project_id, mql_definition, sql_definition, reasons text[] | B |
| automation_rules | project_id, trigger, conditions jsonb, actions jsonb, enabled, run_count | B |
| notifications | user_id, project_id, kind, ref_id, read_at? | B |

## 4 Function contracts
- **`ingestLead(input) → { leadId, contactId, created, merged }`** (owner B; called by A adapters inside `withSystem(projectId)`)
  - input: `projectId, source, externalId?, formId?, campaign?, name?, phone?, email?, answers: {question: answer}, attribution?: {fbclid?, gclid?, utm_source?, utm_medium?, utm_campaign?, utm_term?, utm_content?, adId?}, receivedAt: iso, isTest?`
  - Idempotent on `(projectId, source, externalId)`. Writes lead_events, audit_log, change_feed in one transaction.
- **`recordMessage(input) → { messageId, duplicate, leadId }`** (owner A; calls `ingestLead` with source whatsapp for unknown numbers)
  - input: `projectId, numberId, waMessageId, direction, customerPhone: e164, ts: iso, type: msgType, text?, origin`
- **`changeStatus(leadId, to, reason?, by) → statusChanged`** (owner B). `statusChanged = { leadId, projectId, from, to, statusSeq, reason?, by: {kind: actorKind, id?}, at }`. Same transaction: lead_events + audit_log + one `conversion_events` row (state pending) per enabled mapping + change_feed. Not qualified requires `reason`. `by.kind` is `client` when the actor has the client role (id = userId), `user` for staff.
- **`emitChange(kind, projectId, refId)`** (owner A, `lib/tenant`): inserts change_feed in the caller's transaction.
- **`notify({ projectId, userIds | role, kind, refId, email? })`** (owner B, notifications): creates notifications rows; `email` true for alert kinds.
- **Adapter** (owner A, `modules/integrations/<platform>`): `{ platform, connectDescriptor: { steps: [{ kind: oauth|select|mapping|qr|snippet|upload, labelKey }] }, handleWebhook?(request), poll?(integrationId), health(integrationId) → { status: health, note? }, refresh?(integrationId) }`
- **Wizard actions** (A, consumed by B's wizard): `startConnect(platform, projectId) → redirectUrl | qrSession`, `listChoices(integrationId) → [{id, label, kind: account|page|form|number}]`, `saveChoices(integrationId, ids[])`. Mapping is saved via B's `saveFormMapping(formId, mapping)`.

## 5 Jobs (pg-boss; producer → consumer owner)
| Job | Payload | Producer | Consumer |
|---|---|---|---|
| webhook.process | { webhookEventId } | webhook routes (A) | A |
| wa.history.sync | { numberId, cursor? } | WhatsApp onboarding (A) | A |
| conversion.send | { conversionEventId } | changeStatus (B) | A |
| integration.health | {} (cron 5 min) | worker (A) | A |
| automation.timer | { ruleId, leadId, kind: no_reply\|unreviewed } | leads/automation (B) | B |
| task.reminder | { taskId } | tasks (B) | B |
| email.send | { to, template, locale, data } | any | A |
| csv.import | { projectId, uploadId, mapping } | CSV modal (B UI → A action) | A |
| maintenance | {} (cron daily) | worker (A) | A |

## 6 HTTP routes
- **api public** (owner A): `GET|POST /webhooks/meta` (WhatsApp + Lead Ads, signature) · `POST /webhooks/{google,tiktok,linkedin,snapchat}` · `POST /forms/:key` (rate-limited) · `GET /oauth/:platform/callback` · `GET /health` → `{ status, service, version, checks: { db, queue, integrations }, lastWebhookAt }`
- **api internal** (called only by web, user session token forwarded): one route group per module; shapes in `api/src/contracts`.
- **web BFF** (owner B unless noted): `GET /api/events?since=<cursor>` → `{ cursor, changes: [{ kind: changeKind, projectId, id }] }` (proxies the api) · `GET /api/health` (web + api + db) · `GET /api/export/[kind]` (kind: leads; scoped to the caller's role and projects; excludes is_test)

## 7 Errors
`AppError(code, status)`: UNAUTHENTICATED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, VALIDATION 422, RATE_LIMITED 429, INTEGRATION_ERROR 502, INTERNAL 500. Message keys `errors.<code>` in every locale.

## 8 Fixtures
- `tests/fixtures/<platform>/*.json`: recorded webhook/API payloads (Alex). John's UI uses them before integrations land.
- Seed set (John, F4a): mockup's 5 clients, ~64 leads, chats; a super admin, two managers, one client user per client.
