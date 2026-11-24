# F2a · Technical spec for the remaining work (shell, projects api, auth restyle, e2e)

Owner: B (John) · Spec: [F2a-shell-i18n.md](F2a-shell-i18n.md) · Detailed design: [F2-web-technical-plan.md](F2-web-technical-plan.md) §2 · Tracker: F2.1, F2.2
Written 2026-11-24 (Day 5) against `master` at `1fc3014`. Planned Days 3–4, so **F2a is about one day late**, as the plan's §6 forecast.

This document does not repeat the design in the plan. It records what is built, the gaps found in the code, and the exact work left, task by task, so it can be built and ticked off.

## 1 · Progress

| Task | What | State | Commit |
|---|---|---|---|
| T0 | Contract additions (`projects.ts`, `agency.read`, …) | done | `e261e83`, `3c45212` |
| T1 | Brand tokens, light-only canvas, `fonts.css`, logos in `public/brand` | done | `f7bc6a7` |
| T2 | Logical-CSS and hard-coded-string checks | done | `5aa9fd1` |
| T3 | `navigation.ts`, `format.ts`, `use-project-format.ts`, catalogs `common`/`ui`/`shell` | done | `e8aced8`, `9688411` |
| T4 | Icons and base components | done | `9b6ab43` |
| T5 | Overlays, tabs, toasts, `DirectionProvider` | done | `3d92220`, `c35024e`, `5b18238` |
| T6b | api `projects` module: `GET /projects/options`, `GET /projects/:id` | done (14 tests) | local, not yet committed |
| T6a | App shell: nav config, guard, rail, topbar, switcher, language menu, `(app)` and `p/[projectId]` layouts, states | done (36 unit tests) | local, not yet committed |
| T7 | `(auth)` restyled to the mockup split screen + `verifyCode` uses the saved locale | done (Alex to be told: his F1c files) | local, not yet committed |
| T8 | Playwright: fix stale smoke test, `stubbed` project, sign-in → client dashboard | done (3 smoke + 10 stubbed pass) | local, not yet committed |

Baseline today: `node scripts/verify.mjs --all` passes (api 28 files / 731 tests; web 24 files / 580 tests, with typecheck, Biome, logical-CSS, hard-coded strings); Playwright 13 / 13.

**Acceptance criteria (F2a spec)**

| Criterion | State |
|---|---|
| SHARKX brand, usable at 360 px; icon-only rail that opens on hover/focus and pushes the page; no in-page titles | **met** (T6a): `desk` rail opens on hover/focus-within and pushes the page; off-canvas drawer below 900 px or on touch (out of the tab order while closed); no scroll at 360 px in EN/AR (stubbed e2e) |
| EN/AR/FR with full RTL; language saved per user; no hard-coded strings | **met for F2a** (language menu saves it, sign-in applies it, RTL checked); Arabic/French text is F2c. Open for F2c: a long Latin client name truncates at the start in RTL at 360 px |

## 2 · Gaps found in the code (not in the plan, or easy to miss)

1. **Every staff sign-in currently lands on a 404.** `landingPath()` sends staff to `/<locale>/clients` and clients to `/<locale>/p/<id>/overview`. Neither route exists yet. T6a must ship a `/clients` page (placeholder until F2b) as well as the overview placeholder.
2. **`projectDetail.businessHours` doesn't match the database.** The contract wants 7 per-day entries (`businessHoursDay[]`). The column still holds the old `{ days, start, end }` shape, and migration `0003` (which changes it) is F4a/T10. `GET /projects/:id` must convert the old shape in the service (§3.3) until `0003` lands.
3. **`projects.color` can be null, but the contract requires it.** The service fills a missing colour from the token cycle (§3.3), so the web never sees null.
4. **`verifyCode` uses the request locale, not the saved one** (`web/src/lib/actions/auth.ts:51`). So "language saved per user" isn't applied at sign-in. The fix is a one-line change in an Alex-owned file: tell Alex, own commit (§5).
5. **No `error.tsx`, `loading.tsx`, skip link, or `(app)/not-found.tsx` exist yet.** These are listed in plan §2.11–2.12 and belong to T6a.
6. **`web/tests/e2e/smoke.spec.ts` test 1 is stale.** It expects a "SHARKX Agency CRM" heading on `/en`, but `/en` now redirects to `/en/login`. This is T8.

