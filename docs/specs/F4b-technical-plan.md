# F4b · Technical plan (John, Release 1)

Owner: B (John) · Spec: [F4b](F4b-leads-ui.md) · Earlier sketch: [F2-web-technical-plan.md](F2-web-technical-plan.md) §3.3, §3.4, §4.4 · Tracker: F4.4, F4.5, F4.6
Written 2026-11-25 (Day 6) against `master` at `ae86569` (F4a and F2b pushed). Mockup: `docs/inputs/sharkx-crm-mockup.html` (`viewLeads`, `openLead`, `viewContacts`, `openContact`; git-ignored, local reference).

**Goal:** the team finds, filters, assigns and exports leads, opens a lead to see its full history, and browses contacts. Client users get a reduced version of the same Leads screen.

F4b is built as **two phases**, because the client view and the export both depend on the staff list and its query:

| Phase | What | Gives the next phase | Planned | Realistic |
|---|---|---|---|---|
| 1 | api: list query, detail, `changeStatus`, assign, export, contacts | every shape the screens read, proven on the seed | Day 9 | Days 8–9 |
| 2 | web: Leads screen, drawer, client view, export route, Contacts, e2e | the screens | Day 10 | Days 9–10 |

F10a S3 (client-safe projections) comes first. It isn't built yet, and F4b is its first caller (D7).

## 0 · Starting point (what already exists on `ae86569`)

| Piece | State | Used by |
|---|---|---|
| Contracts `leads.ts`: `leadTab`, `leadsQuery` (`limit` 1–200, default 20), `clientLeadRow` (strict) + `clientLeadKeys`, `staffLeadRow` (+ `ownerId`, `ownerName`), `leadsPage` (`view`, `counts`, `total`, `sources`, `rows`), `leadDetail` (staff: `qualification`, `whatsappState`, `owners`, `timeline`; client: `qualification` only), `markLeadRequest/Response` (`outboxQueued`), `assignLeadRequest/Response`, `leadExportRequest`, `leadExportRows` (client rows strict, max 10 000) | done (`e261e83`) | S1–S7 |
| Contracts `contacts.ts`: `contactRow`, `contactsPage`, `contactProfile` (leads, chats, notes, statusChanges) | done | S8, S9 |
| **Missing contracts:** `contactsQuery` (projectId, q, limit), a `projectScope` query (`{ projectId }`) for `GET /leads/:id` and `GET /contacts/:id`, the owner choices for the owner filter on `leadsPage` | not written | D8 |
| `statusChanged` in `functions.ts`; actions `lead.read`, `lead.mark`, `lead.export` (all roles), `lead.update`, `lead.assign`, `contact.read` (staff) in `session.ts` | done | S3, S6 |
| Audit actions `lead.status_changed`, `lead.assigned`, `lead.exported` in `knownAuditActions` | done | S3, S4, S6 |
| Tables `leads` (`status_seq`, `reason`, `owner_id`, `is_test`), `lead_events`, `notes`, `qualification_settings` (default 5 reasons), `conversion_mappings`, `conversion_events` (unique `lead_id, status_seq, platform`), `change_feed` | done (F1b) | S1–S9 |
| RLS: `leads` `write`, `contacts` / `qualification_settings` / `wa_*` `read`, `lead_events` / `notes` / `conversion_*` `none` | done (F1b) | S6, S7 |
| leads module: `ingestLead`, `saveFormMapping`, one route `PUT /lead-forms/:id/mapping`; event kinds written: `created`, `merged`, `assigned` (system) | done (F4a) | S5 |
| contacts module: `findOrCreateContact`, `normaliseEmail` only; no routes | done (F4a) | S8 |
| Seed: 5 clients, 64 leads (2 test), `created` / `assigned` / `status_changed` events, `qualification_settings` per client, WhatsApp conversations and messages, tasks. **No `conversion_mappings`, no `notes`** | done (F4a) | all tests |
| `createProject` inserts a `qualification_settings` row | done (F2b) | S6 reasons |
| `api/src/modules/leads/projection.ts` (`toStaffLead`, `toClientLead`) | **not built** (F10a S3) | S1, S5, S7 |
| `api/src/routes`: `health.ts` only. Export route shell (`/api/export/[kind]`) | **missing** (neither app) | S4 (D1) |
| web: `p/[projectId]/` has `layout.tsx`, `overview`, `settings` only; no `leads`, `contacts` | not built | S1–S9 |
| web `lib/actions/leads.ts`: `saveFormMapping` only; no `lib/data/leads.ts` | partial | S1–S6 |
| web UI kit: `Table`/`Th`/`Td`/`FRESH_ROW`, `Tabs variant="ribbon"` with `TabKeyTone`, `Select`, `Chip` (new/mql/sql/nq), `Drawer`, `Modal`, `EmptyState`, `Skeleton`, `ClickRow`, `Toast` | done (F2a) | S1–S9 |
| `guardRoute`, `ROUTES.leads` (all roles, `lead.read`) and `ROUTES.contacts` (staff, `contact.read`) | done (F2a) | S1, S8 |
| Nav `READY` = clients, team, overview, settings (leads and contacts hidden) | flip in F4b | S1, S8 |
| `messages/en/leads.json`: `mapping.*` only; registered in `request.ts` | partial | all web |
| SWR | **not installed**; no `useAutoRefresh` hook yet | D2 |
| Playwright `stubbed` project + `tests/e2e/support/fake-api.ts` | done (F2a) | e2e |

