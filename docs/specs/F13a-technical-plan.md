# F13a · Technical plan (John, Release 1)

Owner: B (John) · Spec: [F13a](F13a-overview-agency.md) · Earlier sketch: [F2-web-technical-plan.md](F2-web-technical-plan.md) §4.5 (S1, S2, design QA) and T30–T32 · Tracker: F13.1, F13.4
Written 2026-11-26 (Day 7) against `master` at `7ea5f82` (F4b pushed, including its e2e). Mockup: `docs/inputs/sharkx-crm-mockup.html` (`viewOverview` staff and client branches, `viewClients`, `stats`, `perDay`, `barChart`, `hbars`; git-ignored, local reference).

> **As built (2026-11-26):** the recommended answers to D1–D14 are what was built. Deviations from the text below:
> - The four SQL statements live in `modules/reports/overview.ts` (no separate `overview-sql.ts`). The median test cases are in `overview.test.ts`.
> - No `lib/format/metrics.ts`: the existing `lib/i18n/format.ts` already had `percent`, `duration` and `zoneLabel`. It gained `plainDay` only.
> - The app formats with en-GB, so the zone label reads "GST" for Dubai (not "GMT+4"). AR shows "غرينتش+4".
> - Ranked bars use grey (`#a49f9f`) after the red top row, as the mockup's `--mark` does (not black).
> - `LeadsTable` gained `showStatus` and `label` props, so the waiting card reuses it.
> - `expected.json` gained an `overview` block per client. The seed DB test ignores that block; `overview.test.ts` checks it against the database.

**Goal:** each client's health and the whole agency's workload are readable in seconds. Staff open a client and see its Overview (five KPIs, leads per day, leads by source). A client user lands on the same Overview for its own client, plus a "Waiting for review" tile and list. Staff also have the agency view: new leads, unreplied chats, overdue follow-ups and connection health across clients, with each client's time zone labelled.

**The key finding: F13a doesn't need F3b, except for live first-reply data.** Everything else reads tables that F4a, F4b and F2b already fill. Median first reply is computed from `wa_messages`, which the seed fills today and F3b fills live. The query is the same before and after F3b, so when F3b lands nothing in F13a is rebuilt; it only gets re-checked (§7). So F13a can ship in Release 1, ahead of its D11 slot, rather than waiting for R2 (ORDER risk note, R1/R2).

| Phase | What | Gives the next phase | Planned | Realistic |
|---|---|---|---|---|
| 1 | api: seed summary numbers, overview query (KPIs, per day, by source, median, waiting), route, tests | one `overviewResponse` per role, proven on the seed | Day 11 | Days 7–8 |
| 2 | web: overview page, KPI strip, SVG charts, client waiting card, agency zone label, e2e | the screens | Day 11 | Days 8–9 |

## 0 · Starting point (checked against the code on `7ea5f82`)