## 3 · T6b · api `projects` module (do first: T6a reads it)

### 3.1 Files
```
api/src/modules/projects/
  schema.ts         exists, unchanged
  service.ts        new: listProjectOptions(session), getProjectDetail(session, id)
  routes.ts         new: projectRoutes (defineRoute)
  index.ts          new: export { projectRoutes, listProjectOptions, getProjectDetail }
  colors.ts         new: PROJECT_COLORS token cycle + colorFor(index)
  hours.ts          new: toDailyHours(legacy) (removed when 0003 lands)
  projects.test.ts  new (unit + routes against Postgres)
api/src/app.ts      register projectRoutes (one line, after auditRoutes)
```

### 3.2 Routes
| Route | Access | Action | Response | Audit |
|---|---|---|---|---|
| `GET /projects/options` | `session` | `'self'` (any active user; the service limits the rows) | `projectOptionsResponse` | none (read) |
| `GET /projects/:id` | `session` | `({ params }) => ({ action: 'project.read', projectId: params.id })` | `projectDetail` | none (read) |

- Here the path id *is* the project, so the tenant rule (plan §3.1: `can()` runs on the project before any read) holds without repeating it in the query. Same pattern as the existing `tests/http/guard.test.ts` route.
- A uuid that is unknown, or belongs to another client, returns `NOT_FOUND` (404) for every role. The route never says 403 for a project, so callers can't learn which projects exist.

### 3.3 Service
- Both reads go through `withTenant({ userId, role }, tx => …)`. RLS already limits a client to its own row (`app_secure_tenant_table('projects', 'read', 'id')`). The service also filters by `session.projectIds` for the client role, as defence in depth.
- `listProjectOptions`: `select id, name, city, industry, color, timezone from projects order by lower(name)`. A null `color` is filled by `colorFor(id, stored)` (the stored colour, else a stable pick from the id). A row index would differ per viewer under RLS, so it can't be used.
- `PROJECT_COLORS = ['#e70101', '#1c0f0f', '#776f6f', '#f16767', '#a49f9f']` (red, black, blackTint60, redTint60, blackTint40; plan §2.5). A test asserts each value is in `skills/sharkx-brand-guidelines/assets/tokens.json`.
- `getProjectDetail`: the same columns plus `businessHours: toDailyHours(row.businessHours)`. `toDailyHours({ days, start, end })` returns 7 entries (ISO day 1–7), `open: days.includes(day)`, `from: start`, `to: end`. If the value is already an array (after `0003`), it passes through unchanged.
- The response is parsed with the contract schema by `defineRoute`. No email or user data is returned.

### 3.4 Tests (checkpoint)
- Super admin and manager: `options` returns every project. Client of A: returns only A.
- `GET /projects/A` as client of A → 200. As client of B → 404. An unknown uuid → 404. A malformed id → 422 (staff). No or unknown session → 401.
- `toDailyHours`: Mon–Fri 09:00–18:00 gives 5 open and 2 closed days; an array input passes through.
- A project with null colour gets a token colour; the same row gives the same colour twice.

Commit: `F2a: projects options and detail routes`.

## 4 · T6a · App shell, role-gated nav, project context