## 1 · Decisions (settled by the owner on 2026-11-25)

John approved every recommendation: the whole spec is in scope, pagination is **server-side**, and **the mockup is the UI/UX truth** for Leads, the lead drawer and Contacts (`viewLeads`, `openLead`, `viewContacts`, `openContact`), within the PRD's "UI deltas vs mockup" hide list.

| # | Decision | Outcome | Blocks |
|---|---|---|---|
| D1 | Export route shell is missing in both apps (spec names Alex; CONTRACTS §6 lists it as a web BFF route, owner B). | **Approved:** John writes `web/src/app/api/export/[kind]/route.ts` (same-origin check, session cookie, calls api `POST /leads/export`, builds the CSV) in its own commit and tells Alex first. | S4, T10 |
| D2 | "SWR refresh every 5 s" would be a new dependency. | **Approved: no SWR.** `useAutoRefresh` (`router.refresh()` every 5 s, paused while hidden, while an action is pending or while the reason modal is open; once on focus). Filters live in the URL. Switches to `/api/events` when F14a lands. | S1, T7 |
| D3 | Pagination. | **Approved replacement, 2026-11-26: server-side pages with a footer, not "Show 20 more".** Original D3 (approved earlier): the api applies `limit` (step 20, cap 200), a "Show 20 more" button below the card, and a "Showing the newest 200" line at the cap. **Replaced by** `page` (1-based, default 1) and `limit` = the page size, one of 10, 20, 50, 100 (default 20; anything else is 422 `VALIDATION`), on `leadsQuery` and `contactsQuery` (`contracts:` commit; `total` stays on both pages; the export is still the whole filtered set). The api returns `limit` rows from `(page - 1) * limit` on the stable `created_at desc, id desc` order; a page past the end is empty with the true `total`. The address carries `?page&size` (defaults left out; `size` is sent as `limit`; an old `?limit=` link is ignored); a change of tab, search, filter or size goes back to page 1; a page past the end is rendered as the last page and the address is corrected. The footer (`ui/pagination.tsx`) sits inside the card: rows per page, "1–20 of 64", previous/next and compact page numbers, as real links. The 200-row cap and its line are gone. **Known trade-off:** offset paging plus the 5 s auto-refresh means a lead that arrives (or leaves the tab) while someone reads page 2 shifts the rows by one at the next refresh; accepted, a keyset cursor is the fix if it ever matters. | S2, T2 |
| D4 | Contact profile: page or drawer? | **Approved: drawer** on `/p/<id>/contacts?contact=<id>` (mockup `openContact`); each lead in it opens `/p/<id>/leads?lead=<leadId>`. | S9, T12 |
| D5 | "Not qualified" reasons before F10b. | **Approved:** `qualification_settings.reasons` (seeded, inserted by `createProject`, column default of 5); missing row → column default list; a reason not in the list → 422. | S6, T4 |
| D6 | Minimum timeline event kinds. | **Approved:** `created`, `merged`, `assigned`, `status_changed` (ICU `leads.timeline.<kind>`) + generic "Updated" for unknown kinds. Newest first; ties by `id`. | S5, T3 |
| D7 | F10a S3 projections aren't built. | **Approved:** build F10a P3.3 (`projection.ts`, allowlist and isolation tests) first as T0, then F4b. | S1, S5, S7 |
| D8 | Contract additions: `contactsQuery`, `projectScope`, staff `leadsPage.owners`. | **Approved:** one `contracts:` commit, `node scripts/sync-contracts.mjs`, tell Alex. | T1 |
| D9 | Conversion outbox: write only, or enqueue? | **Approved: write `pending` rows only; enqueue nothing** (F11a adds the sender). Tests insert their own mappings. Seed mappings only if Alex agrees (ask him; not a blocker). | T4 |
| D10 | Client tabs: spec vs mockup. | **Approved: follow the mockup:** client tabs "Waiting for review" (= Unreviewed filter), All, MQL, SQL, Not qualified, plus the inline "Mark as" column; the sub-line "{n} of {total} leads waiting for your review". | S7, T9 |

Not decisions, but noted: test leads are **hidden from every F4b list, count, export and profile, for staff too** (`staffLeadRow` has no `isTest`, and PRD hides "Send test lead"). If staff need to see them later, that's an Extra.

---

## 2 · Sub-features

