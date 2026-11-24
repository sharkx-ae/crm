# F4a · F2b · F10a · Technical plan (John, Release 1)

Owner: B (John) · Specs: [F4a](F4a-lead-engine.md), [F2b](F2b-clients-projects.md), [F10a](F10a-client-workspace.md) · Detailed design: [F2-web-technical-plan.md](F2-web-technical-plan.md) §3–§5 · Tracker: F4.1, F4.2, F4.3, F4.7, F15.5, F2.3, F2.4, F2.5, F10.1, F10.2, F10.3
Written 2026-11-24 (end of Day 5) against `master` at `ca52af5` (F2a pushed). Mockup: `docs/inputs/sharkx-crm-mockup.html` (git-ignored, local reference).

The three specs are built as **three phases, in this order**, because each feeds the next:

| Phase | Spec | What it gives the next phase | Planned | Realistic |
|---|---|---|---|---|
| 1 | **F4a** Lead engine + seed | `ingestLead`, round-robin, the seed (5 clients, ~64 leads) that every screen and number test needs | Days 5–6 | Days 6–7 |
| 2 | **F2b** Workspace | clients home, create client, team, settings layout and hours | Day 7 | Day 8 |
| 3 | **F10a** Client dashboard + client users | client users screen, the full guard matrix, client-safe projections | Day 8 | Day 9 |

This is the one-day slip already forecast in the F2 plan §6. The Day 10 demo script (create client → invite → accept → sign in → client dashboard → manager invited → reset → audit) needs only these three phases, so it still fits.

## 0 · Starting point (what already exists)

| Piece | State | Used by |
|---|---|---|
| Contracts `leads.ts`, `contacts.ts`, `reports.ts`, `projects.ts`, `functions.ts` (`ingestLeadInput/Result`, `notifyInput`), `clientChangeKinds`, `agency.read`, audit actions `project.*`, `lead.*`, `form.mapping_saved` | done (commit `e261e83`) | all phases |
| Tables `contacts` (unique `project_id, phone_e164`), `leads` (unique `project_id, source, external_id`), `lead_events`, `lead_forms.mapping`, `notifications`, `pipeline_stages`, `tasks`, `wa_*`, `integrations` | done (F1b) | F4a, F2b |
| RLS `client_access` for every tenant table | done (F1b) | F10a S3 |
| Alex's `inviteUserTx`, `inviteUser`, `listUsers`, `setUserStatus` (api) and `inviteUser`, `setUserStatus`, `getUsers` (web) | done (F1c) | F2b S2–S3, F10a S2 |
| Projects module: `GET /projects/options`, `GET /projects/:id` (+ `toDailyHours`, `colorFor`) | done in F2a T6b | F2b |
| Shell, `guardRoute`, nav config (`ready` flags), `/clients` and overview placeholders, client nav, in-shell not-found | done in F2a T6a | F2b, F10a |
| Playwright `stubbed` project and fake api | done in F2a T8 | F10a e2e |
| `libphonenumber-js` | not installed (approved, D1) | F4a S1 |
| Migration `0003` | not written | F4a S3, F2b S4 |
| `db:seed` | not written (only `auth:seed-admin`) | F4a S5 |

## 1 · Decisions (settled by the owner on 2026-11-24)