### 4.1 Files (web)
```
src/lib/data/projects.ts          getProjectOptions(), getProject(id) (server-only; React cache())
src/lib/nav/config.ts             NAV per role (plan §2.3 table), RouteKey, NavItem.ready
src/lib/nav/routes.ts             ROUTES table, canViewRoute(), routePath(), projectIdOf() (pure)
src/lib/nav/guard.ts              guardRoute() (requireSession + canViewRoute, else notFound)
src/lib/nav/routes.test.ts        role × route matrix (stands in for guard.test.ts) (plan §7 table), nav config checks
src/lib/nav/structure.test.ts     every (app) page.tsx calls guardRoute('<own key>'); every ready item has a page
src/components/shell/
  app-shell.tsx (skip link, scrim, main, footer)  rail.tsx  topbar.tsx (LanguageMenu, MeBlock)
  project-switcher.tsx (ProjectSwitcher, ClientBlock)  shell-context.tsx  project-context.tsx (exists)
  not-found-panel.tsx  error-panel.tsx  placeholder.tsx
  shell.test.tsx                  jsdom: nav per role, aria-current, menu button, switcher rows, language switch
src/app/[locale]/
  error.tsx                       new: outside the shell
  (app)/layout.tsx                requireSession() + getProjectOptions() → <AppShell>
  (app)/error.tsx  loading.tsx  not-found.tsx
  (app)/[...rest]/page.tsx        notFound()
  (app)/clients/page.tsx          guardRoute('clients') → EmptyState placeholder (real page in F2b)
  (app)/p/[projectId]/layout.tsx  uuid check → getProject() → <ProjectProvider>; NOT_FOUND → notFound()
  (app)/p/[projectId]/overview/page.tsx   guardRoute('overview', projectId) → EmptyState placeholder (real in F13a)
messages/en/shell.json            add: menu.open/close, skipToMain, notFound.*, error.*, placeholder.* (keys only, English)
```

### 4.2 Behaviour (build to these; details in plan §2.2–2.5, 2.11–2.12)
- **Nav.** `NAV[role].agency` outside a project; `NAV[role].project` inside `/p/<uuid>/…`. Items with `ready: false` are **hidden**. In F2a only `clients` and `overview` are `ready: true`; `team` flips in F2b, `leads`/`contacts` in F4b, and so on. The client nav uses the `navClient` labels.
- **Rail.** Wide screens with hover use the custom variant `desk` (min-width 900px and hover: hover, in `globals.css`). 72 px collapsed, 248 px open, at inline-start. It opens on `:hover`/`:focus-within` and pushes content via `has-[aside:hover]:ps-[--side-w]`. Labels fade in and the icon logo swaps for the compact wordmark. Below 900 px or on `(hover: none)`, it becomes an off-canvas drawer opened by a topbar menu button (`aria-expanded`, scrim, Esc closes, focus returns to the button `#sx-rail-toggle`). No horizontal scroll at 360 px.
- **Topbar (56 px).** Menu button (narrow only), then the project switcher (staff) or the static client block (client), then the language menu and the me-block (name, role label, Sign out via `logout`). No in-page titles. The current item gets `aria-current="page"`.
- **Switcher** (Radix `Menu`): a "Client" label, **All clients** → `/clients`, a separator, then one row per option (initials square with `onColor()` text, name). Zero options: "No clients yet" plus, for the super admin only, an "Add client" link to `/clients?new=1` (wired in F2b).
- **Language menu:** EN / العربية / FR. On select, `updateMe({ locale })`, then `router.replace(pathname, { locale })` from `lib/i18n/navigation.ts`. `dir` flips through the existing layout.
- **Guard.** Every `(app)` page calls `guardRoute(key, projectId?)`, and any denial is `notFound()`. The in-shell not-found and the catch-all look identical, so a client can't tell "forbidden" from "missing".
- **States.** `(app)/error.tsx` shows `errors.INTERNAL` and a Try again button (`reset()`), with no error text or digest. `loading.tsx` shows a `Skeleton` with a KPI strip and one card. The footer reads `SharkX · {date} · Confidential · sharkx.ae`; the date is formatted on the server with `createFormat` in the agency zone (Asia/Dubai) so server and browser agree.
- **Data passed to the browser:** the shell gets `{ name, role, projectIds }` (the locale comes from `useLocale()`) and the options list. Never the email.

