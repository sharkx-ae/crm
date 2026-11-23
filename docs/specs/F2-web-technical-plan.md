# F2 · Web technical plan (John, Phase 1)

Specs covered, in build order: F2a (D3–4) → F4a (D5–6) → F2b (D7) → F10a (D8) → F4b (D9–10) → F13a (D11). Written against the repo at `e52a699` (2026-11-22, D3). Plan only: no product code beyond type signatures.

Design truth: the clickable mockup `docs/inputs/sharkx-crm-mockup.html` (v3) for layout, nav per role and copy; `skills/sharkx-brand-guidelines` for colour, type and naming. Deep links into the mockup (opened in a browser) use its hash: `#role=<super|manager|client>&v=<view>&lang=<en|ar|fr>&p=<projectId>&cp=<clientProjectId>&lt=<leadsTab>&tab=<settingsTab>&modal=newClient&pop=ctx`.

## 0 · Read this first: what changed since the specs were written

1. **F1c is already delivered (commits `0fd2fd1`…`2ab35c2`).** `getSession`, `requireSession`, `landingPath`, `defineAction`, `apiCall`, `updateMe`, `logout`, `inviteUser`, `setUserStatus`, `getUsers`, `inspectInvite`, the proxy guard, CSP and the `(auth)` screens exist. John does not need a stub session or stub invite actions. This plan keeps your requirement ("don't wait on Alex") by faking only at the HTTP boundary for tests (§2.15, §7); no stub code goes into `lib/session.ts` or `lib/actions/users.ts`, so nothing has to be swapped later.
2. **Still pending from Alex** and how Phase 1 copes: F3b chats and `first_reply_at` (seed fills them), F11a conversion sender (F4b only writes the outbox rows), F14a `/api/events` (5 s polling uses `router.refresh()` until then), F14b bell and wizard (out of F2a scope), the `/api/export/[kind]` route shell (John writes it if not there by D8).
3. **Spec conflicts, resolved:** (a) F2b says a client user opening `/clients` is "redirected to its own dashboard"; F10a and your brief say every non-client route returns the same not-found page. This plan follows F10a: **not-found, never a redirect**. (b) F13a says a client "gets forbidden" on the agency view. Same resolution: not-found. (c) PRD "UI deltas" hides in-page titles that the mockup still shows; the PRD wins (§4 mapping table).
4. **Existing code that breaks a rule and gets fixed in F2a:** `web/src/app/globals.css` enables a dark theme (`color-scheme: light dark`, `light-dark(...)`), names a font ("Manrope") that is neither loaded nor the brand's, and keeps unused `--color-brand/--color-ink` tokens. `web/tests/e2e/smoke.spec.ts` test 1 still expects the old home heading and fails now that `/` redirects to sign-in. The `(auth)` layout is a centred card; the mockup's auth screens are a split screen with a red cover (T7).

## 1 · Current state vs target

| Item | Exists? | Action |
|---|---|---|
| Next.js 16.4.6, React 19.3.1, TS 6 strict, `cacheComponents: false` | yes | keep |
| `proxy.ts` (CSP nonce, session-cookie guard, next-intl) | yes | keep; no change (§2.4) |
| Tailwind 4.3.5 CSS-first (`@theme` in `globals.css`) | partial: some `sx-*` tokens, **dark theme on**, Manrope | rewrite tokens, light only, Segoe UI stack (T1) |
| `radix-ui` 1.8.1 umbrella | installed, unused | use for Dialog, Popover, DropdownMenu, Tabs, Toast, Switch, Direction (T4–T5) |
| `web/scripts/check-logical-css.mjs` | yes, Tailwind classes only | extend to CSS properties and style objects; add self-tests (T2) |
| Hard-coded-string check | no | add `check-hardcoded-strings.mjs` using the `typescript` AST (T2) |
| Vitest | node env, `src/**/*.test.ts` only | add jsdom for `*.test.tsx` (decision D1) |
| Playwright | real api only; test 1 stale | refresh; add `stubbed` project with a fake api (T8) |
| `[locale]/layout.tsx` (html `lang`/`dir`, intl provider) | yes | add `DirectionProvider`, skip link, fonts; pass only client modules to the provider |
| `(auth)` login, code, reset, accept-invite | yes (F1c), centred card | restyle to the mockup split screen (T7, tell Alex) |
| `(app)` group, shell, `/clients`, `/team`, `/p/[projectId]/…` | no | build (T6, F2b, F10a, F4b, F13a) |
| `not-found.tsx` (full page) | yes | keep; add in-shell `(app)/not-found.tsx` with the same copy, `[...rest]` catch-all |
| `error.tsx`, `loading.tsx` | no | add (T6) |
| `lib/session.ts`, `lib/action.ts`, `lib/api/client.ts`, `lib/actions/{auth,users}.ts`, `lib/data/users.ts` | yes | reuse unchanged |
| `lib/i18n/{routing,request}.ts` | yes (`MESSAGE_MODULES = common, auth, errors`) | extend modules; add `navigation.ts`, `format.ts`, `use-project-format.ts` (T3) |
| `messages/en/{common,auth,errors}.json` | yes | add `shell`, `ui`, `projects`, `team`, `leads`, `reports`; grow `common` (statuses, sources, roles, health) |
| `messages/ar|fr` | `common.json` only | fall back to English until F2c (already wired in `request.ts`) |
| `components/ui/*` | no (only `auth/ui.ts` class strings and 6 auth components) | build (T4–T5); auth components move onto them |
| Logos in `web/public/brand` | `logo-red-on-white.png` only | copy icon, compact wordmark and primary lockup from `skills/…/assets/logos` |
| Sharp Sans / GE Flow files | pending | `@font-face` stub that activates when files land; Segoe UI until then |
| `web/src/contracts` | generated, in sync (2.0.0) | after each `contracts:` commit run `node scripts/sync-contracts.mjs` |
| `api/src/contracts/{projects,leads,contacts,reports}.ts` | no | add (T0, §5) |
| `knownAuditActions` | 9 auth/user actions | append 8 (§5) |
| api modules `projects, leads, contacts, pipeline, tasks, notifications` | `schema.ts` only | add `service/routes/index` (T6b, F4a, F2b, F4b, F13a); `reports` has no files yet |
| `db:seed` | no (only `seed-super-admin.ts`) | build in F4a (T14) |
| Migrations 0000–0002 | yes (F1b) | add `0003` (§5) |
| `/api/events`, `/api/export/[kind]` | no (`/api/health` yes) | events = F14a (Alex); export = F4b |
| `libphonenumber-js` | not installed anywhere | decision D3 (api only) |

## 2 · F2a in depth

### 2.1 Routes under `src/app/[locale]`
```
[locale]/
  layout.tsx            exists: add <DirectionProvider>, skip link, fonts.css
  error.tsx             new  (client; pre-auth errors)
  not-found.tsx         exists (full-page StatusPanel)
  page.tsx              exists (landing redirect)
  (auth)/               exists: login, code, reset, accept-invite  (restyle T7)
  (app)/
    layout.tsx          requireSession() → <AppShell>
    error.tsx  loading.tsx  not-found.tsx
    [...rest]/page.tsx  calls notFound() → same in-shell page for any unknown URL
    clients/            F2b S1 (staff)
    team/               F2b S3 (super admin)
    p/[projectId]/
      layout.tsx        loads the project, 404 for a bad uuid / unknown / not yours
      overview/         placeholder in F2a (EmptyState), real in F13a
      leads/  contacts/ F4b
      settings/         layout.tsx (link tabs), page.tsx (redirect to first ready tab)
        client-users/   F10a S2        hours/   F2b S4
      (inbox, pipeline, tasks, reports, integrations: later specs; nav `ready:false` until each lands)
app/api/                health (exists) · events (F14a) · export/[kind] (F4b)
```
`overview` ships as a placeholder in F2a because F2b "create client" and the client landing (`landingPath`) both redirect there before F13a exists.

### 2.2 `(auth)` and `(app)` shells
- `(auth)`: after T7, the mockup's `.auth` layout: two columns, left red cover (`logo-primary-red-bg.png`, tagline "Marketing Built to Dominate." on the cover only, footer `SharkX · Confidential · sharkx.ae`), right white form box (max 400 px). Under 900 px the cover stacks on top. The existing guard (signed-in → landing rule) stays.
- `(app)/layout.tsx` (server): `const me = await requireSession()` (React `cache`, deduped with `getSession`); `const options = await getProjectOptions()` (staff: all; client: its one); renders `<AppShell me={…} options={…}>{children}</AppShell>`. The shell receives `{ name, role, locale, projectIds }` only, never the email.
- `AppShell` (`src/components/shell/`): `app-shell.tsx` (grid + providers), `rail.tsx` (client), `nav-link.tsx`, `topbar.tsx`, `project-switcher.tsx` (client), `language-menu.tsx` (client), `me-block.tsx` (name, role label, sign-out via `logout`), `footer.tsx` (`SharkX · {date} · Confidential · sharkx.ae` + user and role, as in the mockup), `skip-link.tsx`, `shell-context.tsx` (`useShell()`), `project-context.tsx` (`useProject()`).
- Geometry from the mockup: rail 72 px, open 248 px, topbar 56 px, content `padding: 32px 40px 24px`, `max-width: 80rem`. Tokens `--rail-w`, `--side-w`, `--top-h`. Breakpoints in `@theme`: `--breakpoint-rail: 900px`, `--breakpoint-wide: 1100px` (variants `rail:` and `wide:`).
- **Rail behaviour:** icon-only; opens on `:hover` or `:focus-within` and **pushes** the page (`has-[aside:hover]:ps-[--side-w]`, `has-[aside:focus-within]:ps-[--side-w]`). Labels fade in (opacity), the icon logo swaps for the wordmark. Below 900 px, or on `(hover: none)` devices (custom variant `touch`), the rail is off-canvas: a topbar menu button toggles it (`aria-expanded`, scrim, Esc closes, focus returns to the button). No horizontal scroll at 360 px.
- **No in-page titles.** The rail marks the current item with `aria-current="page"`. A page's one action sits in `PageActions` (inline-end of the first row).

