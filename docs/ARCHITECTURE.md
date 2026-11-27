# ARCHITECTURE · SHARKX Agency CRM

Features and acceptance: `docs/PRD.md`. Rules, ownership, conventions: `CLAUDE.md`.

## 1 Stack
| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node 26.13.1 LTS, pnpm 10.34.9 (one per app, no root workspace) | Pinned in `.nvmrc`, each app's `engines` and `packageManager`. Fallback Node 24 if Railway can't build 26 |
| Web (`web`) | Next.js 16.4.6 (App Router), React 19.3.1, TypeScript 6.0.3 strict | UI + BFF only, no DB access. Cache Components OFF. TS 7.0 exists but Next needs an experimental flag for it |
| API (`api`) | Fastify 5.12.8 on Node native TypeScript | Domain logic, DB/RLS, webhooks, OAuth callbacks, public form endpoint |
| Worker (`api`) | pg-boss 12.38.2, same code as the api, separate process | Needs Node ≥22.12, Postgres ≥13 |
| Shared contracts | Zod 4.6.7 schemas; source `api/src/contracts`, generated copy `web/src/contracts` | `node scripts/sync-contracts.mjs`; CI fails if the copy is stale |
| UI | Tailwind 4.3.5 (logical properties), Radix (`radix-ui` 1.8.1), dnd-kit, hand-rolled SVG charts | Brand tokens from `skills/sharkx-brand-guidelines/assets/tokens.json`; Sharp Sans + GE Flow (Arabic), Segoe UI fallback until the licensed font files arrive |
| Data | Postgres 18.7, Drizzle ORM 0.45.4 + drizzle-kit 0.31.11 | RLS policies as SQL in migrations |
| Libraries | next-intl 4.15.1, SWR, libphonenumber-js, Papaparse | Added in the spec that first needs them |
| Email | Resend HTTP API via `fetch` (no SDK), plain TS templates (EN now, AR/FR at the D18 batch) | |
| Crypto | Node built-in `scrypt`, `crypto` (AES-256-GCM, sha256) | No native modules |
| Quality | Biome 2.6.8, Vitest 5.1.1, Playwright 1.65.1, GitHub Actions | |

Exact versions are pinned in each `package.json` and the lockfile. No other dependency without approval.