| # | Decision | Outcome | Blocks |
|---|---|---|---|
| D1 | New dependency `libphonenumber-js` (api only) for E.164 phone normalisation (UAE and Morocco). | **Approved.** | F4a S1 |
| D2 | Two audit rows in one route: `POST /projects` writes `project.created` and `user.invited`, but `defineRoute` only knows `audit: 'one' \| 'none'`. | **Approved:** add an additive `audit: { count: n }` option to `lib/http/route.ts` (Alex's file: own commit, tell him). | F2b S2 |
| D3 | First user's name in "Add a client" (the invite needs a name). | **Keep the mockup's 4 fields** (Client name, City, Industry, Email); the email field is labelled **"Email"**. No name field: the service derives the invite name from the email's local part (`lina.haddad@x.ae` → "Lina Haddad"). Contract change: `createProjectRequest.firstUser.name` becomes optional (own `contracts:` commit, tell Alex). | F2b S2 |
| D4 | Migration `0003`: `projects.assign_cursor uuid null` and the new `business_hours` default (seven per-day entries). | **Approved.** Tell Alex; run `db:generate` after `git pull --rebase`; push the same day. | F4a S3, F2b S4 |
| D5 | Seed password for seeded staff and client users. | **Approved:** `SEED_PASSWORD` in `api/.env.local` only (validated in `lib/env.ts`, never committed); the seed refuses outside `APP_ENV=local\|staging`. | F4a S5 |

Spec conflict, already settled in the F2 plan §0: F2b says a client opening `/clients` is "redirected"; F10a says not-found. **Not-found wins** (already how F2a's guard works).

---

## 2 · Phase 1 · F4a Lead engine and seed

**Goal:** one `ingestLead()` turns any source's payload into a deduplicated, mapped, assigned lead, and the demo data exists for every screen. No screens, apart from one reusable component (`MappingStep`).

### 2.1 Sub-features
| # | Sub-feature | Tracker |
|---|---|---|
| S1 | `ingestLead`: normalise, dedupe, merge, idempotency | F4.1 |
| S2 | Per-form field mapping: `saveFormMapping`, `MappingStep` component | F4.2 |
| S3 | Round-robin among active managers | F4.3 |
| S4 | Test leads (`is_test`) | F4.7 |
| S5 | Seed from the mockup | F15.5 |
| S6 | `notify()` (CONTRACTS §4; the F14b bell and F8b tasks need it) | (no separate ID) |

### 2.2 Files
```
api/src/modules/leads/
  phone.ts          normalisePhone(raw, city) → { valid: true, e164, display } | { valid: false, raw } | null   (libphonenumber-js, D1)
  mapping.ts        applyMapping(answers, mapping) → { name?, phone?, email?, custom, notes }
  assign.ts         nextManager(tx, projectId) → userId | null   (cursor on projects.assign_cursor)
  ingest.ts         ingestLead(input) (CONTRACTS §4); ingestLeadTx(tx, input) → result + afterCommit() for callers already in withSystem
  forms.ts          saveFormMapping(session, formId, input)
  routes.ts         PUT /lead-forms/:id/mapping
  index.ts          export { ingestLead, ingestLeadTx, leadRoutes, saveFormMapping, applyMapping, normalisePhone }
  phone.test.ts, ingest.test.ts (includes round-robin), forms.test.ts
api/src/modules/contacts/service.ts   findOrCreateContact(tx, projectId, { e164?, email?, name? })
api/src/modules/notifications/{service,index}.ts   notify(input) (CONTRACTS §4 notifyInput)
api/src/modules/projects/schema.ts    assignCursor column; BusinessHours = BusinessHoursDay[]
api/src/db/migrations/0003_*.sql      generated (D4)
api/src/db/migrations/0004_*.sql      partial index lead_events_merged_external_idx (merged-replay check)
api/src/db/seed.ts + seed/{data,build}.ts   pnpm db:seed (D5); build.ts = pure buildSeed(now) + summarise()
api/tests/fixtures/seed/expected.json hand-checked numbers for the frozen `now`
api/package.json                      "db:seed" script; libphonenumber-js (D1)
api/src/app.ts                        register leadRoutes
web/src/components/mapping/mapping-step.tsx (+ test)
web/src/lib/actions/leads.ts          saveFormMapping (defineAction)
web/messages/en/leads.json            leads.mapping.* (register module in request.ts)
```

### 2.3 Design
- **`ingestLead(input)`**, in one `withSystem(projectId)` transaction:
  1. Validate with `ingestLeadInput` (unknown project → `NOT_FOUND`, schema error → `VALIDATION`).
  2. **Idempotency:** if `externalId` is set and `(projectId, source, externalId)` exists, return that lead with `{ created: false, merged: false }`.
  3. **Mapping:** `formId` is the platform's **external** form id: it is matched against `lead_forms.external_form_id` and stored as text in `leads.form_id` (not `lead_forms.id`; F4b must not join them on id). If that form has a mapping, apply it to `answers` (name / phone / email / custom → kept in `answers` / notes → a `notes` row / ignore → dropped). Explicit `name`, `phone`, `email` fields win over mapped ones.
  4. **Phone:** `normalisePhone(raw, project.city)` with default region Dubai/Abu Dhabi → `AE`, Morocco → `MA`. Invalid → no `phone_e164`; the raw value is kept in the creation `lead_events.data` as `{ phoneInvalid: true, phoneRaw }` (spec edge case).
  5. **Contact:** match on `phone_e164`, else email (lower-cased). No phone and no email → new contact, no match attempted. Insert relies on the unique constraint; on conflict, re-select (two submissions at the same moment → one contact).
  0. Blank or whitespace-only `externalId`, `formId`, `campaign`, `name`, `phone`, `email` count as not sent.
  6. **Open lead:** the contact's latest lead with `status <> 'not_qualified'` and the same `isTest` (test and real leads never merge into each other). If one exists → append a `lead_events` row (`kind: 'merged'`, source, campaign, answers), audit `lead.merged`, return `{ created: false, merged: true }`. Otherwise → new lead on the same contact.
  7. **New lead:** insert with `isTest`, `stageId` = the project's first stage, `ownerId` = `nextManager()` (skipped for test leads), `lead_events` `created`, audit `lead.created` (actor system).
  8. `emitChange('lead')` in the same transaction. After commit, for a new, non-test lead: `new_lead` notifications to every active manager, the super admin and the client's active users (PRD F14: client users also get new leads in the bell). A failed notify is reported with `reportError` and never undoes the lead. `ingestLeadTx` callers must call `afterCommit()` themselves after their transaction commits.
- **Round-robin (`assign.ts`):** `select … for update` on the project row; active managers ordered by `created_at, id`; take the first after `assign_cursor` (wrap around); update the cursor. No active manager → `null` (unassigned). Client users and disabled managers are never picked.
- **`saveFormMapping`:** `PUT /lead-forms/:id/mapping`, body `saveFormMappingRequest` (has `projectId`), action `integration.manage` with that project (clients may save their own wizard step; RLS `lead_forms: 'write'`), `audit: 'one'` (`form.mapping_saved`). The form must belong to the project, otherwise `NOT_FOUND`.
- **`MappingStep`** (client component): one row per form question with the sample answer and a native `Select` (Name, Phone, Email, Custom field, Notes, Ignore). Props are in the F2 plan §4.1; it's reused by Alex's F14b wizard.
- **`notify()`:** inserts one `notifications` row per target user (explicit `userIds`, or a role: `manager` = all active managers, `super_admin` = the super admin, `client` = the project's active client users), then `emitChange('notification')`.
- **Seed (`pnpm db:seed`):** refuses unless `APP_ENV` is `local` or `staging`; aborts if clients exist unless `--reset`; deterministic, with a `now` parameter. It inserts **directly**, not through `ingestLead`, so the numbers stay fixed and timestamps can be in the past; one test does run `ingestLead` on top of the seed. Content follows F2 plan §5.2 with these differences: 4 managers (Aisha Rahman, Rami Haddad, Sana Idrissi active; Yara Nassar invited, no password), every email on a `.test` domain, about 58 % of real leads with `first_reply_at`. 5 clients (Lumière, Pearl, Nova Casablanca, Falcon, Oasis) with colours, cities, zones, the default 6 stages, qualification settings, an integrations mix (some `needs_attention`/`broken`), WhatsApp numbers, 64 leads over 30 days (source and status mix, 2 test leads), conversations ending inbound, a few overdue tasks, and one active client user per client. It uses the existing super admin and never creates a second one. `--reset` deletes every client and the seed's own users (`.test` emails); real staff and the super admin stay. Seeded users that already exist are updated in place, so a re-run after a half-finished run or hand-deleted clients works. `expected.json` holds, per client: leads, test leads, count by status, leads with a chat, unreplied, overdue tasks. The other numbers in F2 plan §5.2 (new today, leads in 30 days, MQL/SQL rates, median reply) get added when F2b S1 and F13a need them.

### 2.4 Tests (checkpoints)
- `phone.test.ts`: UAE local/international/with spaces (`050 412 7781`, `+971 50 412 7781`, `00971…`), Morocco (`06…`, `+212…`), garbage → invalid.
- `ingest.test.ts`, the **dedupe matrix**: phone / email / neither × open lead / closed (not qualified) / none × same / different source; idempotent `externalId`; **concurrent** same phone (two parallel calls) → one contact; mapping applied; invalid phone kept raw; test lead not assigned and not notified; audit, `lead_events` and `change_feed` rows written.
- Round-robin (in `ingest.test.ts`, no separate `assign.test.ts`): 2n leads over all n active managers (two each, same order both rounds), a disabled manager skipped, never a client user. "No managers → unassigned" runs inside a rolled-back transaction, so other files keep their managers.
- `forms.test.ts`: route guard (client of A → 404 on B's form, also when the body names client A), form not in the named client → 404 even for staff, unknown target → 422, audit row.
- `seed.test.ts`: `buildSeed` is deterministic and matches `expected.json`; with `--reset` the database counts equal `expected.json`; seeded users sign in with `SEED_PASSWORD`, no super admin created; a second run aborts without `--reset`; refuses when `APP_ENV=production`; `ingestLead` merges into a seeded open lead. It runs `--reset` on the shared test database, so later test files must not count all projects or users.
- `mapping-step.test.tsx` (jsdom): rows, change callback, disabled state, labels.

### 2.5 Tasks and commits
| Task | What | h | Commit |
|---|---|---|---|
| P1.1 | D1 dependency; `phone.ts` + tests | 1 | `F4a: phone normalisation (libphonenumber-js)` |
| P1.2 | Migration `0003` (`assign_cursor`, hours default), schema type, `toDailyHours` kept for old rows | 0.5 | `F4a: project assign cursor and per-day business hours` |
| P1.3 | `contacts/service.ts`, `mapping.ts`, `ingest.ts` + dedupe matrix | 4 | `F4a: ingestLead` |
| P1.4 | `assign.ts`, test flag, `notify()` | 2.5 | `F4a: round-robin, test leads and notify` |
| P1.5 | `saveFormMapping` route/action, `MappingStep`, `leads.json` | 2.5 | `F4a: form field mapping` |
| P1.6 | Seed, `expected.json`, `db:seed` script | 3.5 | `F4a: seed from the mockup` |
| | **Total** | **14 h** | |

**Status 2026-11-25: P1.1–P1.6 built and tested, not committed** (api 774 tests, web 586; review fixes applied: blank inputs, test/real merge, seed reset scope and re-run, index 0004). Notes from the build: the seed inserts with `.test` email domains so a dev code never reaches a real inbox; about 58 % of seeded real leads have a first reply (the plan said ~70 %; the numbers are frozen in `expected.json`, so this stays unless the owner wants it tuned).

**Done when:** all six acceptance criteria in the F4a spec are ticked; `node scripts/verify.mjs --all` passes; `pnpm db:seed` on the local DB gives 5 clients and ~64 leads. **Tell Alex:** `ingestLead` is real (his WhatsApp/Meta/Google adapters call it), and `0003` is pushed. **Tracker:** F4.1, F4.2, F4.3, F4.7, F15.5 → done.

---

## 3 · Phase 2 · F2b Workspace

**Goal:** staff open the product on a real Clients home; the super admin creates clients and manages managers; each client has a time zone and business hours.

### 3.1 Sub-features
| # | Sub-feature | Tracker |
|---|---|---|
| S1 | Clients home | F2.3 |
| S2 | Create client | F2.4 |
| S3 | Team (managers) | F2.5 |
| S4 | Client settings: time zone and business hours | F2.5 |

### 3.2 Files
```
api/src/modules/projects/
  home.ts           projectsHome(session, q) → projectsHomeResponse   (one aggregate query)
  create.ts         createProject(session, input)                      (transaction + inviteUserTx)
  settings.ts       updateProjectSettings(session, id, input)
  routes.ts         + GET /projects, POST /projects, PATCH /projects/:id/settings
  *.test.ts
web/src/lib/data/projects.ts            + getProjectsHome(q)
web/src/lib/actions/projects.ts         createProject, updateProjectSettings (defineAction)
web/src/app/[locale]/(app)/clients/page.tsx          real page (replaces the placeholder)
web/src/app/[locale]/(app)/team/page.tsx
web/src/app/[locale]/(app)/p/[projectId]/settings/{layout,page}.tsx, hours/page.tsx
web/src/components/clients/{clients-table,add-client-modal}.tsx
web/src/components/users/{users-table,invite-modal}.tsx   (shared by Team and F10a client users)
web/src/components/settings/{settings-tabs,hours-form}.tsx
web/src/lib/nav/config.ts               READY += team, settings
web/messages/en/{projects,team}.json    (register in request.ts; CLIENT_MODULES where used client-side)
```

### 3.3 Design
- **S1 `GET /projects?q=`** (`agency.read`, staff only) → `projectsHomeResponse` (`totals` + `rows`; `totals` ignore the search so the KPI strip stays put). One SQL aggregate, time-zone aware:
  - `newToday` = non-test leads created since local midnight in the project's zone.
  - `unreplied` = conversations whose last message is inbound (and whose contact has a non-test lead).
  - `overdue` = tasks with `done_at is null and due_at < now()` on non-test leads.
  - `integrations` in a fixed order (whatsapp, meta, google, tiktok, linkedin, snapchat, website); "to fix" = `needs_attention` or `broken`.
  - Zero, never an error, for a client without data. Sorted by `newToday`, then `unreplied`. Search on name, city, industry.
- **S1 page:** KPI strip (4 tiles, red when > 0), one flush card with the search and the table (initials square + name + "city, industry"; New today; Unreplied; Overdue; connection dots + "N to fix" chip). Row → `/p/<id>/overview`. "Add client" primary button (super admin only). Empty and no-match copy from the F2 plan §4.2.
- **S2 `POST /projects`** (`project.create`, super admin): `createProjectRequest` = name, city, industry, `firstUser.email` (D3: the modal shows Client name, City, Industry, **Email**, as in the mockup; the invite name is derived from the email). The service pre-generates the id and, in one `withSystem(id)` transaction, inserts the project (zone from the city: Dubai/Abu Dhabi → `Asia/Dubai`, Morocco → `Africa/Casablanca`; default hours Mon–Fri 09:00–18:00; a token colour), the 6 default stages, then `inviteUserTx(tx, session, { kind: 'client', projectId, … })`. After commit: `deliver()` sends the invite. Any failure leaves nothing. Errors: name taken (case-insensitive index) or email in use → `CONFLICT`; manager → `FORBIDDEN`. Audit: `project.created` + `user.invited` (D2). The web then redirects to `/p/<id>/overview`.
- **S3 `/team`** (`guardRoute('team')`, super admin): card "Managers" with the shared `UsersTable` (name + avatar, email, status Active/Invited/Disabled, Disable/Enable) and an "Invite manager" modal (name, email). Uses Alex's actions; nothing new in the api. A disabled manager drops out of round-robin (P1.4 filters `status = 'active'`) and is signed out (Alex's `setUserStatus`).
- **S4 `/p/<id>/settings/hours`** (`guardRoute('settings')`, staff): settings link-tabs (`settings/layout.tsx`; `/settings` redirects to the first ready tab: Client users from Phase 3, Business hours now). Zone `Select` (Asia/Dubai, Africa/Casablanca), seven rows (day, `Switch`, from/to time inputs disabled when closed), Save. `PATCH /projects/:id/settings` (`project.update`, body has `projectId`) → `projectDetail`; `to > from` per open day; audit `project.updated`; applies to future timers only.

### 3.4 Tests (checkpoints)
- `home.test.ts`: totals and rows equal the hand-checked seed numbers in `expected.json`; a client with no data → zeros; search; test leads excluded; Dubai vs Casablanca midnight; client role → 403 (the page shows not-found first).
- `create.test.ts`: success creates the project, 6 stages, the invited user and two audit rows; the invite mail is captured; **rollback**: a duplicate email leaves no project and no stages; duplicate name → 409; manager → 403.
- `settings.test.ts`: validation (closed days, `to <= from`, bad zone), persistence, permission, audit.
- Web: `structure.test.ts` covers the new pages automatically (each must call `guardRoute` with its key); component tests for `AddClientModal`, `UsersTable`, `HoursForm`.
- Playwright `stubbed`: super admin creates a client → lands on its overview; a manager doesn't see "Add client".

### 3.5 Tasks and commits
| Task | What | h | Commit |
|---|---|---|---|
| P2.1 | `home.ts`, `GET /projects` + tests against the seed | 2.5 | `F2b: clients home aggregates` |
| P2.2 | Clients home page, table, KPI strip | 2 | `F2b: clients home` |
| P2.3 | `create.ts`, `POST /projects`, add-client modal and action (D2, D3) | 2.5 | `F2b: create client` |
| P2.4 | `UsersTable`, invite modal, `/team`, `team.json` | 1.5 | `F2b: team` |
| P2.5 | Settings layout and tabs, hours form, `PATCH /projects/:id/settings` | 2 | `F2b: settings tabs and business hours` |
| | **Total** | **10.5 h** | |

**Done when:** the F2b "Done when" lines hold (numbers match the seed, a client with no data shows zeros, create is atomic, a manager can't see or call create, invite/disable audited, hours persist); verify passes; screenshots of Clients home, Add client, Team and Hours at 1440/360 EN/AR. **Tracker:** F2.3, F2.4, F2.5 → done.

---

## 4 · Phase 3 · F10a Client dashboard foundation and client users

**Goal:** a client user signs in and sees only their own client; staff manage that client's users; every client response carries only client-safe fields.

### 4.1 Sub-features
| # | Sub-feature | Tracker | State before Phase 3 |
|---|---|---|---|
| S1 | Landing, route guards, client sidebar | F10.2 | **mostly done in F2a** (landing rule, client nav, `guardRoute`, in-shell not-found, stubbed e2e). Left: the full matrix including `settings` and `team`, and a real-api e2e |
| S2 | Client users (invite, list, disable) | F10.1 | not started |
| S3 | Client-safe projections | F10.3 | contracts exist (`clientLeadRow` strict, `clientLeadKeys`, `view` unions); code not started |

### 4.2 Files
```
web/src/app/[locale]/(app)/p/[projectId]/settings/client-users/page.tsx
web/src/components/users/*               reused from Phase 2 (UsersTable, InviteModal)
web/messages/en/team.json                + clientUsers.*
api/src/modules/leads/projection.ts      toStaffLead(row), toClientLead(row), clientLeadKeys
api/src/modules/reports/projection.ts    toClientOverview(…) (the shape F13a fills)
api/src/modules/leads/projection.test.ts, api/tests/http/client-isolation.test.ts
web/tests/e2e/client.spec.ts             real-api path on the seed (chromium project)
```

### 4.3 Design
- **S1:** extend `routes.test.ts` (web) to the complete matrix in the F2 plan §7 (3 roles × every route key, own vs foreign project, pending session). Add a real-api Playwright test on the seeded DB: client user of Lumière signs in → `/en/p/<lumiere>/overview`; `/en/clients`, `/en/team`, `/en/p/<lumiere>/settings/hours` and `/en/p/<pearl>/overview` all show not-found; a staff user is unaffected. The seed's known password (D5) makes this possible.
- **S2 `/p/<id>/settings/client-users`** (`guardRoute('settings')`, staff): card "Client users" with the helper line, `UsersTable` (from Phase 2), "Invite client user" (`clientuser.manage`), modal name + email. Uses Alex's `getUsers({ kind: 'client', projectId })`, `inviteUser`, `setUserStatus`. Errors: `CONFLICT` (email used), cross-client → not-found. Empty: "No client users yet. Invite the first one." This becomes the first settings tab.
- **S3 projections:** one module per entity exporting `toStaffX` / `toClientX`. The **service** picks the projection from `session.role`; routes never choose. Responses are the `view` discriminated unions already in the contracts, and the client shape is `.strict()`, so an extra field fails parsing. The client lead allowlist is `clientLeadKeys` (no `ownerId`, `ownerName`, `stageId`, `stage`, `notes`, `events`, `tasks`, `isTest`); test leads are hidden from the client role. Reports for the client carry no per-manager data. F4b and F13a are the first callers; this phase ships the functions, the allowlist tests and the isolation tests.

### 4.4 Tests (checkpoints)
- `projection.test.ts`: `toClientLead` output keys ⊂ `clientLeadKeys`; serialised JSON contains none of the forbidden names; adding a field to the staff row doesn't leak it (the strict schema fails).
- `client-isolation.test.ts` (api, Postgres): client of A → `GET /projects/<B>` 404, `GET /projects` 403, `PATCH /projects/<A>/settings` 403, `GET /users?kind=client&projectId=<B>` 404; `withTenant` as client of A reading B's `leads`, `contacts`, `qualification_settings` → zero rows.
- Client users: invite → accept → sign in → disable (session revoked) → enable, against the real F1c routes; audit rows `user.invited`, `user.status_changed`.
- Design check: a client screenshot contains no staff-only label (Pipeline, Tasks, Contacts, Owner, Stage, Notes, Team, Audit).

### 4.5 Tasks and commits
| Task | What | h | Commit |
|---|---|---|---|
| P3.1 | Full guard matrix (web) and real-api client e2e on the seed | 1.5 | `F10a: client landing and route guards` |
| P3.2 | Client users page and tab | 2 | `F10a: client users` |
| P3.3 | Projections, allowlists, isolation tests | 3 | `F10a: client-safe projections` |
| | **Total** | **6.5 h** | |

**Done when:** a client user of A opening B's URL, or any staff-only URL of A, sees not-found (proven on the real api); invite, accept, disable and re-enable work end to end and are audited; the allowlist test fails if a client response gains a field. **Tracker:** F10.1, F10.2, F10.3 → done.

---

## 5 · Across the phases

### 5.1 Contract and shared-file changes (tell Alex before pushing)
| Change | Phase | Kind |
|---|---|---|
| `createProjectRequest.firstUser.name` → optional (D3) | 2 | `contracts:` commit + `sync-contracts`, tell Alex |
| `lib/http/route.ts`: `audit: { count: n }` option (D2, approved) | 2 | Alex's file: own commit, tell him |
| `lib/env.ts`: `SEED_PASSWORD` (optional, local/staging) | 1 | Alex's file: tell him |
| Migration `0003` | 1 | single migration lane (pull, generate, push the same day) |
| `api/src/db/schema/index.ts` barrel | none expected (tables exist) | append-only |

### 5.2 Verification for every task
`node scripts/verify.mjs --all` (api tests need the local Postgres; this machine uses native PostgreSQL on :5432, and api suites must not run in parallel), `pnpm build` in `web`, `pnpm exec playwright test` for UI tasks. Every mutation: `can()` + audit. Strings in `messages/en/*`. RTL checked on screenshots. No push without the owner's approval (target `master`).

### 5.3 Risks
| Risk | Mitigation |
|---|---|
| Seed numbers and aggregates disagree (time zones, test leads) | `expected.json` is hand-checked once against a frozen `now`; P2.1 tests compare against it, not against the query itself |
| `ingestLead` races (same phone at once) | unique constraint + re-select, proven by a parallel test |
| Alex objects to the D2 change | fall back to `audit: 'none'` + an explicit two-row test |
| Phase 1 overruns (14 h is the biggest block) | P1.5 (`MappingStep`) can move after Phase 3; F14b (Alex, Day 14) is its first user |

### 5.4 Order of work, end to end
P1.1 → P1.2 → P1.3 → P1.4 → P1.6 → P1.5 · P2.1 → P2.2 → P2.3 → P2.4 → P2.5 · P3.1 → P3.2 → P3.3. **About 31 h in total.**