### 2.3 Role-gated nav: one config object per role
`src/lib/nav/config.ts`:
```ts
export type RouteKey = 'clients'|'team'|'audit'|'overview'|'inbox'|'leads'|'contacts'|'pipeline'|'tasks'|'reports'|'integrations'|'settings';
export type NavItem  = { key: RouteKey; icon: IconName; labelKey: string; ready: boolean; badge?: BadgeKey };
export type NavGroup = { labelKey?: string; items: NavItem[] };
export type RoleNav  = { agency: NavGroup[]; project: NavGroup[] };      // agency = no client selected; project = inside /p/<id>
export const NAV: Record<Role, RoleNav>;
```
| Role | `agency` | `project` |
|---|---|---|
| `super_admin` | **Agency:** Clients · **Admin:** Team, Audit log (`ready:false` until F1e) | **Workspace:** Overview, Inbox, Leads, Contacts, Pipeline, Tasks, Reports · **Setup:** Integrations, Settings |
| `manager` | **Agency:** Clients | same as super admin |
| `client` | (none: lands on its project) | Overview, Leads, **WhatsApp** (key `inbox`), Reports, **Connectors** (key `integrations`) |

- `ready` is flipped by the spec that lands the route (inbox F3c, pipeline F8a, tasks F8b, reports F13b, integrations F14b, audit F1e). An item that is not ready is **hidden, not greyed** (F10a S1). Staff and client get the same rule.
- Labels come from `shell.nav.<key>`; client-only variants use `shell.navClient.inbox` and `shell.navClient.integrations`.
- Badges (mockup): Leads = waiting for review, Inbox = unread, Tasks = overdue, Integrations = to fix. F2a renders the badge slot hidden. Data arrives with the owner spec (`leadsWaiting` in F4b; the others by F3c, F8b, F14).
- **Staff in a project** have no Clients item in the rail (as the mockup); the project switcher's "All clients" entry goes back to `/clients`.
- Mode is derived from the path: `/p/<uuid>/…` = project mode, otherwise agency mode.

`src/lib/nav/guard.ts` is the single route table and the page guard:
```ts
export const ROUTES: Record<RouteKey, { roles: readonly Role[]; action: Action; perProject: boolean }> = {
  clients:      { roles: ['super_admin','manager'], action: 'agency.read',    perProject: false },
  team:         { roles: ['super_admin'],           action: 'user.manage',    perProject: false },
  audit:        { roles: ['super_admin'],           action: 'audit.read',     perProject: false },
  overview:     { roles: ALL,   action: 'project.read',       perProject: true },
  leads:        { roles: ALL,   action: 'lead.read',          perProject: true },
  inbox:        { roles: ALL,   action: 'chat.read',          perProject: true },
  reports:      { roles: ALL,   action: 'report.read',        perProject: true },
  integrations: { roles: ALL,   action: 'integration.manage', perProject: true },
  contacts:     { roles: STAFF, action: 'contact.read',       perProject: true },
  pipeline:     { roles: STAFF, action: 'pipeline.manage',    perProject: true },
  tasks:        { roles: STAFF, action: 'task.manage',        perProject: true },
  settings:     { roles: STAFF, action: 'project.update',     perProject: true },
};
export function canViewRoute(me: Pick<Me,'role'|'projectIds'|'stage'>, key: RouteKey, projectId?: string): boolean;  // pure, unit-tested
export async function guardRoute(key: RouteKey, projectId?: string): Promise<Me>;                                   // requireSession + canViewRoute else notFound()
```
Every denial is `notFound()` for every role (no 403 page): the page must not reveal that a staff route exists. A structure test requires that every `page.tsx` under `(app)` calls `guardRoute(` with its own key. The layout is **not** the protection (a layout cannot see the child segment); each page and each Server Action re-checks (`defineAction` already does `can()`).

### 2.4 `proxy.ts`, locale handling and session reading
- `proxy.ts` is unchanged: per-request CSP nonce, cookie-presence guard for every non-auth segment, `next-intl` routing, `localePrefix: 'always'` (`/en/…`), locale detection from `NEXT_LOCALE` then `Accept-Language`. The real session check is the page (`requireSession`).
- **Locale rule:** the URL locale wins for the request (deep links stay shareable). The saved language (`users.locale`) is applied at sign-in (`landingPath(me, me.locale)`; **touch point for Alex:** `verifyCode` currently redirects with the request locale) and updated by the language menu: `updateMe({ locale })` → navigate to the same path in the new locale (next-intl `Link`/`router.replace(path, { locale })` sets the cookie).
- `src/lib/i18n/navigation.ts`: `export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)`. New code uses these; existing auth code with manual `/${locale}` prefixes stays.
- Session reading in the shell: `me` from `requireSession()`; the client nav is derived from `me.role`; the client's project from `me.projectIds[0]`.