| Piece | State | Used by |
|---|---|---|
| Contract `reports.ts` `overviewResponse`: discriminated on `view`; `kpis { leads30, newToday, medianFirstReplyMin: number \| null, mqlRate: 0–1 \| null, sqlRate: 0–1 \| null }`, `perDay` (exactly 30 `{ date: YYYY-MM-DD, count }`), `bySource [{ source, count }]`; the client adds `kpis.waiting` and `waiting: clientLeadRow[]`; neither role has per-manager data | **done, no change needed** | S1–S3 |
| `modules/reports/projection.ts` `projectOverview(session, OverviewData)`: copies each field explicitly; staff and client shapes; filters `waiting` with `visibleTo('client')` and maps it with `toClientLead`. `index.ts` exports it | **done** (F10a S3). No query, service or route exists yet | S3 |
| `modules/projects/home.ts` `projectsHome(session, q, now)`: one `withTenant` query per client: `new_today` (in the client's zone), `unreplied` (conversations whose last message is inbound, real-lead contacts only), `overdue` (open tasks past due, test-lead tasks excluded), `integrations` → 7 connection dots in a fixed order; totals ignore the search; `GET /projects` (`agency.read`, staff) | **done** (F2b S1) | S4 |
| `workspace.test.ts`: the home rows equal `expected.json` (`newToday`, `unreplied`, `overdueTasks`) per client, totals = sums, a client gets **403** on `GET /projects` | **done** | S4 |
| web `components/clients/clients-home.tsx`: `KpiStrip` (New today, Unreplied chats, Overdue follow-ups, Connections to fix `hot`) + flush card (search, table, dots, "N to fix" chip, row → `/p/<id>/overview`); `guardRoute('clients')` (staff; a client gets the in-shell not-found) | **done**. **Missing:** the time-zone label (spec: "agency view labels zones") | S4 |
| F4b leads api: `filters.ts` / `list.ts` exclude `is_test` **for every role** with an explicit `eq(leads.isTest, false)`; tab counts; `leadRowColumns` + `leadContactJoin` (the `LeadRow` select); `toClientLead` | **done** | S3 (waiting list) |
| `hideTestLeads(view)` in `leads/projection.ts` filters **only for the client** (undefined for staff) | done, **don't use it here**: the overview excludes test leads for staff too (see D9) | n/a |
| Seed (`db/seed/build.ts`, deterministic, frozen `now` = `2026-11-25T10:00Z`): 64 leads (2 test), WhatsApp conversations and messages (`direction` in/out, `origin` customer/app), **`leads.first_reply_at` already set** = first outbound after the first inbound | **done** (F4a). Verified: `first_reply_at` equals the value computed from the messages for every seeded lead | S1, S2, tests |
| `api/tests/fixtures/seed/expected.json`: per client `leads`, `testLeads`, `newToday`, `byStatus`, `withChat`, `unreplied`, `overdueTasks` | done. **Missing:** `leads30`, `mqlRate`, `sqlRate`, `medianFirstReplyMin`, `waiting`, `bySource` | T1 |
| Schema: `leads.first_reply_at` column; indexes `leads_project_created_idx (project_id, created_at)`, `leads_project_status_idx`, `leads_contact_idx`, `wa_messages_conversation_ts_idx (conversation_id, ts)`, `wa_conversations_project_last_idx` | **done** (F1b). No migration needed (§4.2) | S1, S2 |
| `modules/whatsapp`: `schema.ts` only. No `recordMessage` yet, so nothing writes `first_reply_at` except the seed | F3b (Alex) | S2 live data only |
| Actions: `report.read` (all roles), `agency.read` (staff), `project.read` (all) in `session.ts` | done | S3, S4 |
| web: `overview/page.tsx` = `guardRoute('overview', projectId)` + `<Placeholder />`; `ROUTES.overview` (all roles, `project.read`); nav `READY` already has `overview` | page **to replace**; nav ready | S5 |
| web: `ProjectProvider` (from the `p/[projectId]` layout) gives `{ id, name, city, industry, color, timezone }` | done | S5 (zone, caption) |
| web UI kit: `Kpi` / `KpiStrip` (tuple type, max 6, first tile 34 px), `Card` (flush), `Table`/`Th`/`Td`/`FRESH_ROW`, `EmptyState`, `Skeleton`, `ClickRow`, `Bidi`/`UserText`, `Icon` | done | S5–S6 |
| web F4b pieces: `useAutoRefresh`, `RefreshPauseProvider` / `usePauseRefresh`, `ClientMarkCell` → `MarkControl inline` (calls `markLead`, then `router.refresh()`), `SourceBadge` / source labels | done | S6 |
| `messages/en/reports.json` | **missing**; `reports` not in `MESSAGE_MODULES` | S5 |
| Chart components | **none** (no chart library either, and none to be added) | S5 |
| Playwright `stubbed` project + `fake-api.ts` (has `GET /projects`, `GET /leads`; no `GET /reports/overview`) | partial | T9 |

**Result:** the agency view is already built (S4 needs only the zone label and tests). The overview query, route, page and charts are missing. The contract and the projection are ready. No contract change, no migration, nothing in Alex's modules.

## 1 · Decisions (recommended answers; John approves in one pass)

| # | Decision | Recommended | Blocks |
|---|---|---|---|
| D1 | Source of truth for **median first reply**. | **`wa_messages` is the source of truth**, computed when read. For each lead in the window: `first_in` = earliest inbound message (any origin) of the lead's contact in this project with `ts >= lead.created_at` and before the contact's next lead; `first_out` = earliest outbound message (any origin, so a reply sent from the phone counts) with `ts > first_in`. Reply time = `first_out − first_in`. `leads.first_reply_at` is a **denormalised copy that F3b keeps** (F12's no-reply timer and later screens read it). F13a doesn't read it, but a test asserts it equals the computed value on the seed (true today) and, after F3b, on the replayed fixtures. Why: the read query doesn't depend on the order history and echoes arrive in, so it is correct on the seed now and after F3b with no rework. | S2, T3 |
| D2 | Which leads count towards the median. | Leads in the 30-day window with a `first_in` **and** a `first_out`. Excluded: no chat (spec), inbound only (no reply yet; these show up as "Unreplied" in the agency view), outbound only (no customer message). None left → `null` → "—". | S2 |
| D3 | Median of an even count, rounding. | **True median:** `percentile_cont(0.5)` (the mean of the two middle values) over the reply time in seconds, then rounded to whole minutes in the service. 0 renders as "<1 min". The mockup takes the upper middle value (`rep[floor(n/2)]`). On the seed that gives 25 instead of 19 for Lumière, so the hand-computed numbers in §5 use the true median. | S2, T3 |
| D4 | What "Leads (30 d)" means. | **The last 30 calendar days in the client's time zone, today included** = exactly the 30 `perDay` buckets, so the tile always equals the sum of the bars. The mockup uses a rolling 30 × 24 h window. On the seed both give the same counts (the oldest seeded lead is 29.1 days old), so the window edge is covered by its own test. MQL/SQL rates and the median use the **same** set of leads. | S1 |
| D5 | Rate denominators and empty cases. | `mqlRate = (mql + sql) / leads30`, `sqlRate = sql / leads30`, over every non-test lead in the window (unreviewed `new` leads count in the denominator, as the PRD says). `leads30 = 0` → both `null` → "—". Shown as a percentage with one decimal (brand rule), e.g. "66.7%". | S1 |
| D6 | Agency view: move the aggregate into `modules/reports/agency.ts` (F2 plan §4.5 S2)? | **No: keep `projectsHome` in `modules/projects`.** It already gives all four agency numbers, matches `expected.json`, is staff-only, and is John's. Moving it would mean a refactor and a second route for the same data. F13a adds only the zone label (D7) and the extra permission and definition tests. | S4 |
| D7 | Zone label on the agency view (spec says so; the mockup has none). | **Approve the F2-plan proposal:** add the zone to each client's sub-line: "Dubai, Aesthetic clinic · GMT+4", from `Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })`. The row already has `timezone`, so no contract change. The Overview chart caption shows the zone too (D11). | S4, T7 |
| D8 | Chart rendering. | **Hand-rolled, no library.** `BarChart` (leads per day) is an inline **SVG**, `viewBox` scaled to its container, with a fixed LTR time axis. `RankedBars` (by source) is **HTML/CSS** bars with logical `inline-size`, so they mirror in RTL and long translated labels wrap. Both are Server Components (no JS shipped). | S5, T5 |
| D9 | Test leads. | Excluded from **every** number for **every** role, with an explicit `not l.is_test` in each statement, the same as F4b's `filters.ts`. Not via `hideTestLeads`, which only filters for clients. | S1–S3 |
| D10 | More than 5 sources in "Leads by source" (Lumière and Novara have 6 on the seed). | The api returns **all** sources, sorted by count descending, then by source name. The web shows the top 4 plus **"Other ({n} sources)"** as the 5th row when there are more than 5, so the rows still add up to Leads (30 d) and the chart stays at ≤ 5 bars. The mockup just cuts at 5 (`slice(0, 5)`). | S5 |
| D11 | Chart caption and "trust" line. | The PRD hides the "last 30 days · time zone · source" meta line, so it isn't built. The chart header keeps the mockup's small caption: "Peak {n} on {date}" (the **earliest** peak day, as the mockup's `findIndex` does), or "Last 30 days" when every day is 0. A tooltip and screen-reader text say "Days in {zone}". | S5 |
| D12 | Refresh behaviour. | `useAutoRefresh({ intervalMs: 30_000 })`: the PRD allows up to 30 s outside the inbox and leads, and the overview has no filters, so the URL carries no state. A small client wrapper `OverviewRefresh` holds the hook. The client waiting card sits in a `RefreshPauseProvider`, so a mark in progress pauses it. `MarkControl` already calls `router.refresh()` after a mark, so the marked lead leaves the list at once. F14a's `/api/events` replaces the timer later. | S5, S6 |
| D13 | Waiting list: rows and click target. | The 5 newest non-test `new` leads (`created_at desc, id desc`), all `FRESH_ROW` (red edge), with `ClientMarkCell` inline. Clicking a row opens `/p/<id>/leads?tab=unreviewed&lead=<leadId>` (the F4b drawer, not a second drawer). "Review leads" is a secondary button to `/p/<id>/leads?tab=unreviewed`. Empty → "All caught up / Nothing is waiting." | S6 |
| D14 | A client opening the agency view. | As already built and agreed (F2 plan conflict (b)): the web shows the **in-shell not-found** (`guardRoute('clients')`), and the api answers **403** on `GET /projects` (`agency.read`). The spec's "forbidden" is met by the api; the page doesn't reveal that the route exists. | S4 |

**Extras (out of scope; ask only after F1–F15):** cost per SQL, a Won KPI and spend (the spec's out-of-scope list and PRD "UI deltas"); period-over-period deltas; the 14-day sparkline on Clients home; the first-reply-by-manager chart; the funnel; report export; a 7/90-day toggle on the Overview (F13b owns periods); an "all clients" overview for staff.

---

## 2 · Sub-features

| # | Sub-feature | Tracker |
|---|---|---|
| S1 | Overview counts: Leads (30 d), New today, MQL rate, SQL rate, leads per day (client's zone), leads by source | F13.1 |
| S2 | Median first reply from `wa_messages` (D1–D3) | F13.1 |
| S3 | `GET /reports/overview` + role shapes through `projectOverview` (staff; client + waiting tile and list) | F13.1 |
| S4 | Agency view: the existing Clients home + zone labels + permission and definition tests | F13.4 |
| S5 | Overview page: KPI strip, `BarChart`, `RankedBars`, loading/error, 30 s refresh | F13.1 |
| S6 | Client waiting-for-review card with the inline mark | F13.1 |

## 3 · Files

Owner key: **J** = John's, **A** = Alex's (tell him before the commit), **S** = shared.

### 3.1 api
```
api/src/modules/reports/
  overview.ts           J   getOverview(session, projectId, now = new Date()) → OverviewResponse (one withTenant tx)
  overview-sql.ts       J   the four statements (window/perDay, bySource, median, waiting): raw sql`` with bounds as params
  routes.ts             J   GET /reports/overview (report.read, query projectScope, response overviewResponse, no audit)
  index.ts              J   + getOverview, reportRoutes (projectOverview already exported)
  overview.test.ts      J   seed numbers, zone boundary, DST, test leads, window edge
  median.test.ts        J   D1–D3 edge cases on small hand-built fixtures
api/src/app.ts          J   register reportRoutes
api/src/db/seed/build.ts  J   summarise() + leads30, mqlRate, sqlRate, medianFirstReplyMin, waiting, bySource (F4a file)
api/tests/fixtures/seed/expected.json   J   regenerate with the new fields, then hand-check against §5's table
api/tests/http/client-isolation.test.ts J   + GET /reports/overview (client of A asking for B → 404)
api/src/modules/projects/workspace.test.ts  J   + manager allowed on GET /projects (super admin and client already covered)
```
Read only (no edits): `modules/whatsapp/schema.ts` (A), `modules/leads/projection.ts` (`leadRowColumns`, `leadContactJoin`, `toClientLead`), `lib/tenant` (`withTenant`). `projectScope` comes from `contracts/leads.ts` (exists). **No contract change. No migration** (§4.2). The schema barrel is unchanged.

### 3.2 web
```
web/src/app/[locale]/(app)/p/[projectId]/overview/page.tsx     J   guardRoute('overview'); getOverview; staff or client layout
web/src/app/[locale]/(app)/p/[projectId]/overview/loading.tsx  J   KPI strip + chart skeleton
web/src/lib/data/reports.ts                                    J   getOverview(projectId) (server-only, apiCall, no-store)
web/src/lib/format/metrics.ts (+ metrics.test.ts)              J   formatRate, formatMinutes, formatDay(date, locale), zoneLabel(tz, locale)
web/src/components/reports/
  overview-screen.tsx    Server Component: KpiStrip + layout per view
  overview-kpis.tsx      the 5 or 6 tiles (written out as a tuple, KpiTiles type)
  bar-chart.tsx          SVG, 30 bars, peak in red, 3 axis labels, sr-only data table
  ranked-bars.tsx        HTML bars, top 4 + Other (D10), direct value labels
  waiting-card.tsx       client only: flush card, table of 5, ClientMarkCell, "Review leads"
  overview-refresh.tsx   'use client': useAutoRefresh 30 s (D12)
  charts.test.tsx        bars/heights/peak/labels, Other folding, RTL attributes, ≤ 5 rows
web/src/components/clients/clients-home.tsx    J   + zone label in the sub-line (D7)
web/messages/en/reports.json                   J   new (kpi.*, chart.*, waiting.*, empty.*, other, zone)
web/messages/en/projects.json                  J   home.place gains {zone}
web/src/lib/i18n/request.ts                    J   MESSAGE_MODULES += 'reports' (server only; not in CLIENT_MODULES unless a client component needs it)
web/tests/e2e/support/fake-api.ts, fixtures.ts J   + GET /reports/overview (staff and client fixtures, one with nulls)
web/tests/e2e/stubbed/overview.spec.ts         J   staff, client, agency zone label, screenshots
```
Nav needs no change (`overview` is already in `READY`; `reports` stays hidden until F13b).

## 4 · Design

### 4.1 api route
| Route | Request | Response | can() | Audit |
|---|---|---|---|---|
| `GET /reports/overview` | query `projectScope` (`{ projectId }`) | `overviewResponse` | `report.read` (`projectId`) | none (read) |
| `GET /projects` (exists) | query `{ q? }` | `projectsHomeResponse` | `agency.read` (staff) | none |

`can()` runs before any read; a client asking about another client's project gets 404 (CONTRACTS §1). The service chooses the shape from `session.role` through `projectOverview`; the route never chooses.

### 4.2 Aggregate query (`overview.ts`, `overview-sql.ts`)
All statements run **in one `withTenant(session)` transaction** (RLS is the wall; the explicit `project_id = $projectId` is the scope). They are read-only, nothing is cached (no `use cache`, no memoising), and `now` is a parameter so tests can freeze it.

**Bounds (once, in SQL):** from `projects` for `$projectId`: `tz = p.timezone`, `today = ($now at time zone tz)::date`, `from_day = today - 29`, `win_start = from_day::timestamp at time zone tz`, `win_end = (today + 1)::timestamp at time zone tz`. The leads filter is `l.created_at >= win_start and l.created_at < win_end`. It **compares the column with bounds**, so `leads_project_created_idx` serves it (`home.ts` converts the column instead, which is fine for its one-day count). Converting with `at time zone` per day handles DST (Casablanca's Ramadan shift, any IANA zone a client sets).

1. **Window + per day + KPIs:** `generate_series(from_day, today, '1 day')` left-joined to the window's non-test leads grouped by `(l.created_at at time zone tz)::date` → 30 rows, zero-filled. In the same statement: `leads30 = sum`, `newToday = count where day = today`, `mql = count(status in ('mql','sql'))`, `sql = count(status = 'sql')`. Rates are computed in TS (D5).
2. **By source:** `select source, count(*) … group by source order by count desc, source asc` over the same window. All rows are returned (D10).
3. **Median (D1–D3):**
   ```
   with w as (select l.id, l.contact_id, l.created_at,
                     lead(l.created_at) over (partition by l.contact_id order by l.created_at, l.id) as next_at
              from leads l where l.project_id = $p and not l.is_test)          -- all of the contact's leads, for next_at
   , win as (select * from w where created_at >= win_start and created_at < win_end)
   , fi as (select win.id, win.contact_id, (select min(m.ts) from wa_messages m join wa_conversations c on c.id = m.conversation_id
                            where c.project_id = $p and c.contact_id = win.contact_id and m.direction = 'in'
                              and m.ts >= win.created_at and (win.next_at is null or m.ts < win.next_at)) as first_in from win)
   , fo as (select fi.id, fi.first_in, (select min(m.ts) from wa_messages m join wa_conversations c on c.id = m.conversation_id
                            where c.project_id = $p and c.contact_id = fi.contact_id
                              and m.direction = 'out' and m.ts > fi.first_in) as first_out from fi where fi.first_in is not null)
   select percentile_cont(0.5) within group (order by extract(epoch from first_out - first_in)) as median_s,
          count(*) as replied
   from fo where first_out is not null
   ```
   (The final SQL may use `lateral` joins; the rule above is what the tests pin.) `median_s` null → `medianFirstReplyMin: null`; otherwise `Math.round(median_s / 60)`. The `next_at` window is computed over **all** of the contact's leads, so a lead's messages stop where the contact's next lead starts, even when that next lead falls outside the window.
4. **Waiting (client only):** `count(*)` of `status = 'new' and not is_test` (all time, as on the Leads tab) and the 5 newest rows with `leadRowColumns` + `leadContactJoin` (owner join left out; `toClientLead` doesn't read it). Not run for staff: the staff shape has neither field.

**Indexes:** (1) and (2) use `leads_project_created_idx`; (4) uses `leads_project_status_idx`; (3) uses `wa_messages_conversation_ts_idx` for each min. `wa_conversations` has no `contact_id` index, so the join filters a client's conversations through the project. At this volume (hundreds of conversations per client) that's fine. **No migration.** If measured slow later, an index `(project_id, contact_id)` on Alex's `wa_conversations` would be the fix (Tell Alex list, not now).

**RLS check:** the client role reads `leads`, `contacts`, `wa_conversations`, `wa_messages` (`client_access` `write`/`read`, F1b), so the client query runs under `withTenant` with no `withSystem`. `tasks` and `integrations` aren't read by the overview.

### 4.3 Response shapes (`projectOverview`, unchanged)
- **Staff:** `{ view: 'staff', kpis: { leads30, newToday, medianFirstReplyMin, mqlRate, sqlRate }, perDay[30], bySource[] }`.
- **Client:** the same + `kpis.waiting` + `waiting: clientLeadRow[]` (strict allowlist: no owner, stage, notes, events, tasks, `isTest`).
- **Neither role** gets per-manager data (no owner names, no reply time by manager; PRD hides that chart). `projectOverview` copies field by field, so anything extra the query selects never reaches a response. A test serialises the client response and checks that none of `ownerId, ownerName, stageId, isTest, owners, timeline, notes, tasks, manager` appears.

### 4.4 Agency view (S4)
The Clients home **is** the agency view (D6). What it already covers: new leads (New today, in each client's zone), unreplied chats (last message inbound, real-lead contacts), overdue follow-ups (open tasks past due), connection health (7 dots + "N to fix" chip + "Connections to fix" tile). F13a adds:
- **Zone label (D7):** `t('home.place', { city, industry, zone })` → "Dubai, Aesthetic clinic · GMT+4" / "Morocco, Real estate · GMT+0" (AR "غرينتش+4", FR "UTC+4", from `Intl`). The zone sits in `Bidi` so it stays LTR in AR.
- **Tests:** manager → 200 (super admin and client are covered); `unreplied`, `newToday`, `overdue` stay pinned to `expected.json`; a test lead's conversation and task never count (already in the query; add a test that inserts one).
- **No new panel.** The mockup's `viewClients` has none either.

### 4.5 Charts (brand: `SKILL.md` golden rules + `chart-theme.json`)
**`BarChart` (leads per day):**
- SVG `viewBox="0 0 300 H"` with `preserveAspectRatio="none"` for the plot only (H = 264 staff, 200 client, as in the mockup) and `style="direction:ltr"`: time always runs oldest → newest left to right, also in AR (the F2 plan's design QA rule: "charts keep LTR plot, labels mirror").
- 30 bars, gap 2, top corner radius 4 (`barCornerRadius`); bar height = `count / max × 100 %`, minimum 3 % when count > 0, nothing when 0.
- Colours: peak bar **`#e70101`** (series 1), the other bars **`#a49f9f`** (`neutral`, F2 plan §2.6 #4); a baseline in `gridColor` `rgba(28,15,15,0.12)`; white plot; **no gradients, no 3D, no legend** (a single series, labelled directly).
- Direct label: the peak value above the peak bar (text in the SVG, `tabular-nums`). The header caption is "Peak {n} on {date}" (D11).
- Axis: 3 labels (first, middle, last day) in an HTML row under the SVG, `dir="ltr"` so they line up with the bars; dates are formatted with `Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })` on the `YYYY-MM-DD` string (the api already bucketed in the client's zone, so the browser's zone must not move them).
- Accessibility: `role="img"` + `aria-label` "Leads per day, last 30 days, days in {zone}"; each bar has a `<title>` "{date}: {n}"; an `sr-only` table lists the 30 values (meaning is never carried by colour alone).
- 360 px: the SVG scales to the card width (about 300 px → about 8 px bars); there is no horizontal page scroll.

**`RankedBars` (leads by source):**
- At most 5 rows (D10: top 4 + "Other ({n} sources)" when there are more than 5). Each row is a source label (from the shared source labels, same names as `SourceBadge`) + a **direct value** (`tabular-nums`, at the inline end) + a bar with `inline-size: value / max × 100 %` (logical, mirrors in RTL).
- Colours: top row **`#e70101`** (the mockup's `.rank.hi`), the others **`#1c0f0f`** (series 2). "Other" is `#a49f9f`. No gradients.
- Empty (no leads in 30 days) → `EmptyState` "No leads in the last 30 days."

**KPI strip:** staff 5 tiles, client 6 (the brand max; `KpiTiles` tuple type plus the runtime cap). Order as in the mockup: Leads (30 d) (the 34 px hero) · New today · Median first reply · MQL rate · SQL rate · [client] Waiting for review (`hot` when > 0). Formats (`lib/format/metrics.ts`, locale-aware `Intl.NumberFormat`): counts as integers; rates `style: 'percent', maximumFractionDigits: 1` ("66.7%"); median ICU `{m} min` / `{h} h {m} min` from 60 up / "<1 min" for 0; `null` → "—" (an em dash with `aria-label` "No data yet").

**Layout (mockup `viewOverview`, minus the PRD hide list: no page title, no sub-line, no deltas, no funnel, no Won, no cost per SQL):**
- Staff: KPI strip → `grid g-main`: a `Card` "Leads per day" (chart) + a quiet aside "Leads by source".
- Client: KPI strip → `WaitingCard` (flush) → `grid g-main` of two quiet panels with a hairline on top (`rule-top`): Leads per day (200 px) and Leads by source.
- Under 900 px everything stacks into one column; the KPI strip uses its 2-column grid.
- **No primary red button on the Overview.** "Review leads" is secondary; the mark buttons are the F4b segmented control.

### 4.6 Web structure
- `page.tsx` (Server Component): `setRequestLocale`; `await guardRoute('overview', projectId)`; `const [data, project] = await Promise.all([getOverview(projectId), getProject(projectId)])` (`project.timezone` feeds the chart caption and screen-reader text; `ProjectProvider` is client-only and tenant reads aren't cached, so one extra cheap internal call is the simple, rule-abiding choice); renders `<OverviewRefresh />` + `<OverviewScreen data={data} projectId={projectId} timezone={project.timezone} />`.
- `loading.tsx`: `Skeleton` KPI strip (5 tiles) + one chart card of the same height (no layout jump).
- Errors: an api error goes through the shell's `error.tsx` with `errors.<code>`; a wrong or foreign `projectId` was already turned into not-found by the layout.
- URL: no query state. The refresh is 30 s, paused while the tab is hidden or while a mark is pending, and once on focus (D12).
- i18n `reports.json` (English now, AR/FR at the D18 freeze): `kpi.{leads30,newToday,medianReply,mqlRate,sqlRate,waiting}`, `chart.{perDay,perDayLabel,peak,last30,bySource,other,daysIn}`, `waiting.{title,review,empty.title,empty.body}`, `empty.noLeads30`, `value.{none,lessThanMinute,minutes,hoursMinutes}`. "SharkX" in body copy, no hard-coded strings, no physical-direction classes (the lint checks enforce it).

### 4.7 Mockup mapping
Open `#role=manager&p=lum&v=overview` (staff), `#role=client&cp=lum&v=overview` (client), `#role=manager&v=clients` (agency).

| Mockup piece | Build |
|---|---|
| `head({title, sub})` | **not built** (PRD hides page titles and the sub-line) |
| `kstrip`: leads30, newToday, reply ("— " or "N min"), mqlRate, sqlRate, client `waiting` (`hot`) | `OverviewKpis` (D3 median, D5 rates) |
| `card` "Leads per day" + small "Peak N on D" + `barChart(days, h 264/200)` | `Card` + `BarChart` (SVG) |
| `quiet aside` "Leads by source" + "Last 30 days" + `hbars(top 5)` | `RankedBars` (top 4 + Other, D10) |
| client `waitCard`: flush card, "Waiting for review" + secondary "Review leads →", table Lead/Source/Campaign/Received/Mark as, `fresh` rows, empty "All caught up / Nothing is waiting." | `WaitingCard` + `ClientMarkCell` (D13) |
| `viewClients` sub-line "city, industry" | + " · {zone}" (D7) |

## 5 · Tests (checkpoints)

**Hand-computed seed numbers** (frozen `now` = `2026-11-25T10:00Z`, test leads excluded, D3 true median; computed from `buildSeed`, to be hand-checked once and stored in `expected.json` by T1):

| Client (zone) | Leads 30 d | New today | MQL rate | SQL rate | Median reply | Replied / with chat | Waiting | Sources (top) | Peak |
|---|---|---|---|---|---|---|---|---|---|
| lum (Dubai) | 15 | 3 | 10/15 = 66.7% | 6/15 = 40.0% | **19 min** (3,5,11,12,13,25,25,30,39,39) | 10 / 11 | 4 | meta 6, tiktok 3, google 2, whatsapp 2, snapchat 1, website 1 (6 → Other) | 4 on 30 Oct |
| prl (Dubai) | 13 | 3 | 11/13 = 84.6% | 1/13 = 7.7% | **14 min** (3,5,6,11,17,26,35,41) | 8 / 10 | 1 | tiktok 4, website 3, whatsapp 3, meta 2, youtube 1 | 3 on 25 Nov |
| nov (Casablanca) | 12 | 2 | 7/12 = 58.3% | 4/12 = 33.3% | **16 min** (3,13,16,25,29) | 5 / 7 | 4 | whatsapp 3, snapchat 3, meta 2, tiktok 2, google 1, website 1 (6 → Other) | 2 on 13 Nov |
| fal (Dubai) | 11 | 3 | 8/11 = 72.7% | 4/11 = 36.4% | **22 min** (9,9,22,25,34; a tie) | 5 / 6 | 1 | google 3, linkedin 3, website 2, meta 2, whatsapp 1 | 3 on 25 Nov |
| oas (Dubai) | 11 | 3 | 2/11 = 18.2% | 1/11 = 9.1% | **21 min** (15,19,20,20,22,30,30,42; ties) | 8 / 9 | 4 | meta 4, tiktok 2, snapchat 2, whatsapp 2, google 1 | 3 on 25 Nov |

`newToday` and `waiting` equal the existing `expected.json` (`newToday`, `byStatus.new`). The seed's `first_reply_at` equals the message-derived first reply for every lead (checked).

api (Vitest, Postgres, seeded with the frozen `now`):
- `overview.test.ts`
  - **KPIs per client equal `expected.json`** (the table above) for staff, and the same numbers in the client's response for its own client.
  - `perDay` has 30 entries, the last is today in the client's zone, and **the bars sum to `leads30`**; the peak day and value match.
  - `bySource` sums to `leads30` and is ordered by count desc, then source.
  - **Zone day boundary:** a lead at `2026-11-24T20:30Z` counts as *today* for a Dubai client (00:30 on 25 Nov) and *yesterday* for a Casablanca client (21:30 on 24 Nov); `newToday` and the last bucket move accordingly.
  - **Window edge (D4):** a lead at the exact local midnight starting day −29 is in; one second earlier is out; the rates and the median follow the same set.
  - **DST:** a project in `Europe/Paris` with `now = 2026-11-10` (the window crosses 25 Oct): 30 buckets, a lead at 23:30 local on the 25 Oct lands on 25 Oct, and the sum equals `leads30`.
  - **Test leads hidden for both roles:** inserting a test lead (today, with a chat and a reply) changes no number for staff or client, and it never appears in `waiting`.
  - Empty client (a new project): `leads30 0`, rates `null`, median `null`, 30 zero buckets, `bySource []`, client `waiting 0 / []`.
  - Client response parses with the strict schema; its JSON contains none of the staff-only keys (4.3); the staff response has no `waiting`.
  - Running twice changes nothing (read-only: row counts in `audit_log`, `change_feed` unchanged).
- `median.test.ts` (small fixtures on a fresh project, D1–D3):
  - no chats → `null`; inbound only → excluded (`null` if it is the only one); outbound only → excluded; outbound **before** inbound, then a reply → measured from the inbound to the *later* outbound; an outbound at the **same** `ts` as the first inbound doesn't count (strict `>`).
  - Even count → the mean of the two middle values (e.g. 10 and 20 → 15); odd → the middle; ties are kept, not de-duplicated (9, 9, 22, 25, 34 → 22; 20, 20, 30, 30 → 25); a 20-second reply → `0` → web "<1 min".
  - A contact with two leads (the first Not qualified, a new one later): each lead uses only its own messages (`next_at` cut-off); messages before a lead's `created_at` (an old chat before a Meta form) are ignored.
  - A reply sent from the phone (`origin: 'history'`, direction `out`) counts.
  - `first_reply_at` consistency: for every seeded lead the computed first outbound equals `leads.first_reply_at` (the guard that alerts us if F3b's write diverges).
- `client-isolation.test.ts`: client of A → `GET /reports/overview?projectId=B` → 404; `withTenant` as client of A reading B's `wa_messages` → 0 rows; staff of any project → 200.
- `workspace.test.ts`: manager → 200 on `GET /projects`; super admin 200; client 403 (exists); a test lead's unreplied conversation and overdue task don't count.
- The existing `route-actions.test.ts` / `guard.test.ts` pick up the new route (it declares `report.read` and no audit).

web (Vitest):
- `metrics.test.ts`: `formatRate(0.6667, 'en')` → "66.7%", `null` → "—"; `formatMinutes` 0 → "<1 min", 19 → "19 min", 65 → "1 h 5 min"; `formatDay('2026-11-25', 'en')` → "25 Nov" whatever the test machine's zone (run with `TZ=Pacific/Kiritimati`); `zoneLabel('Asia/Dubai', 'en')` → "GMT+4".
- `charts.test.tsx`: 30 bars; exactly one red bar (the earliest peak); zero days have no bar; minimum height; 3 axis labels; the `sr-only` table has 30 rows; the SVG has `direction:ltr`; `RankedBars` with 6 sources → 5 rows, the 5th "Other (2 sources)" whose value is the sum; values add up to the input total; bars use `inline-size` (no physical-direction styles).
- `structure.test.ts` covers the new page's `guardRoute` automatically; `KpiStrip` type forbids a 7th tile (already tested).

Playwright `stubbed` (`overview.spec.ts`, fake api with fixtures for staff, client, an empty client and a client with `medianFirstReplyMin: null`):
- Staff: 5 tiles with the fixture values ("19 min", "66.7%"), the chart caption "Peak 4 on 30 Oct", by source with "Other"; no waiting card; no primary red button.
- Client: 6 tiles, "Waiting for review" tile `hot`; waiting card with 5 rows; marking one (fixture) → toast, and the row leaves after the refresh; "Review leads" goes to `/leads?tab=unreviewed`; a row opens the lead drawer; `/en/clients` → not-found.
- Null data: median "—", rates "—", the empty by-source state.
- Agency view: the sub-line shows "· GMT+4" for a Dubai client and "· GMT+0" for Casablanca.
- **Screenshots 1440 / 360 × EN / AR** of the staff Overview, the client Overview and Clients home: no page scroll at 360, the plot stays LTR in AR while the labels and the ranked bars mirror, no staff label in the client view.

## 6 · Tasks and commits
Each task ends with `node scripts/verify.mjs` (`--all` when both apps change), plus `pnpm build` in `web` for UI tasks, and is pushed only after `git pull --rebase` and the owner's OK. **No task needs a migration or a contract change.**

| Task | What | h | Commit |
|---|---|---|---|
| T1 | `summarise()` + `leads30`, `mqlRate`, `sqlRate`, `medianFirstReplyMin`, `waiting`, `bySource`; regenerate `expected.json`, hand-check against §5 | 1 | `F13a: seed overview numbers in expected.json` |
| T2 | `overview.ts` + `overview-sql.ts` statements 1, 2, 4 (bounds, per day, by source, waiting), `routes.ts`, register in `app.ts`, `overview.test.ts` (seed, zone, window, DST, test leads, empty, shapes) | 3 | `F13a: overview aggregates and route` |
| T3 | Median statement (D1–D3) + `median.test.ts` + the `first_reply_at` consistency test | 2 | `F13a: median first reply from WhatsApp messages` |
| T4 | Isolation and agency permission tests (`client-isolation`, `workspace`) | 0.5 | `F13a: overview and agency permission tests` |
| T5 | `lib/format/metrics.ts`, `BarChart`, `RankedBars` + tests | 2.5 | `F13a: SVG charts and metric formats` |
| T6 | `lib/data/reports.ts`, overview page, `loading.tsx`, `OverviewScreen`, `OverviewKpis`, `OverviewRefresh`, `reports.json`, `request.ts` | 2 | `F13a: overview page` |
| T7 | `WaitingCard` (client) with `ClientMarkCell` and the refresh pause | 1 | `F13a: client waiting-for-review card` |
| T8 | Agency zone label in `clients-home.tsx` + `projects.json` `home.place` | 0.5 | `F13a: time-zone labels on the agency view` |
| T9 | Fake api + fixtures, `overview.spec.ts`, screenshots 1440/360 EN/AR | 1.5 | `F13a: e2e for overview and agency view` |
| | **Total** | **14 h** | |

Order: T1 → T2 → T3 → T4 · T5 → T6 → T7 → T8 · T9. T5 can start in parallel with T2 (it only needs the contract).
**Tracker:** `node scripts/track.js F13.1 --status now --pct 10 --note "Overview api started"` at T2; a milestone after T4 (`--pct 50 --note "Overview api and median done"`); `F13.4` done after T8 + its tests in T4 (`--pct 100 --status done --note "Agency view with zones, permission tested"`); `F13.1` done after T9.
**Done when:** the four acceptance criteria are ticked; `node scripts/verify.mjs --all` passes; the §5 checkpoints are green; the screenshots show no physical-direction drift, ≤ 6 tiles, ≤ 5 bars by source, only token colours and no staff data in the client view. Then post the **Tell Alex** note below.

**Cut first if late:**
1. D10 "Other" folding: show the top 5 as the mockup does (−0.25 h; the rows then don't sum to the total, so add a footnote).
2. The DST test with a non-seed zone (keep the Dubai/Casablanca boundary test): −0.25 h.
3. The `sr-only` data table under the bar chart (keep `aria-label` and the per-bar `<title>`): −0.25 h.
4. AR screenshots move to the F2c/D18 RTL pass (logical classes are still linted): −0.5 h.
5. The 30 s auto-refresh (the page refreshes after a mark anyway; F14a adds events): −0.25 h.

### Tell Alex (one message, before T3 is pushed)
1. **F3b contract note for `leads.first_reply_at`** (no schema change; the column exists). In the same transaction as each `recordMessage` insert, F3b sets the linked lead's `first_reply_at` to the **earliest outbound message (any origin, phone replies included) with `ts` strictly after the lead's first inbound message**, where the lead's messages are the contact's messages in this project from `lead.created_at` up to the contact's next lead. It **recomputes** this rather than writing "if null", because history and echoes arrive in any order (a later-arriving earlier inbound can change the answer). For example, after the insert:
   `update leads l set first_reply_at = (select min(o.ts) from wa_messages o join wa_conversations c on c.id = o.conversation_id where c.project_id = l.project_id and c.contact_id = l.contact_id and o.direction = 'out' and o.ts > (select min(i.ts) from wa_messages i join wa_conversations ci on ci.id = i.conversation_id where ci.project_id = l.project_id and ci.contact_id = l.contact_id and i.direction = 'in' and i.ts >= l.created_at)) where l.id = $leadId`
   (plus the next-lead cut-off if he links a contact to several leads). F13a doesn't read the column (D1); F12 does. A test in F13a compares it with the message-derived value, so a divergence shows up in CI.
2. **`ingestLead` from `recordMessage` must pass `receivedAt` = the message's `ts`** (not the processing time), so a WhatsApp-created lead's `created_at` equals its first inbound message and the first-reply window starts at that message. History-created leads then get their real (old) date and fall outside the 30-day window, as they should.
3. F13a reads `wa_conversations` / `wa_messages` read-only under `withTenant` (client role included; relies on F1b `client_access = read`). Nothing is written to his tables.
4. Not now, only if measured: an index `wa_conversations (project_id, contact_id)` in his schema.
5. No contract change, no migration, no edit in his modules.

## 7 · Risks and schedule

| Risk | Mitigation |
|---|---|
| **R1/R2 timing** (ORDER: F13a D11 is tagged R1, due D10, and needs F3b, which is R2) | D1 removes the dependency: F13a ships complete in **R1** with the median computed from seeded messages. When F3b lands, the same query reads live messages. The demo can say "first-reply time from WhatsApp, live once the number is connected" |
| F3b's `first_reply_at` write differs from D1 | F13a doesn't read it; the consistency test fails loudly; fix in F3b (Alex) or adjust the shared definition together |
| WhatsApp-created leads get `created_at` = processing time instead of the message time | Tell Alex #2; until then a lead's first inbound could fall *before* `created_at` and be skipped. The `median.test.ts` case with a WhatsApp-sourced lead pins the expectation |
| Mockup vs plan numbers differ (rolling window, upper median) | D3/D4 are written down; the §5 table is the reference; screenshots are compared with the plan, not with the mockup's numbers |
| Time-zone bugs (browser zone shifting day labels; DST) | Bucketing only in SQL; the web formats `YYYY-MM-DD` with `timeZone: 'UTC'`; the zone, DST and `TZ=` tests |
| The median subqueries get slow as messages grow | Each min uses `wa_messages_conversation_ts_idx`; measure with the F3b fixture volume; the index in Tell Alex #4 if needed |
| 14 h against 1 planned day (D11) | Starting Day 7 (F4b finished early), realistic Days 7–9, well ahead of D11 and the R1 demo |

**Re-verify once F3b lands** (Alex's `tests/fixtures/whatsapp/*`, recorded per F3b's test plan; the names follow his commit):
- Replay **history + live + echoes, shuffled**, into a test project → the median and `first_reply_at` are the same in every order and equal the computed value.
- **Unknown number** → new contact and lead (source whatsapp) with `created_at` = the first message's `ts`; first reply measured from it.
- **Known number, open lead** → the messages attach to that lead; **known number, closed (Not qualified) lead** → a new lead, and the `next_at` cut-off splits the reply times correctly.
- **Reply from the phone** (echo, outbound with origin `history`/`app`) counts as the reply.
- **Same customer on two numbers of one client** → one contact, two conversations: the first inbound and first outbound are taken across both.
- **Media placeholders** (image/audio inbound) count as customer messages.
- The Clients home `unreplied` count on the replayed data equals "last message inbound" per conversation.
- No new acceptance criteria to tick: F13a's were already met on the seed. Commit the re-check (`F13a: re-verify overview on F3b fixtures`) only if a test has to change.