## 2 Topology and deployment
- Railway project `sharkx-crm`, region Europe West (Amsterdam); environments `staging`, `production`.
- Services (one repo; each service's Railway root directory is its app folder): `web` (`web/railway.json`: Next.js UI + BFF), `api` (`api/railway.json`: Fastify backend; runs migrations pre-deploy), `worker` (`api/railway.worker.json`: pg-boss, api code), Postgres. Watch paths `/web/**` and `/api/**` so a change in one app doesn't redeploy the other.
- Traffic: browser → `web` only. `web` → `api` over Railway private networking (`API_URL`). Public `api` domain only for platform webhooks, OAuth callbacks and the website form endpoint.
- Domains: `app.<domain>` → `web` (staff and client users); `api.<domain>` → `api`.
- Public HTTPS staging URLs from day 1 (Meta/Google webhooks and OAuth callbacks need them).
- CI (GitHub Actions, runs on every push to `master`; developers also run `node scripts/verify.mjs` before pushing): jobs `api` and `web`, each: install `--frozen-lockfile` → typecheck → Biome → Vitest (api with a Postgres service) → `pnpm audit --prod` (non-blocking for now); web also checks the contracts copy. Aggregate required check: `verify`.
- CD: Railway GitHub integration with wait-for-CI. `master` → staging automatically; production deploys from `main`, which only changes through a `master` → `main` release pull request after UAT. Healthchecks: web `/api/health` (checks api + db), api `/health` (checks db). Steps: `docs/ENVIRONMENTS.md`.
- Backups: Railway Postgres backups on (verify availability day 1) + one restore drill before production.
- Residency: Railway has no UAE region. Single connection-string config so a later move is config + data migration.

## 3 Folder structure
```
web/                     frontend only: Next.js UI + BFF (no DB access)
  src/app/[locale]/(auth)/   login, code, reset, accept-invite
  src/app/[locale]/(app)/    clients home, p/[projectId]/{overview,inbox,leads,contacts,pipeline,tasks,reports,integrations,settings}, agency settings, audit (nav and routes role-gated: client users get only overview, leads, inbox, reports, integrations of their own client)
  src/app/api/               BFF route handlers: health, events (polling), export
  src/components/  src/lib/{env,i18n,api}  src/proxy.ts
  src/contracts/             GENERATED copy of api/src/contracts (never edit)
  messages/{en,ar,fr}/<module>.json
  tests/e2e/                 Playwright (starts api + web)
  scripts/                   logical-CSS check
  railway.json  playwright.config.ts  package.json  .env.example
api/                     backend only: Fastify + worker
  src/routes/            HTTP routes (internal for web; public: webhooks, oauth, forms, health)
  src/modules/<domain>/  index.ts (public API) · schema.ts · service.ts · routes.ts · *.test.ts
    auth audit projects leads contacts pipeline tasks automation whatsapp
    conversion reports notifications webhooks
    integrations/{meta,google,tiktok,linkedin,snapchat,website,csv,hub}
  src/contracts/         Zod schemas shared with web (source of truth, frozen day 1)
  src/db/                client, schema barrel, migrator, migrations/ (single lane)
  src/lib/{env,log,tenant,email,crypto,errors,rate-limit}
  src/worker/            pg-boss entry + queue registry
  tests/{setup,fixtures}
  docker/  docker-compose.yml  railway.json  railway.worker.json  drizzle.config.ts  package.json  .env.example
docs/                    PRD, ARCHITECTURE, ENVIRONMENTS, CONTACT-SHARKX, plan.html
  specs/                 STATUS, ORDER, CONTRACTS, one file per spec
  inputs/                SOW, requirements, mockup (read-only references)
scripts/  tracker/       tracker CLI and dashboard · contracts sync script
.github/workflows/       CI
```
- Layering: web (pages, Server Actions, BFF route handlers) → HTTP → api routes → `modules/*/service.ts` → `src/db`. The worker calls the same services in-process. The browser never calls the api directly.
- Spec paths: `src/app/api/**` in specs means api routes (`api/src/routes`); other `src/app/**`, `src/components/**`, `messages/**` mean `web/...`; other `src/**` means `api/src/...`; `src/contracts` means `api/src/contracts`.

## 4 Data model and RLS
Tenant = `project` (client). Every tenant table has `project_id uuid not null`.
- **Access:** users (role: super_admin | manager | client), sessions, auth_tokens (invite|reset|email_code; hashed, expiry, attempts), project_members (client users only: one row per client user; super admin and managers see every project and have no rows), audit_log (append-only), rate_limits.
- **Core:** projects (timezone, business_hours), pipeline_stages, contacts (unique project_id + phone_e164), leads (status new|mql|sql|not_qualified, reason, stage_id, owner_id, source, campaign, form_id, answers jsonb, is_test, external_id), lead_events (timeline), notes, tasks.
- **Integrations:** integrations (status, account, last_data_at), integration_tokens (AES-GCM), lead_forms (mapping jsonb), webhook_events (payload, processed_at).
- **WhatsApp:** wa_numbers, wa_conversations, wa_messages (direction; origin customer|app|history).
- **Qualification:** qualification_settings (definitions, reasons).
- **Conversion:** conversion_mappings, conversion_events (id = Meta event_id; state; attempts).
- **Ops:** automation_rules, notifications, change_feed (bigserial, polling), error_log.
- `project_members` and the RLS policies live in `lib/tenant` (owner A).

**RLS**
- Roles (migration `0002_roles_rls.sql`): the connecting user is the owner/migrator. `app_user` (web requests) and `app_system` (worker, webhooks) are NOLOGIN roles it switches into with `SET LOCAL ROLE`. Neither owns tables or bypasses RLS; tenant tables use ENABLE + FORCE ROW LEVEL SECURITY. One `DATABASE_URL`, one pool: no separate credentials per role.
- Helpers in `lib/tenant`: `withTenant({userId, role}, fn)` and `withSystem(projectId | null, fn)`. Each is one transaction that sets the role and `set_config('app.user_id' | 'app.role' | 'app.project_id', …, true)` (transaction-local, safe with pooled connections). Unset → policies match nothing. Only `db/` and `lib/tenant/` may touch the raw pool (`tests/rls/no-raw-pool.test.ts`).
- Standard policy, applied by `app_secure_tenant_table('<table>', '<client_access>')`: row visible if role is `super_admin` or `manager`, or `project_id = app.project_id` (system context), or the user is a client in `project_members` for that project **and** the table's `client_access` allows it. `client_access` is `none` (clients read nothing: notes, tasks, lead_events, automation_rules, conversion_mappings, conversion_events, pipeline_stages), `read` (projects, contacts, leads, wa_numbers, wa_conversations, wa_messages, integrations, lead_forms, qualification_settings, change_feed limited to kinds lead, message, health, notification) or `write` (leads: status mark only, through the service; integrations, lead_forms, wa_numbers: connectors). Every new tenant table calls this function with an explicit `client_access` in its migration; `tests/rls/structure.test.ts` fails otherwise.
- Column limits are not an RLS feature: services return client-safe projections for the client role (no owner_id, stage_id, notes, events), and only the marking service updates `leads.status`, `status_seq` and `reason` for clients.
- Policy shape (migration 0002, F1 plan §3.2): context readers `app_user_id()`, `app_project_id()`, `app_role()`, `app_is_staff()`, `app_client_project()` are `LANGUAGE sql STABLE`, security invoker; policies call `(SELECT app_client_project())` so it runs once per statement. `app_secure_tenant_table(table, client_access, key, client_filter)` records the table in the `tenant_tables` registry and writes four policies (`tenant_read|insert|update|delete`). `write` lets a client SELECT, INSERT and UPDATE; DELETE is always staff or system. `tests/rls/structure.test.ts` holds the registry map (19 tables).
- Additions to the table above: `notifications` is `write` with `client_filter user_id = app_user_id()` (a client reads and marks only its own); `change_feed` has a `kind IN (lead, message, health, notification)` filter and two system-only policies, `change_feed_prune_read` and `change_feed_prune` (rows older than 7 days, no project context), which the daily maintenance job uses; a DELETE with a WHERE also needs a SELECT policy, hence the pair.
- Exceptions: `project_members` (client users only, `unique(user_id)`: one client per user; staff and system write; system reads every membership because session resolution runs in `withSystem(null)`); `projects` (key is `id`; `app_system` can list all rows for cron loops); `audit_log` (INSERT/SELECT only; a web user may only insert rows with its own `actor_id` and, for a client, inside its project; reads are the **super admin** only, plus the system's own project); `users` (RLS forced: staff read all, a client reads itself, `app_system` everything; `pw_hash` is excluded from `app_user`'s column grant; one super admin by the unique index `users_one_super_admin`); `webhook_events` and `integration_tokens` are system-only; `sessions`, `auth_tokens`, `rate_limits`, `error_log` are system-only by grants.
- Project creation: the service pre-generates the id and runs `withSystem(newId)` (project, member rows, default stages in one transaction).
- Isolation suite (`tests/rls/`): cross-client reads and writes, no-context, per role (super admin, manager, client) and system, `client_access` per table, grants, concurrent pooled transactions, failure leaves no context.

**Rules**
- Contact 1—N lead. A new submission matches the contact by phone (else email); it merges into the open lead's timeline (status ≠ not_qualified), otherwise opens a new lead.
- Idempotency: webhook_events (provider, external_id) unique; wa_messages.wa_message_id unique; leads (project, source, external_id) unique; conversion_events (lead, status_seq, platform) unique.
- Time: UTC `timestamptz`; shown in the project's IANA zone (Asia/Dubai, Africa/Casablanca).

## 5 Contracts
`src/contracts/` (Zod; frozen day 1; changes in their own `contracts:` commit, announced to the other dev):
- `ingestLead(input)` → `{leadId, contactId, created, merged}`. Input: projectId, source, externalId?, formId?, campaign?, name?, phone?, email?, answers{}, attribution{fbclid, gclid, utm…}, receivedAt, isTest?.
- `recordMessage(input)` → `{messageId, duplicate}`. Input: projectId, numberId, waMessageId, direction, phone, ts, type, text?, origin.
- `statusChanged` → `{leadId, projectId, from, to, by{kind,id}, at}`; written to the conversion outbox in the same transaction.
- `can(user, action, projectId?)` → boolean; actions enumerated in the contract file.
- `GET /api/events?since=<n>` → `{cursor, changes[{kind, projectId, id}]}`; the client refetches changed resources (intervals: PRD F14).

HTTP: api public routes `/webhooks/{meta,google,tiktok,linkedin,snapchat}`, `/forms/:key`, `/oauth/:platform/callback`, `/health`; api internal routes are called only by web (session token forwarded). Web BFF route handlers: `/api/health`, `/api/events`, `/api/export/[kind]`. Everything else in web is Server Components/Actions.

Jobs (pg-boss; a `singletonKey` dedupes only inside a time window, so `enqueue()` always adds one, an hour by default). The api produces with `supervise:false, schedule:false`; the worker supervises and schedules. `enqueue()` runs after the producing transaction commits; conversion durability (F11a) comes from `conversion_events` as the outbox, not from a shared transaction:
| Queue | Trigger | Retry |
|---|---|---|
| webhook.process | webhook stored | 5×, backoff |
| wa.history.sync | onboarding done | resumable chunks, must finish ≤24 h |
| conversion.send | statusChanged | 8×, exponential from 10 s (first send ≤60 s) |
| integration.health | cron 5 min | none |
| automation.timer | delayed (no-reply 15 min, unreviewed 48 h) | 3× |
| task.reminder | delayed to due_at | 3× |
| email.send | alerts and reminders (never invite, code or reset mails: they carry a secret and are sent directly) | 5×, 30 s backoff, kept 1 day |
| csv.import | upload | none; row errors reported |
| maintenance | cron daily 03:00 UTC: prune change_feed (7 d), rate_limits (1 d), auth_tokens (expired 7 d), sessions (expired), error_log (90 d), webhook_events (processed over 30 d ago; a row never processed is kept, however old) | none |

Exhausted jobs → `error_log` + alert email.

## 6 Auth and sessions
- Email + password: scrypt (N=2^15, r=8, p=1, per-user salt), ≥12 chars. Invite = single-use link (72 h) to set a password; reset link 1 h; tokens 256-bit, stored as sha256.
- 2FA: after the password, a 6-digit emailed code (hashed, 10 min, 5 attempts); session stays `pending_2fa` until verified. TOTP is an Extra.
- Session: opaque 256-bit token (sha256 in DB); `__Host-sharkx_session` cookie, HttpOnly, Secure, SameSite=Lax (plain `sharkx_session` without Secure when `APP_ENV=local`, since local runs on http); rotated on login and 2FA; a `pending_2fa` session lives 15 min, an active one idle 12 h (slides at most every 5 min), absolute 7 d; revoked on password change, reset and disable. Web sets and clears the cookie in Server Actions only; the api never sets cookies.
- **Internal token:** the api's public domain also serves the internal routes, so every non-public route needs `x-internal-token` = `INTERNAL_API_TOKEN` (32+ random characters, the same value in `web` and `api`, replaces web's unused `SESSION_SECRET`). `x-client-ip` is trusted only after that check.
- **Email routing:** invite, code and reset mails carry a secret, so they are sent directly from the request (reset after the reply) and never queued; alerts and later reminders go through the `email.send` job. Resend is called with `fetch` (no SDK). `APP_ENV=local` writes mails to `api/.mail/*.json` (git-ignored) instead; tests use a memory transport.
- **Failure bookkeeping** (rate-limit hits, `auth.login_failed` audits, code-attempt counters) commits before the error is thrown. Unknown users are verified against a dummy hash so timing does not reveal them. Re-inviting an email that is still `invited` (same role and client) reissues the link.
- Rate limits (Postgres): login 5/15 min per email+IP; code verify 5 per code; code send 3/10 min; reset 3/h; forms per IP.
- CSRF: Server Actions same-origin check; cookie-authenticated route handlers verify Origin; webhooks use signatures only.
- Headers: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`.
- Roles: `super_admin` (seeded), `manager` (invited by the super admin), `client` (invited by the super admin or a manager, for one client). All use the same login, session, 2FA and rate limits; a client user's session carries the one `projectId` of its client.

## 7 Integrations
Adapter (`modules/integrations/<platform>`): `connectDescriptor` (steps/fields for B's generic wizard), `handleWebhook` or `poll` → `ingestLead`, `health`, `refresh`. Recorded payloads in `fixtures/`; every adapter is built fixture-first.
| Platform | Inbound | Outbound | Access gate | Until live |
|---|---|---|---|---|
| WhatsApp | Cloud API webhooks (messages, history, app-sent echoes) | none | SHARKX business verification; Tech Provider; App Review Advanced access for messaging + management (screen recording per permission, submit ≈D8–9); client QR scan; app ≥2.24.17, ≥7 days active | Meta test number + fixtures |
| Meta Lead Ads | `leadgen` webhook → Graph retrieve | Conversions API | Same verification; lead-retrieval permissions via App Review | Lead testing tool; CAPI `test_event_code` |
| Google | Lead-form webhook (key) | Data Manager API (OAuth + Data Manager scope; no developer token) | Google Ads admin + linked conversion action | Fixtures |
| TikTok | Webhook / poll | none | Developer app + review (terms unclear) | Fixtures |
| LinkedIn | Lead Sync API poll / notifications | none | Application via app Products tab; no response SLA; legal entity + verified Page | Fixtures |
| Snapchat | Marketing API webhook / poll | none | Org Admin on the ad account | Fixtures |
| Website | `POST /api/forms/[key]` | none | none | n/a |
| CSV | upload (in memory) | none | none | n/a |

- WhatsApp limits to design for: one history sync per onboarding within 24 h (else offboard and redo); the app must be opened about every 13–14 days or the link drops; groups not synced; companion apps unlink; Unofficial WhatsApp tools are barred by the SOW.
- WhatsApp onboarding (F3a): Embedded Signup **v5** (`extras: { setup: {}, version: 'v5' }`; v2/v3 deprecated 2026-10-15), **QR path only** (Coexistence): the number stays on the WhatsApp Business app, so there is no `/register` call, and a `FINISH` event (a new Cloud API number) is refused with `qr_only`. The v5 session info (`messaging_account_ids`, `phone_number_id`, `is_on_biz_app`) and the code come from the browser as hints; the api exchanges the code, checks every WABA id against the token (`debug_token` `granular_scopes`) and the phone id against the WABA's own number list, subscribes the app to the WABA, then stores one sealed business token per WABA. History sync (`smb_app_data`) must start within 24 h of onboarding (`wa_numbers.onboarded_at`, F3b). Coexistence needs Tech Provider status; until it is granted only people with a role on the Meta app can complete the flow. Meta allows one callback URL per app and needs public HTTPS, so webhook checks run in production (staging leaves the Meta variables unset and answers 404). An unverified business is limited to about 10 new customers per 7 days (figure from partner docs, not a Meta page: unconfirmed); the connect card shows a static notice while `META_ONBOARDING_LIMITED=true`.
- Meta webhook receiver (`GET|POST /webhooks/meta`): the POST reads the raw bytes (a buffer parser scoped to that plugin only), verifies `X-Hub-Signature-256` (HMAC-SHA256 of those exact bytes with the app secret, constant time) before anything is stored, then inserts `webhook_events` with `external_id = sha256:<hex of the body>` (Meta sends no delivery id), queues `webhook.process` with the row id as `singletonKey`, and answers 200. A duplicate already processed is not queued again; a queue failure answers 500 so Meta retries and the retry queues it. Only rejected requests are throttled (bad signature or bad verify token: 20 per client address per 10 minutes, then 429 before the body is read); valid deliveries are never counted, so a burst from Meta is never refused.
- Google Ads API no longer accepts new offline-conversion adopters (2026-06-15), so conversions go through the Data Manager API only.
- Hub labels each adapter Live / Fixture-verified / Awaiting access.
- Connectors: super admin, managers and client users (own client) can connect and reconnect (`integration.manage`); every connect is audited with its actor. Whoever connects must hold the needed role on the platform itself (Page admin, Google Ads admin, Snapchat Org Admin…); the adapter explains a missing role in plain words.

## 8 Security, config, ops
- Env: Railway variables per environment; `.env.example` committed; `lib/env.ts` Zod-validates at boot (fail fast).
- Tokens: AES-256-GCM, key `TOKEN_ENC_KEY` = `<keyId>:<base64 of 32 bytes>` (id `[a-z0-9]{1,16}`); retired keys stay in `TOKEN_ENC_KEYS_OLD` (comma list, decrypt only). A row stores `enc_value = v1.<iv>.<ciphertext>.<tag>` (base64url, random 12-byte IV) and the key id in `key_id`; the AAD is `integration_tokens:<projectId>:<integrationId>:<accountRef>`, so a ciphertext copied to another row does not open. One token row per `(integration, account_ref)` (WhatsApp: one per WABA). Rotation: generate `k2`, set `TOKEN_ENC_KEY=k2:…`, move the old value into `TOKEN_ENC_KEYS_OLD`; old rows still open and are re-sealed on reconnect. Decrypted only in adapters and senders. Required on staging and production, and whenever the Meta variables are set.
- Logging: JSON to stdout with request id, no PII. `error_log` table + alert email (rate-limited, one per fingerprint per hour) to the alert inbox.
- `/api/health`: 200/503 JSON `{db, queue, integrations{platform: state}, lastWebhookAt}`; no secrets or PII.
- `is_test` leads are excluded from reports, conversion and exports by default.
- Dependencies: lockfile committed; `pnpm audit --prod` in CI.

## 9 Key decisions
| Decision | Why |
|---|---|
| Two independent projects in one repo: `web/` (Next.js BFF) and `api/` (Fastify); no root package or workspace | Clean frontend/backend split; each deploys from its own folder with its own lockfile; backend reusable later |
| Contracts: source in `api`, generated copy in `web` | Railway builds each service from its own folder, so no cross-folder imports; a CI check keeps the copy in sync |
| BFF: Server Components/Actions in web call the api over private networking | Browser never sees the api; sessions stay server-side |
| Worker in `api`, separate Railway service | Same domain code; heavy jobs never slow API responses |
| Node native TypeScript for api/worker (no build step) | Fewer tools; requires explicit `.ts` imports and erasable syntax |
| Drizzle + transaction-local RLS settings | DB-level isolation (SOW) that is safe with pooling |
| pg-boss over BullMQ | Transactional enqueue (no lost conversion events); one less service |
| Polling over WebSocket | "Within seconds" met with no sticky infra |
| Hand-rolled auth + emailed-code 2FA | Fits RLS and audit; fewest dependencies; TOTP deferred |
| Contact 1—N lead | Profile holds every lead; duplicates merge into the open lead |
| Fixture-first adapters | Approvals are outside our control; code complete by D18, live when access lands |
| Europe West (Amsterdam) | Best latency for UAE + Morocco among Railway regions |
| Cache Components off | Tenant data must never be cached across users |
| Three roles: super admin, manager, client (no agent, no client sub-roles); roles do not nest | Simpler model; the client has its own permission set instead of a slice of staff rights |
| Client login replaces the secure client link | One auth path and one host; clients get analytics, chats, connectors and marking in one place; SOW change order pending (§10) |
| Statuses New/MQL/SQL/Not qualified | SOW; Won/Junk are Extras |
| Biome only | One tool, one config |

## 10 SOW deviations (written SHARKX approval requested; see `docs/CONTACT-SHARKX.md`)
| SOW §4–5 | Plan | Why |
|---|---|---|
| WebSocket live updates | Polling `/api/events` | Same behaviour, one less service |
| Redis + BullMQ | pg-boss on Postgres | One less service and bill; transactional enqueue |
| Cloudflare R2 | Not used at launch | CSV processed in memory; no files to store |
| Sentry + uptime alerts | `/api/health` + `error_log` + emailed alerts | Simpler, in-house; covers the alert inbox (Client Requirements #7) |
| Two-factor sign-in | Emailed 6-digit code | Simplest compliant 2FA; authenticator app is an Extra |
| DB "can move to a UAE region" | Launch in Amsterdam; Railway has no UAE region | Residency deferred; SHARKX informed |
| SOW §4 Client lead link; client logins out of scope | Client login dashboard (analytics, leads + marking, WhatsApp chats read-only, connectors); the link is removed | Simpler and more useful; adds scope the SOW excluded, so a written change order is needed |