| # | Sub-feature | Tracker |
|---|---|---|
| S1 | Leads list and tab counts (state bar, ribbon tabs, table, red edge on unreviewed rows) | F4.4 |
| S2 | Filters and search (source, owner with "Unassigned", search on name / phone / campaign), growing limit | F4.4 |
| S3 | Single assign (owner select in the drawer) | F4.4 |
| S4 | CSV export of the current filter, scoped by role | F4.4 |
| S5 | Lead drawer: qualification, details, answers, timeline | F4.5 |
| S6 | `changeStatus()` with outbox rows, audit, reason | F4.5 |
| S7 | Client view of the Leads screen and drawer | F4.4, F4.5 |
| S8 | Contacts list | F4.6 |
| S9 | Contact profile (drawer: details, leads, chats, notes, status changes) | F4.6 |

## 3 · Files

Owner key: **J** = John's, **A** = Alex's (tell him before the commit), **S** = shared (contracts: own `contracts:` commit + sync + tell Alex).

### 3.1 api
```
api/src/contracts/leads.ts             S   + projectScope; staff leadsPage + owners (D8)
api/src/contracts/contacts.ts          S   + contactsQuery (D8)
api/src/modules/leads/
  projection.ts        J   toStaffLead, toClientLead (F10a P3.3, D7)
  filters.ts           J   leadFilterSql(session, f) → SQL: shared by list, counts and export (one filter, three uses)
  list.ts              J   listLeads(session, q) → leadsPage
  detail.ts            J   getLead(session, id, projectId) → leadDetail (timeline, whatsappState, owners)
  status.ts            J   changeStatus(tx, leadId, to, reason, by) → statusChanged (CONTRACTS §4); markLead(session, id, body)
  assign.ts            J   + assignLead(session, id, body)   (file exists: nextManager)
  export.ts            J   exportLeads(session, body) → leadExportRows
  routes.ts            J   + GET /leads, GET /leads/:id, POST /leads/:id/status, POST /leads/:id/assign, POST /leads/export
  index.ts             J   + changeStatus (F10b/F12 call it), listLeads
  list.test.ts, detail.test.ts, status.test.ts, assign.test.ts, export.test.ts, projection.test.ts
api/src/modules/contacts/
  list.ts, profile.ts  J   listContacts, getContactProfile
  routes.ts            J   GET /contacts, GET /contacts/:id
  index.ts             J   + contactRoutes
  contacts.test.ts     J
api/src/app.ts         J   register contactRoutes
api/tests/http/client-isolation.test.ts   J   (F10a P3.3) + the F4b routes
api/src/db/seed.ts     J   only if D9 says "seed default mappings" (rows in Alex's table)
```
Read only (no edits): `conversion/schema.ts`, `whatsapp/schema.ts` (A), `lib/tenant` (`withTenant`, `withSystem`, `emitChange`), `modules/audit` (`audit`). **No migration expected**: the existing indexes (`leads_project_created_idx`, `leads_project_status_idx`, `leads_contact_idx`, `lead_events_lead_idx`) cover the queries at this volume. The schema barrel is unchanged.

### 3.2 web
```
web/src/contracts/*                                 generated: node scripts/sync-contracts.mjs (never edited)
web/src/app/[locale]/(app)/p/[projectId]/leads/page.tsx       J   guardRoute('leads'); reads searchParams; getLeads + getLead in parallel
web/src/app/[locale]/(app)/p/[projectId]/leads/loading.tsx    J   table skeleton
web/src/app/[locale]/(app)/p/[projectId]/contacts/page.tsx    J   guardRoute('contacts')
web/src/app/[locale]/(app)/p/[projectId]/contacts/loading.tsx J
web/src/app/api/export/[kind]/route.ts              J*  D1: the shell CONTRACTS lists; tell Alex (spec named him)
web/src/lib/csv.ts (+ csv.test.ts)                  J   RFC 4180 + spreadsheet-injection guard
web/src/lib/use-auto-refresh.ts (+ test)            J   D2
web/src/lib/data/leads.ts, data/contacts.ts         J   getLeads, getLead, getContacts, getContact (server-only)
web/src/lib/actions/leads.ts                        J   + markLead, assignLead (defineAction)
web/src/lib/nav/config.ts                           J   READY += leads, contacts
web/src/lib/i18n/request.ts                         J   + contacts module; leads/contacts in CLIENT_MODULES where used client-side
web/src/components/leads/
  leads-screen.tsx       state bar + ribbon tabs + toolbar + table + paging footer (one flush card)
  leads-toolbar.tsx      search (debounced, URL), source Select, owner Select (staff)
  leads-table.tsx        rows; client variant adds the inline mark column (D10)
  status-bar.tsx         segments from counts (token colours)
  source-badge.tsx       platform mark + label (SVG)
  lead-drawer.tsx        Drawer host on ?lead=; sections by view
  mark-control.tsx       segmented New (disabled) · MQL · SQL · Not qualified; reused by F13a client overview
  reason-modal.tsx       Select from the client's reasons
  owner-select.tsx       active managers + Unassigned
  timeline.tsx           ICU per kind (D6)
  export-button.tsx      secondary button → /api/export/leads?<current filter>
web/src/components/contacts/{contacts-table,contact-drawer}.tsx   J
web/messages/en/leads.json          J   + tabs, toolbar, columns, empty, drawer, mark, reason, timeline, export, toasts
web/messages/en/contacts.json       J   new (list, drawer sections, empty)
web/messages/en/shell.json          J   only if nav.leads / nav.contacts labels are missing
web/tests/e2e/support/fake-api.ts, fixtures.ts      J   + the F4b routes
web/tests/e2e/stubbed/leads.spec.ts                 J   staff and client
```