### 4.3 Checkpoint
- `src/lib/nav/routes.test.ts` covers the plan §7 matrix (3 roles × `clients`, `team`, `overview`, `contacts`, `settings`, foreign project).
- `structure.test.ts` checks that every page calls `guardRoute` with its own key.
- `shell.test.tsx` checks: the rail shows two items for a super admin in agency mode; inside a project, five client items (only the ready ones visible); the switcher lists options; and the language menu calls `updateMe`.
- Manual check, EN and AR at 1440 and 360: sign in as `admin@sharkx.local` and land on `/en/clients`, with no 404.

Commit: `F2a: app shell, role-gated nav and project context`.

## 5 · T7 · Auth restyle (Alex-owned files)
- Tell Alex first. The change touches `(auth)/layout.tsx` and `components/auth/*` (F1c), in its own commit.
- Layout from the mockup: two columns. On the left, a red cover with `logo-primary-red-bg.png`, the tagline on the cover only, and the footer line. On the right, a white form box (max 400 px). Below 900 px the cover stacks on top. Replace the `components/auth/ui.ts` class strings with `Button`, `Field`, `Input`; fields use radius 10 and placeholders `sx-muted`.
- In the same commit (also Alex's file): `verifyCode` redirects with `landingPath(res.me, res.me.locale)` (gap 4).
- Checkpoint: existing auth tests stay green; screenshots at 1440/360 in EN/AR.

Commit: `F2a: sign-in screens restyled to the mockup`.

## 6 · T8 · Playwright
- Fix `smoke.spec.ts` test 1: `/` → `/en/login`, and the login form is visible.
- Add `tests/e2e/support/fake-api.ts` (Node runs it natively; every response is parsed with the contract schema) and `fixtures.ts`: a small HTTP server on :4200 that answers `/me`, `/auth/login`, `/auth/code/verify`, `/auth/logout`, `/projects/options`, `/projects/:id` from fixtures typed with the contract schemas. Add a `stubbed` project to `playwright.config.ts` that starts web on :3200 with `API_URL=http://localhost:4200`.
- Path: sign in as the client fixture → code → lands on `/en/p/<id>/overview` → rail shows the ready client items → `/en/clients` and `/en/p/<other>/overview` show not-found → switch to AR (`dir="rtl"`, rail on the right) → sign out.
- RTL/360 assertion on every shipped route: `scrollWidth <= innerWidth`.

Commit: `F2a: stubbed Playwright path from sign-in to client dashboard`.

## 7 · Order, estimate, tracker

| Order | Task | Est. | Tracker update after |
|---|---|---|---|
| 1 | T6b projects api | 1.5 h | none |
| 2 | T6a shell | 3.5 h | `F2.1 --pct 85`, `F2.2 --pct 90` |
| 3 | T7 auth restyle (after Alex says OK) | 2 h | none |
| 4 | T8 Playwright | 2.5 h | `F2.1 done 100`; `F2.2` stays `doing` (AR/FR text is F2c) |

About 9.5 h in total, roughly one working day, which lands F2a on Day 6. If the Day 10 demo is at risk, T7 and T8 can move after T23, as in plan §6. Each task ends with `node scripts/verify.mjs` green. No push without the owner's approval (push target: `master`).

## 8 · Open items
| # | Item | Needed by |
|---|---|---|
| O1 | Alex agrees to T7 and the `verifyCode` locale fix (his F1c files) | before T7 |
| O2 | Local dev without Docker: this machine uses a native PostgreSQL 18 on :5432 (`api/.env.local`); api tests use `sharkx_test` there. No code change, noted only so test results are comparable. | info |
| O3 | Placeholder copy for `/clients` and overview before F2b/F13a: proposal is `EmptyState` titled "Coming soon in this release" (English only) | T6a |
| O4 | A client user with no project loops between `/login` and `landingPath()` (`web/src/lib/session.ts`, F1c): the auth layout redirects an active session to `/login`. Alex to choose the landing (status page or sign-out). Found in the F2a review; not changed here. | F10a |