### 2.5 Project context
- **Staff:** the project is the URL segment. `p/[projectId]/layout.tsx` runs `z.uuid().safeParse(projectId)` (else `notFound()`), then `getProject(projectId)`; an api `NOT_FOUND` becomes `notFound()`. The switcher (`ProjectSwitcher`, Radix `DropdownMenu`) lists `options`: "Client" header, **All clients** (→ `/clients`), separator, one row per client (initials square in the client's token colour, name). Zero clients: "No clients yet" and, for the super admin, an Add client link. One client: same menu.
- **Client:** no switcher. A static block (initials square, client name, "Client dashboard"). Its project comes from the session; opening another UUID is the same `notFound()` (api answers 404 for a foreign project).
- `getProject` is wrapped in React `cache()` (per request only). `ProjectProvider` (client) exposes `{ id, name, city, industry, color, timezone }`; all date formatting reads the zone from it (§2.9).
- Initials: pure `initials(name)` (first letters of the first two words). Text colour on the square comes from `onColor(hex)` (picks ink or white by contrast): white on `#a49f9f` or `#f16767` fails AA, which the mockup does not handle.
- Project colours are tokens only: cycle `#e70101, #1c0f0f, #776f6f, #f16767, #a49f9f` (red, black, blackTint60, redTint60, blackTint40).

### 2.6 Design tokens as CSS variables
`tokens.json` stays the source. `globals.css` is rewritten; a unit test parses it and fails if any `--color-sx-*` value is not in `tokens.json`.
```
@theme {
  --color-sx-red #e70101   --color-sx-black #1c0f0f   --color-sx-red-soft #fde6e6   --color-sx-red-mid #f59999
  --color-sx-muted #5c5656  --color-sx-faint #a49f9f   --color-sx-muted-60 #776f6f
  --color-sx-border #e8e7e7 --color-sx-line #1c0f0f26 (border.strong, rgba .15)
  --color-sx-page #fafafa   --color-sx-shell #f5f5f5   --color-sx-paper #ffffff
  --color-sx-ok #0a7c42  --color-sx-warn #ff691e  --color-sx-bad #b91c1c      (existing names -destructive/-success kept as aliases)
  --radius-card 16px  --radius-btn 12px  --radius-field 10px  --radius-tile 20px (integrations cards)
  --shadow-sx 0 1px 3px rgb(28 15 15 / .08)   --shadow-sx-md 0 4px 12px rgb(28 15 15 / .10)
  --font-sans "Sharp Sans","Segoe UI","Helvetica Neue",Arial,sans-serif
  --font-ar   "GE Flow","Segoe UI","Traditional Arabic",sans-serif
  --text-label 13px  --text-body 14px  --text-section 16px  --text-figure 22px  --text-hero 34px
  --rail-w 72px  --side-w 248px  --top-h 56px
}
:root { color-scheme: light }                     /* no dark theme, no light-dark() */
[lang="ar"] body { font-family: var(--font-ar) }
@utility focus-ring { &:focus-visible { outline: 3px solid var(--color-sx-red); outline-offset: 2px } }
@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation: none !important; transition: none !important } }
```
`fonts.css` (new) holds `@font-face` for Sharp Sans (Light/Regular/Medium/Bold) and GE Flow (Regular/Bold) with `src: local(...), url(/fonts/…woff2)`; the files are added when SHARKX sends them (CSP already allows `font-src 'self'`). Until then the stack falls through to Segoe UI.

**Mockup vs brand skill: every difference**

| # | Item | Mockup | Brand skill | Applied |
|---|---|---|---|---|
| 1 | Page titles and the sub-line | `head()` shows h1 and a sub-line on every page | none | **PRD wins:** no in-page titles; only the action row stays |
| 2 | Weights on the fallback font | h2/h3/KPI 600, body 400 | Bold H1, Medium H2, Light body | Mockup weights while on Segoe UI (it has no 500 or 300 face, so "Medium" would render Regular). Weights are tokens; switch to the brand's when Sharp Sans lands. **Confirm (D8)** |
| 3 | Sizes | 13 labels, 14 content, 16 section, 22 figure, 34 hero KPI | brand scale is in Office points; the only web value is body 16 px | Mockup sizes inside the app (layout density); body 16 px for prose and form inputs where the mockup is silent. **Confirm (D8)** |
| 4 | Chart non-peak bars | `rgba(28,15,15,.22)` (not in any palette) | `chart-theme.json`: red, black, `#a49f9f`, `#f59999`, `#776f6f` | Brand: peak `#e70101`, other bars `#a49f9f` |
| 5 | Auth screens | split screen with red cover and primary lockup | cover/hero only | Mockup (existing centred card is restyled, T7) |
| 6 | Control heights | button 38, field 40, icon button 40 | tap targets: none stated | Mockup. Existing auth controls (48 px) shrink with T7 |
| 7 | Input radius | 10 px | cards 16, buttons 12; `tokens.json` radius.md = 10 | Same: 10 px. Existing `auth/ui.ts` uses 12 for fields |
| 8 | Placeholder colour | n/a | no `#a49f9f` body text on white | `sx-muted` (existing auth uses `sx-faint`) |
| 9 | Project initials colour | white on every tint | accessibility rule: contrast | `onColor()` picks ink on the light tints |
| 10 | Prototype bar | 40 px black bar | none | not product; dropped (`--proto-h` = 0) |
| 11 | Logo in the rail | embedded data URIs | real files in `assets/logos` | collapsed `icon-red-white-x.png`, open `logo-red-on-white-compact.png` (check at screenshot time) |
| 12 | Time zone in agency view | not shown | n/a | spec F13a wants zones labelled: proposal in §4 (needs your OK) |

### 2.7 Base components (`src/components/ui/`, all `'use client'` only where noted)
Common rules: logical utilities only; `focus-ring` on every interactive element; sizes from the mockup; no emoji; icons from `icons.tsx` (the mockup's `IC` path set as React components, `<Icon name flip? size?/>`, `flip` = `rtl:-scale-x-100` for arrows and chevrons).

| Component | Props (signature) | Wraps |
|---|---|---|
| `Button` | `{ variant?: 'primary'\|'secondary'\|'ghost'; size?: 'md'\|'sm'; icon?: IconName; loading?: boolean; asChild?: boolean } & ButtonHTMLAttributes` | none (`Slot` from Radix for `asChild`). One primary red per view (a lint-style test counts `variant="primary"` per page in Playwright) |
| `IconButton` | `{ label: string; icon: IconName; badgeDot?: boolean } & ButtonHTMLAttributes` | none; `label` becomes `aria-label` |
| `Field` | `{ label: string; hint?: string; error?: string; htmlFor?: string; children }` | none; wires `aria-describedby`, `aria-invalid` |
| `Input`, `Textarea` | native props + `size?: 'md'\|'sm'`; `dir="auto"` default for user text | none |
| `Select` | `{ options: {value,label}[]; value; onValueChange; size? }` | **native `<select>`** (as the mockup; reliable on mobile and RTL), not Radix Select |
| `Switch` | `{ checked; onCheckedChange; label: string }` | Radix `Switch` |
| `Tabs`, `TabsList`, `TabsTrigger` | `{ value; onValueChange; variant?: 'underline'\|'ribbon' }` | Radix `Tabs` (list and triggers only; the URL drives content). `ribbon` = Leads state tabs with count and colour key |
| `Chip` | `{ tone: 'new'\|'mql'\|'sql'\|'nq'\|'ok'\|'warn'\|'bad'\|'off'\|'tag'; children }` | none. Lead status and connection health only (mockup rule) |
| `Table`, `Th`, `Td`, `ClickRow` | `Table { 'aria-label': string; children }`, `Th { num?: boolean }`, `ClickRow { href: string; fresh?: boolean; children }` | none. Red header, `scope="col"`, `ClickRow` (client) makes the row activate on click and Enter, first cell holds a real `Link` |
| `Drawer` | `{ open; onOpenChange; title: string; subtitle?: ReactNode; children }` | Radix `Dialog`; slides from `inline-end` (animation mirrored for RTL); width `min(520px,100%)` |
| `Modal` | `{ open; onOpenChange; title: string; description?: string; footer?: ReactNode; wide?: boolean; children }` | Radix `Dialog` |
| `Popover` | `{ trigger: ReactNode; children; align? }` | Radix `Popover` (first user: bell in F14b) |
| `Menu`, `MenuItem`, `MenuLabel`, `MenuSeparator` | `{ trigger; children }` | Radix `DropdownMenu` (arrow-key menu semantics for the switcher and language menu; added because a menu is not a popover) |
| `Toast`, `ToastProvider`, `useToast()` | `toast(message: string)`; `aria-live="polite"`; bottom centre | Radix `Toast` |
| `EmptyState` | `{ title: string; body?: string; action?: ReactNode }` | none. Mockup `.empty`: bold title, one sentence |
| Also | `Card` (`flush?`), `Kpi` and `KpiStrip` (≤6 tiles, first tile 34 px, `hot?` red), `Avatar`, `Dots` (connection dots), `Skeleton`, `PageActions`, `Phone`, `UserText` | none |

`Phone` renders `<bdi dir="ltr" class="tabular-nums">`. `UserText` renders `<bdi dir="auto">` for names, campaigns and answers (Latin names inside Arabic).

### 2.8 i18n setup
- **Catalogs:** `messages/<locale>/<module>.json`. Modules: `common` (shared vocabulary: `status.*`, `source.*`, `role.*`, `health.*`, `ago.*`, `duration.*`), `ui` (generic controls), `shell`, `auth`, `errors` (exists), `projects`, `team`, `leads` (incl. contacts), `reports`. Register each in `MESSAGE_MODULES` when its file exists. A module missing for a locale falls back to English (already implemented).
- **Key convention:** `<module>.<area>.<element>` in camelCase, e.g. `shell.nav.overview`, `leads.tabs.waiting`, `leads.table.col.campaign`, `projects.create.submit`, `errors.NOT_FOUND`. Plurals and selects use ICU (`{n, plural, one {# lead} other {# leads}}`); no string concatenation; placeholders `{name}`. Naming rule SHARKX in headlines, SharkX in body, never lowercase `sharkx` except the URL (existing test enforces it).
- **Provider:** `NextIntlClientProvider messages={pick(messages, CLIENT_MODULES)}` so the browser gets only the modules client components use.
- **Formatting** (`src/lib/i18n/format.ts`, pure, takes `{ locale, timeZone }`): Intl locales `en→en-GB`, `fr→fr-FR`, `ar→ar-AE` with `numberingSystem: 'latn'` (Western digits next to phone numbers and Latin names; confirm at F2c).
  - `date(iso)` "22 Nov 2026", `dateTime(iso)`, `time(iso)` always with the project's `timeZone` (Asia/Dubai or Africa/Casablanca); `dayLabel(iso)` Today / Yesterday / "22 Nov".
  - `ago(iso)` "just now / 5 min ago / 3 h ago / 2 d ago" from ICU messages `common.ago.*` (the mockup's wording).
  - `number(n)`, `percent(ratio)` one decimal (brand), `duration(minutes)` "12 min" / "1 h 5 min", empty → "—".
  - `zoneLabel(tz, locale)` short zone name (GST, GMT+1) for the agency view.
  - `useProjectFormat()` binds these to `useProject().timezone` and the active locale.
- **Phone numbers:** stored E.164. The api returns `phone` (E.164) and `phoneDisplay` (international format, e.g. `+971 50 412 7781`), so the web needs no phone library; displayed through `Phone`.

### 2.9 RTL rules
`<html dir>` from `dirOf(locale)` (exists); `DirectionProvider dir={dir}` for Radix. Logical utilities only (`ms- me- ps- pe- start- end- text-start text-end`); directional icons `flip`; bar charts keep `dir="ltr"` for their plot and use logical axis labels; code boxes, phone, email and URLs `dir="ltr"`; drawer slides from `inline-end`; toasts centred (`start-1/2 -translate-x-1/2 rtl:translate-x-1/2`); numbers `tabular-nums`, aligned to `text-end`; Arabic strings can be ~30 % longer, so no fixed widths on labels. The rail sits at `inline-start` (right in Arabic).

### 2.10 Logical-CSS lint and hard-coded-string lint
- `scripts/lib/logical-css.mjs` exports `findPhysical(line)`; `check-logical-css.mjs` imports it; `src/lib/lint/logical-css.test.ts` imports the same module. Patterns added beyond today's: CSS properties in `.css` (`margin-left`, `padding-right`, `border-left`, `left:`, `right:`, `text-align: left|right`, `float:`, `border-top-left-radius`…), style objects in `.tsx` (`marginLeft`, `paddingRight`, `left:`, `textAlign: 'left'`), and `translate-x-*` without an `rtl:` partner.
- `scripts/check-hardcoded-strings.mjs` parses every `.tsx` with the `typescript` compiler API (already a devDependency) and fails on JSX text containing letters and on string-literal attributes `aria-label, alt, title, placeholder, aria-description, label` unless the line carries `// i18n-ignore` (brand names, code samples). Both scripts run from `pnpm lint`, so `node scripts/verify.mjs` enforces them. Each has a self-test with a planted violation.

### 2.11 Error, loading and not-found states
- **Not found:** one component `NotFoundPanel` (copy from the existing `auth.notFound.*` keys) rendered by `[locale]/not-found.tsx` (full page) and `(app)/not-found.tsx` (inside the shell). The `(app)/[...rest]` catch-all and every `guardRoute` denial land on the in-shell one, so a client cannot tell "forbidden" from "missing". CTA goes to `landingPath`.
- **Error:** `(app)/error.tsx` (client): "Something went wrong on our side" (`errors.INTERNAL`) and a Try again button calling `reset()`; no error text, no digest shown, nothing logged client-side. `[locale]/error.tsx` is the same outside the shell.
- **Loading:** `(app)/loading.tsx` shows a `Skeleton` page (KPI strip and one card). Leads and Clients get their own table skeleton. `motion-reduce` disables the pulse.
- **Empty:** `EmptyState` with the mockup copy where it exists (§4).

### 2.12 Accessibility
3 px red focus ring on every focusable (`focus-ring`); skip link to `#main` (first Tab stop); landmarks `header`, `nav aria-label`, `main#main`; rail opens on focus so keyboard users reach labels; Radix gives focus trap, Esc and focus return for Dialog and Menu; tables use `scope`; clickable rows are real links; status never colour-only (chips carry text); `prefers-reduced-motion` honoured globally; secondary text `sx-muted` ≥ 4.5:1, `sx-faint` only for decoration and disabled; success green never for small text alone; tap targets ≥ 40 px.

### 2.13 Auth restyle touch point
T7 changes `(auth)/layout.tsx` and replaces `components/auth/ui.ts` class strings with `Button`, `Field`, `Input`. These are Alex's F1c files: tell him first, commit on its own, keep every existing auth test green.

### 2.14 Where F2a depends on the api
`GET /projects/options` and `GET /projects/:id` (T6b) are the only api additions in F2a. Until F4a seeds clients, the super admin sees the empty switcher; the stubbed Playwright path (§7) covers the full shell.

### 2.15 How the Alex-independent path works (no code stubs)
Real `getSession`, `defineAction`, `inviteUser` are used everywhere. For tests and for working without Postgres, `web/tests/e2e/support/fake-api.mjs` is a tiny Node HTTP server that answers the same contract (`/me`, `/auth/login`, `/auth/code/verify`, `/projects/options`, `/projects/:id`, `/users…`, later `/leads…`) from fixtures typed with the contract schemas; Playwright's `stubbed` project starts web with `API_URL=http://localhost:4200`. **Swap:** nothing in `src/` changes; the real-path project (`chromium`) already runs against the seeded api, and the stubbed project stays as the fast path.

## 3 · Shared web foundations for all later specs

### 3.1 API client and data functions
- Keep `apiCall(schema, path, init)` as the only HTTP entry. Per module add `src/lib/data/<module>.ts` (server-only reads, one function per page need: `getProjectOptions`, `getProject`, `getProjectsHome`, `getLeads`, `getLead`, `getContacts`, `getContact`, `getOverview`) and `src/lib/actions/<module>.ts` (`'use server'`, `defineAction` exports only). Structure tests (same style as `actions.test.ts`): no `'use client'` file imports `lib/data/*` or `lib/api/*`; every `'use server'` export is a `defineAction`.
- **Tenant rule for every api route:** `projectId` is always in the query or body (even when the path has a resource id), so `can()` runs before any read; the service additionally checks the row's project. A client asking about another project gets 404.
- Response schemas live in `api/src/contracts`; web parses every response with them (already done by `apiCall`).

### 3.2 Server Action wrapper
`defineAction({ input, action?, auth? }, handler)` already validates (Zod), resolves the session, checks `can()` (a function form picks action and projectId from the input; a client with a foreign project gets `NOT_FOUND`), maps `ApiError` to `{ ok:false, error:{code,details,retryAfterSec} }`, rethrows `redirect`/`notFound`, and turns anything else into `INTERNAL` with a name-only log. Additions in F2a:
- `useAction(action)` client hook: `{ run(input), pending, error, ok }`; on `ok` it calls `router.refresh()`; `error.code` is shown with `t('errors.' + code)`; `VALIDATION.details.issues[].path` maps to field errors.
- **Audit is not a web call.** Every mutating Server Action calls an api route declared `audit: 'one'`; the route writes the audit row in the same transaction (CONTRACTS "every mutation: can() check + audit row"). The existing api structure test pins this. A web-side audit call would break atomicity.

### 3.3 Data fetching and the 5 s polling hook
- Pages are Server Components: they read `searchParams` (a promise in Next 16), call `lib/data/*`, and pass plain props. No client data layer, no cache (Cache Components off; every fetch is `no-store`).
- `useAutoRefresh({ intervalMs = 5000, source = 'timer' })` (client, `src/lib/use-auto-refresh.ts`): calls `router.refresh()` inside `startTransition`; paused while `document.hidden`, while a Server Action is pending, and while a modal or the drawer's form is dirty; fires once on window focus. Filters, tab, page size and the open drawer live in the URL, so a refresh keeps them. 30 s on non-live screens.
- When F14a ships `/api/events`, the hook's `source` switches to `'events'`: poll the cursor endpoint and refresh only when a change for the current project and a relevant `kind` arrives. The screens do not change.
- **Decision D2:** this replaces the "SWR every 5 s" line in F4b. It adds no dependency and keeps one data path (server-projected). Cost: a full RSC refresh every 5 s on the Leads screen (about 4 api calls per refresh); acceptable for the expected user count.

### 3.4 Client-safe projection rule (F10a S3)
- One module per entity, `api/src/modules/<m>/projection.ts`, exporting `toStaffX(row)` and `toClientX(row)` and the allowlist `clientXKeys` (also exported from the contracts).
- Responses are `z.discriminatedUnion('view', [staffX, clientX])` with a `view` field; the client shape is `.strict()`. The **service** picks the projection from `session.role`; routes never choose. A new endpoint cannot forget it because its response schema has no shape without `view`.
- Client lead row keys (allowlist): `id, name, phone, phoneDisplay, email, source, campaign, status, reason, createdAt, answers`. Never: `ownerId, ownerName, stageId, stage, notes, events, tasks, isTest`. Test leads are hidden from the client role.
- Contract test (api): for every client-role response fixture, `Object.keys` ⊂ allowlist and the serialised JSON contains none of the forbidden key names. Web never calls a staff endpoint for a client (guard) and passes only what it received.
- Web gating (`can()`, nav) is UX; the api and RLS `client_access` are the walls.

## 4 · Per spec

### Conventions used below
Hours and tasks are in §6. "Stub" = what covers a missing Alex piece. Audit actions marked new are added to `knownAuditActions` in the `contracts:` commit (§5).

### 4.1 F4a · Lead engine and seed (D5–6)
| # | Sub-feature | Tracker |
|---|---|---|
| S1 | `ingestLead`: normalise, dedupe, merge, idempotency | F4.1 |
| S2 | Per-form field mapping model, `saveFormMapping`, `MappingStep` component | F4.2 |
| S3 | Round-robin among active managers | F4.3 |
| S4 | Test-lead flag | F4.7 |
| S5 | Seed from the mockup | F15.5 |
| S6 | `notify()` (first caller is S1; the bell in F14b and tasks in F8b need it) | (CONTRACTS §4) |

**Screens:** none. One reusable component, `components/mapping/mapping-step.tsx` (mockup "Check the fields" step in the connect wizard): `{ questions: { key: string; sample?: string }[]; value: Record<string, MappingTarget>; onChange(next); disabled? }`, `MappingTarget = 'name'|'phone'|'email'|'custom'|'notes'|'ignore'`; a row per form question with a native `Select` and the sample answer. Strings in `leads.json` (`leads.mapping.*`).

**Actions → routes (Zod in `contracts/leads.ts`)**
| Action (web) | api route | Request | Response | can() | Audit |
|---|---|---|---|---|---|
| `saveFormMapping({ projectId, formId, mapping })` | `PUT /lead-forms/:id/mapping` | `{ projectId: uuid, mapping: Record<string, mappingTarget> }` | `{ ok: true }` | `integration.manage` (the wizard step; all roles, own client) | `form.mapping_saved` (new), `audit:'one'` |
| (none, called in-process) `ingestLead(input)` | CONTRACTS §4 exactly | `ingestLeadInput` | `ingestLeadResult` | system (`withSystem(projectId)`) | `lead.created` or `lead.merged` (new, actor system) |

**api implementation:** `modules/leads/{ingest,phone,mapping,assign,service,index}.ts`, `modules/contacts/service.ts`, `modules/notifications/{service,index}.ts`.
- Phone: `libphonenumber-js` (D3); default region from the project city (Dubai/Abu Dhabi → `AE`, Morocco → `MA`); invalid → contact without `phone_e164`, the raw value goes in the creation `lead_events.data` with a `phone_invalid` flag.
- Dedupe: look up contact by `(projectId, phone_e164)` else email; insert with the unique constraint and retry the select on conflict (two simultaneous submissions → one contact). Open lead = latest lead of the contact with `status != 'not_qualified'`: merge adds a `lead_events` row and returns `{ created:false, merged:true }`; otherwise a new lead on the same contact. Same `(projectId, source, externalId)` returns the existing lead (`created:false, merged:false`).
- Round-robin: a per-project cursor `projects.assign_cursor uuid null` (migration `0003`); the ingest transaction locks the project row, takes the next active manager after the cursor (ordered by `created_at, id`), updates the cursor. No active manager → unassigned. Clients are never assignable.
- `is_test` leads: stored with `isTest`, excluded by every aggregate, export and outbox row (later specs) and hidden from the client role.
- One transaction writes the lead, `lead_events`, `audit_log` and `emitChange('lead')`; after commit it calls `notify({ projectId, role:'manager', kind:'new_lead', refId: leadId })` for non-test, newly created leads (client users of the project: `userIds` from `project_members`).
- Tables touched: `contacts, leads, lead_events, lead_forms, projects (cursor), users (read), notifications, change_feed, audit_log`.

**Empty and error states:** not user-facing. `ingestLead` throws `VALIDATION` for a schema error; unknown project → `NOT_FOUND`.

**Stub:** none needed; consumes F1b tables. `recordMessage` (F3b, Alex) is not required.

**Design QA (F4a):** `MappingStep` matches the mockup's mapping step at 1440 px and 360 px; passes `references/qa-checklist.md` (tokens only, focus visible, no emoji icons, no horizontal scroll at 375/768/1024); no physical-direction classes; no hard-coded strings; RTL mirrored; keyboard focus visible.

### 4.2 F2b · Workspace: clients home, create client, team, hours (D7)
| # | Sub-feature | Tracker |
|---|---|---|
| S1 | Clients home | F2.3 |
| S2 | Create client | F2.4 |
| S3 | Team (managers) | F2.5 |
| S4 | Client settings: time zone and business hours | F2.5 |

**S1 Clients home** (`/clients`, `guardRoute('clients')`): KPI strip (New today, Unreplied chats, Overdue follow-ups, Connections to fix; red `hot` when > 0), one flush card with a client search and the table (client with initials square + name + "city, industry"; New today; Unreplied; Overdue; connection dots + "N to fix" chip; chevron). Row click → `/p/<id>/overview`. "Add client" primary button, super admin only. Empty: one sentence "No clients yet. Add your first client to start." + button (manager sees the sentence only). No match: "No client matches / Try another name or city."
- Route: `GET /projects?q=` (`agency.read`) → `projectsHomeResponse = { totals: { newToday, unreplied, overdue, toFix }, rows: projectHomeRow[] }`, `projectHomeRow = { id, name, city, industry, color, timezone, newToday, unreplied, overdue, integrations: { platform: source, status: healthState }[] }`. (**Spec says an array;** wrapped with `totals` so the strip ignores the search.) One aggregate query, tz-aware: newToday = leads created since local midnight in the project's zone; unreplied = conversations whose last message is inbound (contact has a non-test lead); overdue = tasks with `done_at is null and due_at < now()` (non-test leads); test leads excluded; zero, never an error, for a client without data. Dots: fixed order whatsapp, meta, google, tiktok, linkedin, snapchat, website (csv hidden); "to fix" = `needs_attention` or `broken`. Sorted by newToday, then unreplied.
- Tables read: `projects, leads, tasks, wa_conversations, wa_messages, integrations`.

**S2 Create client:** modal "Add a client": name, city (Dubai, Abu Dhabi, Morocco), industry, first client user's email, **first user's full name (proposed; D4)**; footer Cancel (secondary) + "Create client and send invite" (primary).
- Action `createProject({ name, city, industry, firstUser: { email, name } })` → `POST /projects` (`project.create`, super admin) → `{ projectId }`. Service: pre-generate the id; `withSystem(newId)` transaction: project row (timezone from city, default hours Mon–Fri 09:00–18:00, a token colour), default stages New, Contacted, Qualified, Visit booked, Won, Lost, then Alex's `inviteUserTx(tx, session, { kind:'client', projectId, … })`; commit; `deliver()` the invite mail. Any failure leaves nothing behind. Then redirect to `/p/<id>/overview`.
- Rules: name unique case-insensitively (DB index exists) → `CONFLICT`; invited email already has an account → `CONFLICT`; manager → `FORBIDDEN`; bad input → `VALIDATION`.
- Audit: `project.created` (new) **and** `user.invited` (two rows in one request). **Touch point for Alex:** `defineRoute` asserts `audit:'one'` equals exactly one row; ask him to let a route declare an expected count (additive), otherwise this route declares `'none'` and loses the assertion.
- Stub: none (`inviteUserTx` is real).

**S3 Team** (`/team`, `guardRoute('team')`): flush card "Managers" with the `UsersTable` (name with avatar, email, status dot Active/Invited/Disabled, Disable/Enable ghost button) and an "Invite manager" primary button. Modal: full name, email, helper "single-use link (72 hours)". Uses `getUsers({kind:'manager'})`, `inviteUser({kind:'manager', …})`, `setUserStatus`. The self-disable rule is moot (the super admin is not in the manager list; the api also refuses with 409). Disabled managers leave round-robin (F4a filters `status='active'`) and are signed out at once (Alex). Audit: `user.invited`, `user.status_changed` (existing, written by Alex's routes).

**S4 Hours** (`/p/<id>/settings/hours`, `guardRoute('settings')`): Settings link-tabs (shared `settings/layout.tsx`), IANA zone `Select` (Asia/Dubai, Africa/Casablanca), seven rows (day, `Switch`, "Open/Closed", from, to time inputs, disabled when closed), primary Save.
- Action `updateProjectSettings({ projectId, timezone, businessHours })` → `PATCH /projects/:id/settings` (`project.update`; body also carries `projectId`) → `projectDetail`. Rules: zone required and valid IANA; per open day `to > from`; applies to future timers only. Audit `project.updated` (new).
- **Data shape change (D6):** F1b stored `business_hours` as `{ days:number[], start, end }`, which cannot express seven different windows. New shape: `businessHours = { day: 1..7; open: boolean; from: 'HH:MM'; to: 'HH:MM' }[7]` (jsonb; no column change, only the column default in migration `0003` and the TS type in `projects/schema.ts`, which John owns). F12 reads it later.
- Settings tabs ready in Phase 1: Client users (F10a), Business hours. Others (Lead qualification F10b, Conversion feedback F11b, Pipeline stages F8a, Automation F12) appear when ready. `/p/<id>/settings` redirects to the first ready tab.

**Design QA (F2b):** Clients home, Add-client modal, Team and Hours match mockup views `viewClients`, `newClientModal`, `viewAgency`, Settings → hours at 1440 and 360; one primary red button per view (Add client / Invite manager / Save); red table headers; KPI strip ≤ 6; plus the five shared checks (qa-checklist, no physical classes, no hard-coded strings, RTL mirrored, focus visible).

### 4.3 F10a · Client dashboard foundation and client users (D8)
| # | Sub-feature | Tracker |
|---|---|---|
| S1 | Landing, route guards, client sidebar | F10.2 |
| S2 | Client users (invite, list, disable) | F10.1 |
| S3 | Client-safe projections | F10.3 |

**S1:** the shell and `guardRoute` from F2a carry this. F10a completes and proves it: client nav (Overview, Leads, WhatsApp, Reports, Connectors; hidden until each lands), top bar with the fixed client block, every other route (`/clients`, `/team`, `/audit`, `contacts`, `pipeline`, `tasks`, `settings`, unknown) → the same in-shell not-found; a client user of A opening B's URL → the same page. Landing rule `/p/<projectId>/overview` (exists in `landingPath`). Staff behaviour unchanged. Matrix test in §7.

**S2 Client users** (`/p/<id>/settings/client-users`, `guardRoute('settings')`): flush card "Client users" (helper "One client per user, one role. They sign in with a password and an emailed code."), shared `UsersTable`, "Invite client user" primary button (`clientuser.manage`), modal name + email. Uses `getUsers({kind:'client', projectId})`, `inviteUser`, `setUserStatus`. Errors: `CONFLICT` (email already used), `FORBIDDEN`. Cross-client attempts are not found. Audit: existing `user.invited`, `user.status_changed`. Empty: "No client users yet. Invite the first one."

**S3 Projections:** `api/src/modules/leads/projection.ts` and `reports/projection.ts` with allowlists (§3.4), contract tests against the seed, `clientChangeKinds = ['lead','message','health','notification']` exported from the contracts (used by F14a's `/api/events` test). Export columns for the client role are asserted in F4b/F10b.

**Stub:** none (F1c real). Alex's `/api/events` test of the client feed lands with F14a.

**Design QA (F10a):** client shell at 1440 and 360 matches mockup `role=client` (rail with five items, top bar with client block, no switcher); Client users matches Settings → users; qa-checklist; no physical classes; no hard-coded strings; RTL mirrored; focus visible; **a client screenshot contains no staff-only label** (Pipeline, Tasks, Contacts, Owner, Stage, Notes, Team, Audit).

### 4.4 F4b · Leads screen, drawer, contacts (D9–10)
| # | Sub-feature | Tracker |
|---|---|---|
| S1 | Leads screen (tabs, filters, pagination, polling) | F4.4 |
| S2 | Lead drawer and marking (`changeStatus`, assign) | F4.5 |
| S3 | Contacts list and profile | F4.6 |
| S4 | CSV export | F4.4 |

**S1 Leads** (`/p/<id>/leads?tab&q&source&owner&limit`, `guardRoute('leads')`): one flush card: state bar (`sbar`, segments from the counts), ribbon tabs with count and colour key, toolbar (search, source `Select`, owner `Select` with "Unassigned" for staff only), table (Lead = name + phone; Source with platform mark; Campaign; Status chip; Owner (staff); Received `ago`; client: "Mark as" segmented control or "Open to change"), unreviewed rows carry the red edge, "Show 20 more" button (`limit` +20, up to 200). Staff tabs: All, Unreviewed, MQL, SQL, Not qualified; client tabs: **Waiting for review**, All, MQL, SQL, Not qualified (same filter as Unreviewed). Export CSV is the one secondary button in the action row. `useAutoRefresh({ intervalMs: 5000 })`.
- Route: `GET /leads` (`lead.read`, query `projectId, tab, q, source, owner, limit`) → `leadsPage`: `{ view, counts: { all, unreviewed, mql, sql, not_qualified }, total, rows, sources: source[] }`. Counts apply the search, source and owner filters but not the tab, so the tabs add up and "counts per tab stay correct with filters". Search matches name, phone, campaign, email. Order: newest first. Staff rows also carry `ownerId, ownerName`. Phone fields: `phone`, `phoneDisplay`.
- Empty: filtered → "No leads match / Try another tab or clear the search."; project with no leads → "No leads yet. They appear here the moment a form is submitted or a chat starts."

**S2 Drawer** (`?lead=<id>`, deep-linkable; `Drawer` host reads the param, closes with `router.replace` without it): sections from `drawerSections[view]` so later specs append (Stage F8a, Notes F3c, Tasks F8b, Open chat F3c).
- Staff: **Qualification** (`MarkControl`: New (disabled) · MQL · SQL · Not qualified; reason line; the client's MQL/SQL definitions in a `well`), **Contact** (phone, email, source, campaign, WhatsApp state), **Form answers**, **Owner** (`Select` of active managers + Unassigned), **Timeline** (newest first, from `lead_events` with ICU messages `leads.timeline.<kind>`).
- Client: Qualification, Contact (phone, email, source, campaign), Form answers. No owner, stage, notes or timeline.
- Actions (api routes carry `projectId` in the body):
  | Action | api route | Request | Response | can() | Audit |
  |---|---|---|---|---|---|
  | `markLead({ projectId, leadId, to, reason? })` | `POST /leads/:id/status` | `{ projectId, to: 'mql'\|'sql'\|'not_qualified', reason?: string }` | `{ lead: leadRow, outboxQueued: number }` | `lead.mark` (all roles) | `lead.status_changed` (new), actor `client` or `user` |
  | `assignLead({ projectId, leadId, ownerId })` | `POST /leads/:id/assign` | `{ projectId, ownerId: uuid \| null }` | `{ lead: leadRow }` | `lead.assign` | `lead.assigned` (new) |
  - `changeStatus` follows CONTRACTS §4: one transaction writes the status and `status_seq`, a `lead_events` row, the audit row, one `conversion_events` row (state `pending`) per enabled mapping, and `emitChange('lead')`. `to = not_qualified` requires `reason` from `qualification_settings.reasons` (422 otherwise); a mark can be changed later; same status twice is a no-op.
  - `ownerId` must be an active manager (a client user or disabled manager → 422).
  - Toasts: client "Marked {name} as {status}"; staff adds "Sent to the ad platform within 60 seconds." only when `outboxQueued > 0`. A `ReasonModal` asks for the reason (select from the client's list).
- **Stub:** F11a is not built, so `changeStatus` writes the outbox rows and enqueues nothing (F11a adds the sender). F3b chats not built: the WhatsApp state comes from the seeded conversations.

**S3 Contacts** (`/p/<id>/contacts`, staff only): search, flush table (contact = name + phone, Email, Leads count, Latest status, Last activity), row opens `?contact=<id>` drawer: Details, Leads (each opens the lead drawer), Chats (count per number), Internal notes (read-only list; writing arrives in F3c), Status changes.
- Routes: `GET /contacts?projectId&q&limit` (`contact.read`) → `{ rows: { id, name, phone, phoneDisplay, email, leadCount, latestStatus, lastActivityAt }[], total }`; `GET /contacts/:id?projectId` → profile. Client role: 403 from the api; the page 404s first.

**S4 Export:** `GET /api/export/leads?projectId&tab&q&source&owner` (web route handler: `assertSameOrigin`, cookie session) → api `POST /leads/export` (`lead.export`, all roles, `audit:'one'`, audit `lead.exported` new) returns rows (max 10 000, test leads excluded, same filter logic as the list) → web builds RFC 4180 CSV with spreadsheet-injection guarding (cells starting `= + - @` get a leading `'`), `Content-Disposition: attachment; filename="SharkX-Leads-<client>-<YYYY-MM-DD>.csv"`. Columns: Name, Phone, Email, Source, Campaign, Status, Reason, Owner (staff only), Received (ISO). The client role never gets an Owner column. **Touch point:** the F4b file list says Alex adds the `export/[kind]` shell; if it is not in `main` by D8, John writes it and tells him.

**Design QA (F4b):** Leads (staff and client), drawer, Contacts and contact drawer match mockup `viewLeads`, `openLead`, `viewContacts`, `openContact` at 1440 and 360 and in AR; red table header, red edge on unreviewed rows, one segmented mark control, state bar colours from tokens; one primary red button per view (none on the Leads page: Export is secondary); table scrolls inside its card at 360 (no page scroll); qa-checklist; no physical classes; no hard-coded strings; RTL mirrored; focus visible; client screenshot has no Owner column, Stage, Notes, Timeline or Contacts item.

### 4.5 F13a · Overview and agency view (D11)
| # | Sub-feature | Tracker |
|---|---|---|
| S1 | Overview KPIs, charts, waiting list | F13.1 |
| S2 | Agency view (Clients home panel) | F13.4 |

**S1 Overview** (`/p/<id>/overview`, `guardRoute('overview')`). KPI strip: Leads (30 d), New today, Median first reply, MQL rate, SQL rate, plus **Waiting for review** for the client role (6 tiles max; first tile 34 px). Staff layout: one card "Leads per day" (30 bars, peak labelled in red) + a quiet aside "Leads by source" (top 5 ranked bars). Client layout: a flush "Waiting for review" card first (5 rows with inline mark control and "Review leads" button), then the two quiet panels below a hairline.
- Route `GET /reports/overview?projectId` (`report.read`) → `overviewResponse = { view, kpis: { leads30, newToday, medianFirstReplyMin: number|null, mqlRate: number|null, sqlRate: number|null, waiting?: number }, perDay: { date, count }[30], bySource: { source, count }[], waiting?: clientLeadRow[] }`. Definitions: MQL rate = (MQL+SQL)/leads; SQL rate = SQL/leads; first reply = first customer inbound message → first outbound message, leads without chats excluded, none → "—"; buckets and "new today" in the project's zone; `is_test` excluded. `modules/reports/service.ts` + `projection.ts`; read-only SQL aggregates. `leads.first_reply_at` is set by F3b when the first outbound message is recorded (the seed sets it for ~70 % of leads).
- Charts are hand-rolled like the mockup (`components/charts/bar-chart.tsx`, `ranked-bars.tsx`): CSS bars (the mockup's `.cbars`), `role="img"` with an `aria-label` and a visually hidden data table, ≤ 5 series, `chart-theme.json` colours, peak red, non-peak `#a49f9f`, one baseline, direct labels, tabular numbers, plot `dir="ltr"`. **Spec wording says "SVG";** the mockup uses CSS bars, which scale and mirror better, and the mockup wins layout.
- Empty: no leads → KPIs 0 and "—", panels show "Nothing here yet"; waiting list empty → "All caught up / Nothing is waiting."
- Stub: none; until F3b real chats, first-reply comes from seeded `first_reply_at`.

**S2 Agency view:** the Clients home strip and table from F2b S1 are the agency view; F13a moves the aggregate into `modules/reports/agency.ts` (shared by `GET /projects`), hardens the definitions with the seed numbers, and adds zone labels. **Proposal (mockup lacks it, needs your OK):** append the zone abbreviation to the client sub-line, "Dubai, Aesthetic clinic · GST". Staff only; a client gets the in-shell not-found.

**Design QA (F13a):** Overview staff and client match `viewOverview` at 1440 and 360 and in AR (charts keep LTR plot, labels mirror); KPI tiles ≤ 6; chart series ≤ 5 from `chart-theme.json`; trust items visible (period "Last 30 days", client time zone); no deltas, no funnel, no Won, no cost per SQL; qa-checklist; no physical classes; no hard-coded strings; focus visible.

### 4.6 Mockup mapping
Mockup link = `file:///E:/SHARKS/docs/inputs/sharkx-crm-mockup.html` + hash.

| Screen | Mockup view / modal | Link hash | Components | Deviation and reason |
|---|---|---|---|---|
| Rail, top bar, footer | `renderSide`, `renderTop`, `footer` | `#role=super&v=clients` | `Rail`, `NavLink`, `Topbar`, `ProjectSwitcher`, `LanguageMenu`, `MeBlock`, `AppFooter` | No bell (F14b), no search field (not rendered in the mockup either), no prototype bar |
| Project switcher menu | `ctxmenu` | `#role=super&v=overview&p=lum&pop=ctx` | `Menu`, `Avatar` | none |
| Language menu | `langmenu` | `#role=super&v=clients&lang=ar` | `Menu` | none |
| Sign in, code, invite, reset | `viewLogin`, `viewCode`, `viewInvite`, `viewReset` | `#screen=login` (also `code`, `invite`, `reset`) | `AuthLayout`, `Field`, `Input`, `Button`, `CodeInput`, `PasswordRules` | Built centred in F1c; restyled to the split screen (T7). The mockup's "Prototype: pick an account" box is not product |
| Not found, error | none in the mockup | n/a | `NotFoundPanel`, `StatusPanel`, `EmptyState` | **New screens (mockup lacks them):** proposed in mockup style (centred panel, bold title, one sentence, one primary button). Needs your OK |
| Clients home | `viewClients` | `#role=super&v=clients` | `KpiStrip`, `Card`, `Table`, `ClickRow`, `Dots`, `Chip`, `EmptyState` | No page title; totals ignore the search |
| Add a client | `newClientModal` | `#role=super&v=clients&modal=newClient` | `Modal`, `Field`, `Input`, `Select`, `Button` | + first user's name field (D4) |
| Team | `viewAgency` | `#role=super&v=agency` | `Card`, `UsersTable`, `Modal`, `Button` | Page title dropped; label "Team" |
| Client users | Settings → users (`userRows`) | `#role=super&p=lum&v=settings&tab=users` | same as Team + settings link tabs | Tabs ready only as features land |
| Business hours | Settings → hours | `#role=super&p=lum&v=settings&tab=hours` | `Tabs`, `Card`, `Select`, `Switch`, `Input type=time`, `Button` | none |
| Overview (staff) | `viewOverview` | `#role=manager&p=lum&v=overview` | `KpiStrip`, `Card`, `BarChart`, `RankedBars` | No title or "Peak … on …" sub-line kept as chart caption; non-peak bars `#a49f9f` (§2.6 #4) |
| Overview (client) | `viewOverview` client branch | `#role=client&cp=lum&v=overview` | + waiting `Table`, `MarkInline` | Marking arrives with F4b components |
| Leads (staff, client) | `viewLeads` | `#role=manager&p=lum&v=leads` / `#role=client&cp=lum&v=leads` | `Card`, state bar, `Tabs variant=ribbon`, `Select`, `Table`, `Chip`, `MarkControl`, `SourceBadge` | Won/Junk, "New today" tab, WhatsApp column, bulk bar hidden per PRD. `limit` paging instead of a JS counter |
| Lead drawer | `openLead` | `#role=manager&p=lum&v=leads` (open a row) | `Drawer`, `MarkControl`, `ReasonModal`, `Select` | Stage, notes, new task, open chat arrive with F8a, F3c, F8b |
| Contacts, contact drawer | `viewContacts`, `openContact` | `#role=manager&p=lum&v=contacts` | `Table`, `Drawer` | none |
| Mapping step | connect wizard step in `viewConnections` | `#role=super&p=lum&v=connections` | `MappingStep` | Reused by F14b; component only in F4a |

## 5 · Contract additions and seed plan

### 5.1 Contract additions (additive; one `contracts:` commit; tell Alex first, then `node scripts/sync-contracts.mjs`)
- `session.ts`: `actionRoles['agency.read'] = STAFF` (Clients home and agency totals; no existing action means "staff only"). Update the CONTRACTS §1 matrix.
- New files, exported from `index.ts`: `projects.ts` (`projectOption`, `projectOptionsResponse`, `projectDetail`, `businessHoursDay`, `projectHomeRow`, `projectsHomeResponse`, `createProjectRequest/Response`, `updateProjectSettingsRequest`, `projectCity`), `leads.ts` (`leadTab`, `leadsQuery`, `staffLeadRow`, `clientLeadRow` strict, `clientLeadKeys`, `leadsPage`, `leadDetail`, `markLeadRequest`, `assignLeadRequest`, `mappingTarget`, `saveFormMappingRequest`, `leadExportRequest/Rows`), `contacts.ts` (`contactRow`, `contactsPage`, `contactProfile`), `reports.ts` (`overviewResponse`).
- `common.ts`: `clientChangeKinds`.
- `audit.ts` `knownAuditActions` += `project.created, project.updated, lead.created, lead.merged, lead.status_changed, lead.assigned, lead.exported, form.mapping_saved`.
- Not a contract change but tell Alex: `lib/http/route.ts` expected audit count (createProject writes two rows); `verifyCode` redirect uses `me.locale`; `(auth)` restyle (T7); export route shell.
- John-owned schema changes (his files, tell Alex because F1b authored them): migration `0003` (`projects.assign_cursor`, new default for `business_hours`); `projects/schema.ts` type `BusinessHours`. Run `db:generate` only after `git pull --rebase`, push the migration the same day.

### 5.2 Seed plan (`pnpm db:seed`, `api/src/db/seed.ts`; dev and staging only)
- Refuses unless `APP_ENV` is `local` or `staging`; aborts if projects already exist unless `--reset`; deterministic (mockup's seed 7 port) and takes a `now` parameter so tests freeze it. Uses `hashPassword` from the auth module; the shared dev password comes from `SEED_PASSWORD` (never committed). Mail goes to `api/.mail` locally.
- **People:** the existing super admin (`seed-super-admin`), two managers (Aisha Rahman, Rami Haddad), one active client user per client: Dr. Lina Haddad (Lumière), Dr. Hessa Al Neyadi (Pearl), Dr. Salma Benjelloun (Nova), Khaled Mansour (Falcon), Dana Whitfield (Oasis).
- **Clients (5):** Lumière Aesthetics (Dubai, Aesthetic clinic, `#e70101`), Pearl Derma Clinic (Abu Dhabi, `#1c0f0f`), Nova Skin Casablanca (Morocco, Africa/Casablanca, `#776f6f`), Falcon Properties (Dubai, Real estate SME, `#f16767`), Oasis Fit Studio (Abu Dhabi, Fitness SME, `#a49f9f`). Each: default six stages, qualification settings (definitions, six reasons), integrations rows mirroring the mockup's connection mix (some `needs_attention`/`broken`/`not_connected`), WhatsApp numbers from the mockup (sync 100).
- **Leads (~64):** campaigns and form questions per client from the mockup; source mix meta/google/youtube/tiktok/snapchat/website/whatsapp; status mix new/mql/sql/not_qualified with reasons; owners round-robin over the two managers; created over the last 30 days with several today; two `is_test` leads; `first_reply_at` for ~70 %; chats (`wa_conversations`, `wa_messages`) so some conversations end inbound (unreplied); a handful of tasks, some overdue.
- `tests/fixtures/seed/expected.json` holds hand-checked per-client numbers for the frozen `now` (new today, unreplied, overdue, leads 30 d, MQL/SQL rates, median reply). Tests F2b S1 and F13a compare to it.

## 6 · Build order

Day 1 = Fri 20 Nov: D3 = Sun 22, D4 = Mon 23, D5 = Tue 24, D6 = Wed 25, D7 = Thu 26, D8 = Fri 27, D9 = Sat 28, D10 = Sun 29, D11 = Mon 30 Nov, D12 = Tue 1 Dec. Hours are for John with Claude Code writing most of the code. Every task ends with `node scripts/verify.mjs` green; commit prefix as shown; one command per tracker update (spec start, milestones, done).

| Task | What | h | Depends | Commit | Checkpoint test |
|---|---|---|---|---|---|
| T0 | Contract additions §5.1 (own commit); sync; tell Alex | 1 | none | `contracts: projects, leads, contacts, reports shapes, agency.read` | both apps typecheck; sync check passes |
| T1 | Tokens, light-only canvas, fonts.css, logos copied | 1.5 | none | `F2a: brand tokens, light-only canvas and Segoe UI stack` | tokens test: every `sx-*` value is in `tokens.json`; `pnpm build` |
| T2 | Logical-CSS lib and tests; hard-coded-string check | 2 | none | `F2a: logical-css and hard-coded string checks` | planted `ml-2` and planted JSX text fail; clean tree passes |
| T3 | `navigation.ts`, `format.ts`, `use-project-format.ts`, catalogs (`common`, `ui`, `shell`), provider picks modules | 3 | T1 | `F2a: i18n navigation, formatters and catalogs` | format tests en/ar/fr, Dubai vs Casablanca, `—` for empty; naming test |
| T4 | Icons and base components (Button, IconButton, Field, Input, Textarea, Select, Switch, Chip, Card, Kpi, EmptyState, Avatar, Table, Skeleton, Phone, UserText) | 3 | T1, D1 | `F2a: base components (controls, table, chip, empty state)` | component tests: variants, disabled, aria wiring, `bdi` |
| T5 | Overlays and tabs (Modal, Drawer, Menu, Popover, Tabs, Toast) + `DirectionProvider` | 3 | T4 | `F2a: overlays, tabs and toasts` | Esc closes, focus returns, drawer on `inline-end` in AR |
| T6a | Nav config, `guard.ts`, Rail, Topbar, switcher, language menu, `(app)` layout, `p/[projectId]` layout, overview placeholder, catch-all, error/loading/not-found | 3.5 | T3, T5, T6b | `F2a: app shell, role-gated nav and project context` | nav matrix and `canViewRoute` tests; "every page calls guardRoute" structure test |
| T6b | api `projects` module: `GET /projects/options`, `GET /projects/:id` (+ tests) | 1.5 | T0 | `F2a: projects options and detail routes` | super admin and manager see all, client sees only its own, foreign id → 404 |
| T7 | Restyle `(auth)` to the mockup split screen on the new components | 2 | T4 | `F2a: sign-in screens restyled to the mockup` | existing auth tests green; screenshots 1440/360 EN/AR |
| T8 | Playwright: fix smoke test; `stubbed` project with fake api; sign-in → client dashboard | 2.5 | T6a | `F2a: stubbed Playwright path from sign-in to client dashboard` | passes; screenshots saved |
| T10 | Migration `0003`; `libphonenumber-js` (D3); phone normalisation | 1.5 | D3, T0 | `F4a: phone normalisation and project assign cursor` | UAE and Morocco cases; invalid kept raw |
| T11 | `ingestLead` (dedupe, merge, idempotency, events, audit, change feed) | 4 | T10 | `F4a: ingestLead` | dedupe matrix (phone/email × open/closed × source); concurrent same phone → one contact |
| T12 | Round-robin, test flag, `notify()` | 2.5 | T11 | `F4a: round-robin, test leads and notify` | fairness over N leads; no managers → unassigned; test excluded |
| T13 | Mapping model, `saveFormMapping` route and action, `MappingStep` | 3 | T4 | `F4a: form field mapping` | route guard; component test |
| T14 | Seed and `expected.json` | 3.5 | T11, T12 | `F4a: seed from the mockup` | seed on empty DB; counts equal `expected.json`; refuses in production |
| T15 | api projects: home aggregates, create (with `inviteUserTx`), settings, `agency.read` | 3 | T14 | `F2b: projects api` | aggregates equal seed numbers; atomic create and rollback; default stages; audit rows |
| T16 | Clients home UI | 2 | T15 | `F2b: clients home` | search; empty; zero client shows zeros |
| T17 | Add-client modal and action | 1.5 | T15 | `F2b: create client` | invite email in `.mail`; manager cannot see or call |
| T18 | Team page, `UsersTable`, `team` catalog | 1 | T5 | `F2b: team` | invite and disable audited |
| T19 | Settings layout (link tabs) and Hours page | 1.5 | T15 | `F2b: settings tabs and business hours` | validation; persistence; permission |
| T20 | Client nav completion and guard matrix tests | 1.5 | T19 | `F10a: client landing and route guards` | matrix: 3 roles × all routes |
| T21 | Client users page | 2 | T18 | `F10a: client users` | invite → accept → disable → enable against real F1c |
| T22 | Projections, allowlists, contract tests, `clientChangeKinds` | 3 | T14 | `F10a: client-safe projections` | allowlist test fails if a field is added |
| T23 | Real-path Playwright: sign-in → client dashboard on the seeded api | 1 | T21, T22 | `F10a: client sign-in e2e on seed` | passes |
| T24 | api leads list, counts, detail, projections | 4 | T22 | `F4b: leads api` | tab counts on seed with filters; client JSON has no forbidden keys |
| T25 | `changeStatus`, `markLead`, `assignLead` | 3 | T24 | `F4b: mark and assign` | outbox rows per mapping; reason required; actor kind; audit |
| T26 | Leads page, `useAutoRefresh`, `SourceBadge` | 4 | T24 | `F4b: leads screen` | URL state; refresh keeps filters; screenshots |
| T27 | Drawer, `MarkControl`, `ReasonModal`, timeline | 3 | T25, T26 | `F4b: lead drawer` | timeline order; client drawer has no owner/timeline |
| T28 | Contacts api and UI | 2.5 | T24 | `F4b: contacts` | profile lists all leads; client → 404 |
| T29 | Export (api route + BFF handler) | 1.5 | T24 | `F4b: leads export` | rows equal the filtered list minus tests; client has no Owner column |
| T30 | `reports` overview service, agency totals module, projection | 3 | T22 | `F13a: overview and agency aggregates` | KPIs equal `expected.json` |
| T31 | Overview UI, charts, waiting list | 3.5 | T27, T30 | `F13a: overview` | screenshots; client sees waiting list, staff does not |
| T32 | Zone labels, permission tests | 1 | T31 | `F13a: agency zone labels` | client → not found; staff sees zones |

**Day plan and slips**
| Day | Work | Cumulative h |
|---|---|---|
| D3 Sun 22 | T0, T1, T2, T3 | 7.5 |
| D4 Mon 23 | T4, T5, start T6 | 15 |
| D5 Tue 24 | finish T6a/T6b, T7, T8 (spec says F2a ends D4: **about 1 day late**), T10 | 23 |
| D6 Wed 25 | T11, T12 | 29.5 |
| D7 Thu 26 | T13, T14 (F4a ends D7, spec D6: **about 1 day late**) | 36 |
| D8 Fri 27 | T15, T16, T17 | 42.5 |
| D9 Sat 28 | T18, T19, T20, T21 (F2b ends D8, F10a D9: **1 day late**) | 49 |
| D10 Sun 29 | T22, T23, T24 | 57 |
| D11 Mon 30 | T25, T26 | 64 |
| D12 Tue 1 Dec | T27, T28, T29 | 70 |
| D13 Wed 2 Dec | T30, T31, T32 (F4b ends D12 vs D10, F13a D13 vs D11) | 79.5 |

- **Total 79.5 h against about 72 h nominal (9 days × 8 h): roughly one day over.** The R1 demo script (create client → invite → accept → sign in → client dashboard → manager invited → reset → audit) needs only F2a, F2b and F10a, which end D9 with this plan, **one day before the D10 demo**. F4b and F13a are not in the demo script and absorb the slip.
- **What to cut or move if D10 is at risk:** T7 (auth restyle, 2 h) and T8 (stubbed Playwright, 2.5 h) can move after T23; T29 export can move to D13; Popover (F2a) is a thin wrapper and can wait for F14b.
- **Alex-dependent dates:** `ingestLead` real by D6 for Alex's adapters (WhatsApp D9, Google D13, Meta D15): this plan has it at D6 (T11) so that holds. F3c (D12–13) needs F4b's drawer sections extension point (T27, D12): tell Alex.

## 7 · Test plan

**Pure and unit (node Vitest, no new dependency):** `canViewRoute` and nav matrix; tokens vs `tokens.json`; `format.ts` (en/ar/fr, zones, empty); `initials`/`onColor`; logical-CSS and hard-coded-string lints with planted violations; catalogs (en file per module, naming rule, `errors.<CODE>` for all codes); structure tests: every `'use server'` export is `defineAction` (exists), every `(app)` page calls `guardRoute`, no client file imports `lib/data|api`, every `ready:true` nav item has a page.

**Component tests (jsdom; decision D1):** Button/Field/Select/Switch/Chip/Table/EmptyState (variants, aria, disabled); Menu/Modal/Drawer/Toast (Esc, focus trap, focus return); `MarkControl`, `MappingStep`, `UsersTable`. Files `*.test.tsx` with `// @vitest-environment jsdom`.

**Route-guard matrix per role** (pure test plus Playwright):
| Route | Super admin | Manager | Client (own project) | No cookie | `pending_2fa` |
|---|---|---|---|---|---|
| `/clients` | page | page | not found | /login | /code |
| `/team` | page | not found | not found | /login | /code |
| `/audit` (F1e) | page | not found | not found | /login | /code |
| `/p/A/overview`, `/leads`, `/reports`, `/inbox`, `/integrations` | page | page | page (own A only) | /login | /code |
| `/p/B/…` | page | page | not found | /login | /code |
| `/p/A/contacts`, `/pipeline`, `/tasks`, `/settings/*` | page | page | not found | /login | /code |
| any unknown URL | not found (in shell) | same | same | /login | /code |

**Isolation checks for the client role (api, Vitest with the Docker Postgres):** `GET /leads?projectId=B` as client of A → 404; `GET /leads?projectId=A` response keys ⊂ `clientLeadKeys` and JSON contains none of `ownerId, ownerName, stageId, stage, notes, events, tasks, isTest`; test leads absent; `GET /contacts`, `GET /projects` (agency), `/leads/:id/assign`, `PATCH /projects/:id/settings` → 403; `/projects/options` returns only its own; export has no Owner column; marking another client's lead → 404; RLS wall: `withTenant` client reading another project's `leads`, `contacts`, `qualification_settings` returns zero rows; client overview carries no per-manager data.

**Seed numbers:** F2b S1 and F13a compare to `expected.json`; ingest dedupe matrix; round-robin fairness; seed on an empty DB; refusal in production.

**RTL and 360 px (Playwright, EN and AR, 1440×900 and 360×800):** every shipped route: `document.documentElement.scrollWidth <= innerWidth` (no horizontal page scroll); `dir` attribute; in AR the rail is at the inline-start (right edge); the drawer opens from the left in AR; computed focus outline is 3 px red; screenshots saved as `tests/e2e/screens/<spec>-<screen>-<width>-<lang>.png` (git-ignored) for the Design QA review against the mockup deep links in §4.6.

**Playwright path, stubbed:** project `stubbed` (fake api on 4200, web on 3200): open `/` → sign in as the client fixture (`/auth/login` → pending → `/code` → active) → lands on `/en/p/<id>/overview` → rail shows five items → `/en/clients` and `/en/p/<other>/overview` show the not-found page → switch to AR → page is RTL → sign out. Real-path project (T23) repeats sign-in on the seeded api for super admin, manager and client.

**CI gate:** `pnpm lint` runs Biome, the logical-CSS check and the hard-coded-string check; `node scripts/verify.mjs` runs typecheck + lint + test in the changed app plus the contracts sync check (GitHub CI is paused; this script is the gate).

## 8 · Risks and open decisions (only the blocking ones)

| # | Decision or risk | Recommendation | Needed by |
|---|---|---|---|
| D1 | **Component tests need `jsdom`, `@testing-library/react`, `@testing-library/user-event` (devDependencies).** Today Vitest is node-only. | Approve. Without them only `renderToString` checks are possible and no keyboard or focus tests. | D3 (T4) |
| D2 | **SWR is in the architecture's library list but this plan does not add it.** Polling uses `router.refresh()`. | Do not add SWR. Revisit only if a client-only widget needs it (F14b bell can use `fetch` + `setInterval`). | D9 (T26) |
| D3 | **`libphonenumber-js` in the api only** (in ARCHITECTURE §1; not installed). Web shows server-formatted `phoneDisplay`. | Approve, api only. | D5 (T10) |
| D4 | **Create-client modal has no field for the first user's name, but `inviteRequest` requires one.** Mockup and spec are silent. | Add "First user's full name" to the modal in the same style. Alternative: derive it from the email (worse). | D7 (T17) |
| D5 | **`(auth)` restyle to the mockup split screen touches Alex's F1c files.** | Do it (T7, own commit), Alex agrees first. It is the mockup's design and the brand's cover rule. | D5 |
| D6 | **`business_hours` per-day shape and migration `0003`** (`assign_cursor`, new default) change F1b-authored data in John's table. | Approve; Alex is told before the push; migration generated after `git pull --rebase`, pushed the same day. | D5 (T10) |
| D7 | **Contract additions in §5.1, including the new action `agency.read`.** | Approve one `contracts:` commit; Alex reviews before the push. | D3 (T0) |
| D8 | **Type values: mockup weights and sizes vs the brand skill** (§2.6 #2 and #3). | Keep the mockup's weights and sizes while on Segoe UI; weights are tokens and switch to the brand's when Sharp Sans arrives. | before T1 |
| D9 | **Alex touch points:** expected-audit-count on `defineRoute` (createProject writes two rows), `verifyCode` uses `me.locale`, export route shell by D8, the `(auth)` restyle. | Message Alex once on D3 with the list. | D3 |
| D10 | **Time-zone label in the agency view and the not-found/error screens are not in the mockup** (§4.5 and §4.6). | Approve the proposals (zone abbreviation in the client sub-line; centred panel in mockup style). | D8 / D11 |
| R1 | **Slip of about one day** (§6). | Protects the D10 demo as long as T7 and T8 move after T23 if needed. | ongoing |
| R2 | `notify()` and the `new_lead` notification are not in the F4a spec text but F14b (D14) and F8b (D15) need them and CONTRACTS makes John the owner. | Keep S6 in F4a (2 h in T12). If dropped, F14b must stub. | D6 |
| R3 | iPad landscape (≥ 900 px, no hover) cannot open a hover rail. | Covered by the `touch` variant and the topbar menu button; verify on a tablet at F2c. | F2c |