## 4 · Design

### 4.1 api routes
Every route has `projectId` in the query or body (tenant rule: `can()` runs before any read; the service also checks the row's project; a foreign client gets 404).

| Route | Request | Response | can() | Audit |
|---|---|---|---|---|
| `GET /leads` | query `leadsQuery` (`projectId, tab, q?, source?, owner?, page, limit`) | `leadsPage` | `lead.read` | none |
| `GET /leads/:id` | query `projectScope` | `leadDetail` | `lead.read` | none |
| `POST /leads/:id/status` | `markLeadRequest` (`projectId, to: mql\|sql\|not_qualified, reason?`) | `markLeadResponse` (`lead`, `outboxQueued`) | `lead.mark` | `'one'`: `lead.status_changed`; a same-status no-op writes none, so the route is `audit: 'one'` and the no-op answers 200 with **no** change (see 4.3) |
| `POST /leads/:id/assign` | `assignLeadRequest` (`projectId, ownerId: uuid \| null`) | `assignLeadResponse` | `lead.assign` | `'one'`: `lead.assigned` |
| `POST /leads/export` | `leadExportRequest` | `leadExportRows` | `lead.export` | `'one'`: `lead.exported` (meta: filter, row count; never row data) |
| `GET /contacts` | query `contactsQuery` | `contactsPage` | `contact.read` | none |
| `GET /contacts/:id` | query `projectScope` | `contactProfile` | `contact.read` | none |

The service picks the projection from `session.role`; routes never choose. A client sending `owner` → 422 (the web never sends it).

**The no-op case and `audit: 'one'`:** marking a lead with its current status (and the same reason) changes nothing. The test-mode audit assertion expects exactly one row. Answer: the service still writes **one** `lead.status_changed` audit row with `meta.noop = true` and nothing else (no event, no outbox, no seq bump). This keeps the route declaration honest without a new `audit` mode in Alex's `route.ts`.

### 4.2 List query (`filters.ts`, `list.ts`)
- Base: `leads l join contacts c on c.id = l.contact_id`, `l.project_id = $projectId`, **`l.is_test = false` always**, inside `withTenant(session)` (RLS is the wall; the explicit project filter is the scope).
- Filters (shared by list, counts and export through `leadFilterSql`):
  - `source = $source`
  - `owner`: uuid → `l.owner_id = $owner`; `'unassigned'` → `l.owner_id is null` (staff only)
  - `q` (trimmed, `%` and `_` escaped): `c.name ilike %q%` or `l.campaign ilike %q%` or, when `q` has ≥ 3 digits, `c.phone_e164 like %digits%` (digits only, leading `0` / `00` dropped, so `050 412` and `+97150412` both match).
- Tab: `all` none; `unreviewed` → `status = 'new'`; `mql` / `sql` / `not_qualified` → that status.
- **Counts:** one query, `count(*) filter (where status = …)` per tab, with the filters applied **and the tab not applied**. The tabs always add up (`all = unreviewed + mql + sql + not_qualified`) and stay right under any filter.
- `total` = count for the current tab (equals that tab's count); rows: `order by l.created_at desc, l.id desc limit $limit`.
- `sources` = distinct sources of this client's non-test leads, ignoring filters (so the select doesn't shrink as you filter). Staff `owners` (D8): every manager who owns a lead here, plus active managers, with `active`.
- Three statements, one `withTenant` transaction: counts, rows, sources (+ owners). No caching.

### 4.3 `changeStatus` (`status.ts`)
`changeStatus(tx, leadId, to, reason, by) → statusChanged`, CONTRACTS §4. `markLead(session, id, body)` is the route entry:
1. `withTenant(session)`: read the lead with `id = $id and project_id = $projectId and is_test = false` (a client's RLS limits it to its own client). Not found → 404.
2. Validate: `to = not_qualified` requires `reason`, and `reason` must be in that client's `qualification_settings.reasons` (D5) → otherwise 422 `VALIDATION`. A reason on MQL/SQL is dropped.
3. Same status (and same reason) → no-op (4.1): one audit row with `meta.noop`, return the lead, `outboxQueued: 0`.
4. Otherwise, **in one `withSystem(projectId)` transaction** (a client's tenant role can't insert `lead_events` or read `conversion_mappings`; ARCHITECTURE §4: "only the marking service updates `leads.status`… for clients"):
   - `select … for update` the lead; `status_seq = status_seq + 1`, `status = to`, `reason = to = not_qualified ? reason : null`.
   - `lead_events` `{ kind: 'status_changed', data: { from, to, reason? }, actor_kind, actor_id }`.
   - `audit_log` `lead.status_changed`, actor `{ kind: by.kind, id }`, meta `{ from, to, statusSeq }` (the reason text only, never lead PII).
   - For each `conversion_mappings` row with `status = to and enabled`: one `conversion_events` row per platform whose event is set (`meta_event` → `meta`, `google_event` → `google`), `state: 'pending'`, `status_seq` = the new seq. The unique `(lead_id, status_seq, platform)` makes a retry safe. `outboxQueued` = rows inserted.
   - `emitChange(tx, 'lead', projectId, leadId)`.
5. `by.kind` = `client` when `session.role = 'client'`, else `user`; `by.id = session.userId`. Nothing is enqueued (D9).
6. Return the lead through the projection for the caller's role.

Marking back to MQL from Not qualified etc. is allowed (a mark can change). `to: 'new'` isn't accepted (contract enum).

### 4.4 Permissions
| Edit | Action | Roles |
|---|---|---|
| Status MQL / SQL / Not qualified (+ reason) | `lead.mark` | super admin, manager, client (own client) |
| Owner (assign / unassign) | `lead.assign` | staff |
| Any other lead edit (stage F8a, details) | `lead.update` | staff (none in F4b) |
| Read list / drawer | `lead.read` | all |
| Export | `lead.export` | all |
| Contacts | `contact.read` | staff; a client gets 403 from the api, and the page 404s first |

Assign: the owner must be an **active manager** (a client user, a disabled manager or a super admin → 422; `null` unassigns). It writes `owner_id`, a `lead_events` `assigned` row (actor `user`, data `{ from, to }`), audit `lead.assigned`, `emitChange`. Same owner → no-op with one `meta.noop` audit row (same rule as 4.1).

### 4.5 Client-safe projection
- `toClientLead(row)` returns exactly `clientLeadKeys` (`id, name, phone, phoneDisplay, email, source, campaign, status, reason, createdAt, answers`). No `ownerId`, `ownerName`, `stageId`, notes, events, tasks or `isTest`. The response parses with the strict `clientLeadRow`, so an extra key fails in tests and in web.
- Client `leadDetail` = `{ view: 'client', lead, qualification }`: no `owners`, `timeline`, `whatsappState`. The client drawer shows qualification, details (phone, email, source, **campaign**), answers.
- The client's `leadsPage` has no `owners`, and its rows have no owner column.

### 4.6 Export
- api `exportLeads`: same `leadFilterSql` as the list, the tab applied, no limit, `is_test = false`, newest first. More than 10 000 rows → 422 `VALIDATION` with `details.reason = 'too_many'` (the web shows "Narrow the filter to export"). Client role: its own client only (`can()` + RLS) and the strict client row (no `ownerName`). Notes are never exported for anyone.
- web `GET /api/export/leads?projectId&tab&q&source&owner` (D1): `assertSameOrigin`, session from the cookie, `kind` must be `leads` (else 404), calls api `POST /leads/export`, writes CSV: header `Name, Phone, Email, Source, Campaign, Status, Reason, [Owner,] Received`; `Received` is ISO UTC; header labels from `leads.export.*` in the user's locale; cells starting with `= + - @` or a tab get a leading `'`; `Content-Disposition: attachment; filename="SharkX-Leads-<client-slug>-<YYYY-MM-DD>.csv"`; `Cache-Control: no-store`. An api error → the matching status with a short translated message (the button shows a toast).

### 4.7 Drawer data and timeline
- Lead drawer state is the URL: `?lead=<id>`. `leads/page.tsx` runs `getLeads(filters)` and, when `lead` is set, `getLead(id)` with `Promise.all`; the drawer is a client component that receives the detail as props and closes with `router.replace` (the param removed, filters kept). A lead not found → the drawer doesn't open, and a toast says it's no longer available.
- Staff detail (one `withTenant` transaction): lead + contact, `qualification_settings` (definitions + reasons), `owners` (active managers), `whatsappState` from the contact's latest `wa_conversations` / `wa_messages` (`none` if no chat; `unreplied` if the last message is inbound; else `replied`), timeline = `lead_events` for this lead joined to `users` for `actorName`, **`order by at desc, id desc`**, capped at 100.
- Sections, staff: Qualification (`MarkControl`, reason line, MQL/SQL definitions in a well) · Contact (phone, email, source, campaign, WhatsApp chip) · Form answers · Owner (`OwnerSelect`) · Timeline. Client: Qualification · Contact (without WhatsApp) · Form answers. Stage, notes, new task and open chat arrive with F8a, F3c, F8b (sections appended later; nothing placeholder now).

### 4.8 Web
- **Reads** are Server Components calling `lib/data/*` (`apiCall`, `no-store`). **Mutations** are Server Actions (`markLead`, `assignLead`) through `defineAction` (`can()` early for UX; the api re-checks and audits). **Only the export** is a BFF route handler, because it streams a file download.
- **URL state:** `?tab&q&source&owner&page&size&lead` (contacts: `?q&page&size&contact`). The search input debounces 300 ms and `router.replace`s. Changing a filter, the tab, the search or the size resets `page` to 1 (see D3, amended 2026-11-26). Bad values are dropped by parsing with the contract schema in `page.tsx`.
- **5 s refresh (D2):** `useAutoRefresh({ intervalMs: 5000 })` in `LeadsScreen` and `ContactsScreen` calls `router.refresh()` inside `startTransition`. It pauses while `document.hidden`, while an action is pending, and while the reason modal is open; it fires once on window focus. With ingest writing synchronously, a new lead shows within 5 s (≤ 10 s acceptance).
- **Toasts:** staff "Marked {name} as {status}", plus "Sent to the ad platform within 60 seconds." only when `outboxQueued > 0`; client "Marked {name} as {status}"; assign "Assigned to {name}" / "Unassigned".

### 4.9 States, RTL, i18n, brand
- **Empty:** client with no leads → "No leads yet. They appear here the moment a form is submitted or a chat starts."; filtered to nothing → "No leads match. Try another tab or clear the search." (with a Clear button). Contacts: "No contacts yet." / "No contacts match."
- **Loading:** `loading.tsx` with a table skeleton for the first load; refreshes keep the current rows (transition, no flash).
- **Error:** api errors go through the shell's `error.tsx` (page) or a toast (actions, export) with `errors.<code>`.
- **RTL:** logical classes only (`ms-`, `ps-`, `text-start`, `end-0` drawer). The state bar and ribbon follow the reading direction; phone numbers sit in `Bidi` (LTR inside RTL); the lint scripts enforce it.
- **i18n keys** (`leads.json`): `tabs.{all,unreviewed,waiting,mql,sql,not_qualified}`, `toolbar.{search,source,allSources,owner,allOwners,unassigned}`, `columns.*`, `empty.*`, `more`, `cap`, `drawer.{qualification,contact,answers,owner,timeline,mqlMeans,sqlMeans,reason,whatsapp.*}`, `mark.*`, `reason.{title,label,confirm}`, `timeline.{created,merged,assigned,status_changed,other}`, `export.{button,tooLarge,columns.*}`, `toast.*`. `contacts.json`: `search`, `columns.*`, `drawer.{details,leads,chats,notes,statusChanges,noChats,noNotes,noMarks}`, `empty.*`. English only now; AR/FR at the D18 freeze.
- **Brand:** one flush card per screen; red table header; unreviewed rows use `FRESH_ROW` (red edge); status chips and state-bar segments from tokens (no new colours); **no primary red button on the Leads page** (Export is the one secondary); the reason modal's Confirm is that view's single primary; SVG platform marks; 3 px red focus ring; table scrolls inside its card at 360 px; "SharkX" in body copy.

### 4.10 Mockup mapping (UI truth, D10)
Open `docs/inputs/sharkx-crm-mockup.html#role=manager&p=lum&v=leads` (staff), `#role=client&cp=lum&v=leads` (client), `#role=manager&p=lum&v=contacts`. Match these; apply the PRD "UI deltas" hide list (no page title, no "New today" tab, no WhatsApp column, no bulk bar or checkboxes, no Add lead, no Won/Junk, no starred).

| Mockup piece | Build |
|---|---|
| Action row: secondary "Export" with download icon (`can('lead.export')`) | `ExportButton` (no primary button on the page) |
| `card flush` → `sbar` (segments new/mql/sql/nq, only non-zero) → `ribbon` tabs (big count + key dot + label; the Unreviewed/Waiting tab gets `hot` when > 0) → `toolbar` (search "Search name, phone, campaign", "All sources" select of present sources, staff "All owners" select with "Unassigned") → table | `LeadsScreen` |
| Columns: Lead (bold name + phone, tabular), Source (platform mark + name), Campaign, Status chip, Owner (staff), Received (right-aligned "ago"); client adds "Mark as" | `LeadsTable`; unreviewed rows `fresh` (red edge); row click opens the drawer |
| Empty inside the card: "No leads match / Try another tab or clear the search." | `EmptyState` |
| "Show 20 more" secondary button centred **below** the card | replaced 2026-11-26 by the paging footer inside the card (D3) |
| Drawer title = lead name; subtitle = status chip + "{client} · received {ago}" | `LeadDrawer` header |
| Drawer sections: Qualification (mark buttons, "Reason: …" when Not qualified, well with "MQL means / SQL means"), Contact (Phone, Email, Source, Campaign, WhatsApp chip), Form answers (`kv` list), staff: Owner select ("Unassigned" + active managers), Timeline (newest first, bold text + "ago") | sections per view (4.7). Stage select, notes, Open chat and New task are not built (F8a, F3c, F8b) |
| Contacts: search "Search name, phone, email" above one `card flush` table: Contact (name + phone), Email, Leads (num), Latest status chip, Last activity (num) | `ContactsTable` |
| Contact drawer: title = name, subtitle "Contact profile"; sections Details (Phone, Email, Client), Leads ({n}: campaign, "source · ago", status chip; click opens the lead), Chats ("{n} messages on {number}" or "No chats yet."), Internal notes ("No notes."), Status changes ("No marks yet.") | `ContactDrawer` |

## 5 · Tests (checkpoints)
api (Vitest, Postgres, on the seed; files don't count across clients):
- `list.test.ts`: **tab counts on the seed** equal `expected.json` per client (counts by status minus test leads); `all = sum of the others`; counts unchanged by `tab`; each filter alone and combined (source, owner, `unassigned`, `q` on name / campaign / phone with spaces and with `+971`); `%` in `q` is literal; paging (page 1 and 2 meet at the boundary, the last partial page, a page past the end is empty with the true total, a filter with a page, sizes 10/20/50/100, anything else 422); order newest first; **test leads never appear**; staff rows have `ownerName`, client rows parse with strict `clientLeadRow`; client sending `owner` → 422.
- `export.test.ts`: **export rows = the filtered list's rows at limit 200 for the same filter, minus test leads** (same ids, same order) for 3 filter combos; client export has no `ownerName` key (strict parse) and only its client; > 10 000 → 422 (rolled-back insert of bulk rows); audit `lead.exported` with the row count and no PII.
- `detail.test.ts`: **timeline order** newest first with a tie on `at` broken by `id`; `actorName` resolved; `whatsappState` none / replied / unreplied on seeded chats; client detail has no `timeline`, `owners`, `whatsappState`.
- `status.test.ts`: **a status change creates one `conversion_events` row per enabled mapping and platform** (test inserts mappings: MQL meta + google enabled, SQL meta disabled), `status_seq` +1, `lead_events` row, **audit row with `actor_kind = client` for a client and `user` for staff**, `change_feed` row; no mapping → `outboxQueued: 0`; Not qualified without reason or with a reason not in the list → 422; same status → no event, no outbox, one `meta.noop` audit; re-mark → seq 2 and a new outbox row (unique constraint never hit); test lead → 404.
- `assign.test.ts`: active manager OK; client user / disabled manager / super admin → 422; `null` unassigns; event + audit; client role → 403.
- `projection.test.ts` (F10a P3.3): client output keys ⊂ `clientLeadKeys`; the serialised JSON of every client response (list, detail, mark, export) contains none of `ownerId, ownerName, stageId, stage, notes, events, timeline, tasks, isTest, owners, whatsappState`.
- `contacts.test.ts`: list counts and `latestStatus` on the seed; search on name / phone / email; a contact with only test leads hidden; profile leads newest first, chats per number, status changes from `lead_events`; client → 403 on both routes.
- `client-isolation.test.ts` (RLS / tenant): client of A → 404 on `GET /leads?projectId=B`, `GET /leads/<B lead>?projectId=A` (wrong project), `POST /leads/<B lead>/status`, `POST /leads/export` for B; `withTenant` as client of A reading B's `leads` → 0 rows; staff of any project OK.
- The existing `route-actions.test.ts` / `guard.test.ts` pick up the new routes (each declares an action and audit).

web (Vitest): `csv.test.ts` (quotes, commas, newlines, injection guard, client header without Owner); `use-auto-refresh.test.ts` (fires every 5 s, pauses when hidden or paused, fires on focus); `structure.test.ts` covers the new pages' `guardRoute` automatically.

Playwright `stubbed` (`leads.spec.ts`, fake api):
- Staff: tabs show counts; switching tab and source updates the URL and rows; "Unassigned"; search; the paging footer; open a row → drawer with timeline; mark Not qualified → reason modal → toast with "Sent to the ad platform…" (fixture `outboxQueued: 1`); assign; Export link has the current filter; Contacts list → contact drawer → a lead opens the lead drawer.
- Client: "Waiting for review" first (D10); no owner filter, no Owner column, no Contacts nav item; drawer has qualification, contact, answers, campaign only (no Owner, Timeline); inline mark works; `/p/<id>/contacts` → not-found.
- 360 px and AR screenshots of Leads, drawer, Contacts (no page scroll; drawer from the left in AR).

## 6 · Tasks and commits
Each task ends with `node scripts/verify.mjs` (`--all` when both apps change), `pnpm build` in `web` for UI tasks, and is pushed only after `git pull --rebase` and the owner's OK. **No task needs a migration** (if one turns out to be needed: `git pull --rebase` before `db:generate`, push the same day, tell Alex).

| Task | What | h | Commit |
|---|---|---|---|
| T0 | (F10a P3.3, D7) `projection.ts`, allowlist and isolation tests | 3 | `F10a: client-safe projections` |
| T1 | D8 contract additions → `node scripts/sync-contracts.mjs` → tell Alex | 0.5 | `contracts: F4b contacts query, project scope, owner choices` |
| T2 | `filters.ts`, `list.ts`, `GET /leads` + `list.test.ts` | 3 | `F4b: leads list, tab counts and filters` |
| T3 | `detail.ts`, `GET /leads/:id`, timeline + `detail.test.ts` | 1.5 | `F4b: lead detail and timeline` |
| T4 | `status.ts` (`changeStatus`, `markLead`), `POST /leads/:id/status` + `status.test.ts`; tell Alex (writes his `conversion_events`); seed mappings only if D9 says so | 2.5 | `F4b: changeStatus with conversion outbox rows` |
| T5 | `assignLead`, `POST /leads/:id/assign` + `assign.test.ts` | 1 | `F4b: assign a lead` |
| T6 | `export.ts`, `POST /leads/export` + `export.test.ts` | 1 | `F4b: leads export query` |
| T7 | `use-auto-refresh.ts` (D2), `lib/data/leads.ts`, leads page, screen, toolbar, table, state bar, source badge, `leads.json`, nav `READY += leads` | 3 | `F4b: leads screen` |
| T8 | Drawer, `MarkControl`, `ReasonModal`, `OwnerSelect`, timeline, `markLead` / `assignLead` actions | 3 | `F4b: lead drawer, marking and assign` |
| T9 | Client variant (D10): tabs, inline mark, reduced drawer | 1 | `F4b: client leads view` |
| T10 | `web/src/app/api/export/[kind]/route.ts` (D1, tell Alex), `csv.ts` + test, export button | 1.5 | `F4b: CSV export route` |
| T11 | Contacts `list.ts`, `profile.ts`, routes + `contacts.test.ts` | 2 | `F4b: contacts list and profile api` |
| T12 | Contacts page, table, contact drawer, `contacts.json`, nav `READY += contacts` | 2 | `F4b: contacts screen and profile` |
| T13 | Fake api routes, `stubbed/leads.spec.ts`, screenshots 1440/360 EN/AR | 1.5 | `F4b: e2e for staff and client leads` |
| | **Total (T1–T13)** | **23.5 h** (+3 h T0) | |

Order: T0 → T1 → T2 → T3 → T4 → T5 → T6 · T7 → T8 → T9 → T10 · T11 → T12 · T13.
**Tracker:** F4.4 `now` at T2; milestone notes after T6 (api done) and T10; F4.5 done after T8–T9; F4.6 done after T12; F4.4 done after T13.
**Done when:** the four F4b acceptance criteria are ticked; `node scripts/verify.mjs --all` passes; the test plan checkpoints above are green; screenshots of Leads (staff, client), drawer and Contacts at 1440/360 EN/AR show no physical-direction drift and no staff label in the client view. **Tell Alex:** `changeStatus` is real and writes `pending` outbox rows (F11a's input); the export route exists (D1).

## 7 · Risks and schedule

| Risk | Mitigation |
|---|---|
| 23.5 h (+3 h F10a P3.3) against 2 planned days (D9–D10) | F4a and F2b landed ahead (Day 6 instead of Days 6–8), so F10a can run Day 7 and F4b Days 8–10. Realistic finish: **end of Day 10**, in time for the Release 1 demo, with no slack |
| The client mark writes through `withSystem` (RLS blocks `lead_events` and the outbox for the client role) | The tenant read in step 1 is the gate; the isolation test proves a client can't mark another client's lead |
| Counts and export drift from the list | One `leadFilterSql` for all three, and the export test compares ids with the list |
| The 5 s RSC refresh is heavy with the drawer open | Paused while hidden or while the modal is open; detail capped at 100 events; revisit with F14a events |
| `ilike` search without a trigram index | Fine at this volume (tens to low thousands of leads per client); add an index later only if measured |
| Alex disagrees with D1 or D9 | D1: he writes the shell, and T10 shrinks to the CSV + button. D9: no seed mappings; the demo shows the mark without the "sent" line |

**Cut first if late** (the spec's own out-of-scope list is already excluded: bulk assign/status, manual Add lead, starred, Won/Junk):
1. D10 inline "Mark as" column in the client table (marking stays in the drawer): −1 h.
2. Contacts search (the mockup has it; the spec only says "list"): −0.5 h.
3. AR screenshots move to the F2c/D18 RTL pass (logical classes are still linted): −0.5 h.

**Extras noticed, not planned** (ask after F1–F15): staff view of test leads; an "All clients" leads list (the mockup's agency scope); sorting by column; keyset paging past 200; notes writing in the drawer (F3c owns it).
