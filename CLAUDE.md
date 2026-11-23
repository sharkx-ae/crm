# SHARKX Agency CRM

Multi-client CRM for ad agency SHARKX: capture leads → follow up → client signs in and marks MQL/SQL/Not qualified → results sent to Meta/Google. Contract: SOW 2026-10-16. 21-day build, 2 devs (Alex = A "Pipes", John = B "Product"); Claude Code writes most of the code.

## Read on demand (don't load all)

- `docs/PRD.md`: features F1–F15 with acceptance criteria, Extras, Cut. Read only the F-section you build.
- `docs/ARCHITECTURE.md`: stack, folders, data model/RLS, contracts, auth, integrations, SOW deviations.
- `docs/specs/STATUS.md`: F-ids and sub-features. `docs/CONTACT-SHARKX.md`: client-facing note.
- Specs: `docs/specs/<id>-*.md` (one per spec), `docs/specs/CONTRACTS.md` (frozen shared shapes), `docs/specs/ORDER.md` (build order, days).
- Timeline: docs/plan.html (data in docs/plan-data.js)
- `docs/inputs/` (local only, git-ignored; get it from Vansh): SOW, mockup (UI truth), requirements. Open only to settle a conflict.
- **Brand skill (read before any UI work):** `skills/sharkx-brand-guidelines/SKILL.md`. Colors, type, radius, tables, KPI strip, charts, logo and QA checklist come from it and `assets/tokens.json`. The mockup (`docs/inputs/sharkx-crm-mockup.html`) is built to it.

## Stack (details: ARCHITECTURE §1)

Two independent projects, each with its own `package.json`, lockfile and `node_modules`: `web/` (frontend: Next.js 16.4 BFF, Cache Components OFF) and `api/` (backend: Fastify 5 + pg-boss worker). `docs/` holds all docs, specs and inputs. Node 26.13.1 · TypeScript 6 strict · Tailwind + Radix · Drizzle + Postgres 18 (RLS) · next-intl · Resend · Biome · Vitest · Playwright. Railway: web, api, worker, Postgres (Europe West).

## Commands (no root package.json: run pnpm inside the app; Node 26.13.1 from .nvmrc)

- Local DB: `cd api && docker compose up -d` (Postgres :5433 + `sharkx_test`)
- **api** (`cd api`): `pnpm dev` (:4000) · `pnpm dev:worker` · `pnpm start` · `pnpm start:worker` · `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:studio` (`db:seed` arrives in F4a)
- **web** (`cd web`): `pnpm dev` (:3000) · `pnpm build` · `pnpm start` · e2e: `pnpm build && pnpm test:e2e` (starts api + web)
- In either app: `pnpm test` (Vitest; api needs the Docker Postgres) · `pnpm typecheck` · `pnpm lint` (Biome; web adds the logical-CSS check) · `pnpm format` · `pnpm check`
- Gate before every push (repo root): `node scripts/verify.mjs` (`--all` = both apps). It runs `pnpm verify` (typecheck + lint + test) in the apps you changed and the contracts sync check; CI repeats it on every push to `master`.

## Layers and ownership

- web (pages, Server Actions, BFF route handlers; no DB) → HTTP via `web/src/lib/api` → api routes → `api/src/modules/<domain>/service.ts` → `api/src/db`. Worker calls the same services. Browser never calls the api.
- Spec paths map: `src/app/api/**` → `api/src/routes`; other `src/app/**`, `src/components/**`, `messages/**` → `web/`; other `src/**` → `api/src/`; `src/contracts` → `api/src/contracts` (web gets a generated copy).
- Imports: relative with explicit `.ts`/`.tsx` extension (api/worker run on Node's native TypeScript); `@/` alias only inside `web`. Erasable syntax only (no enums/namespaces).
- **Ownership is by feature, full stack.** The dev who owns a spec builds it top to bottom: web screens, Server Actions, api routes, service, schema, tests. Who owns what and in which order: `docs/specs/ORDER.md`. Specs are written per sub-feature (`docs/specs/_TEMPLATE.md`); build one sub-feature at a time and tick its acceptance criteria.
- One owner per module. Use another dev's module only through its `index.ts`; change it only after telling them, in its own commit.
- **Alex:** `api/src/{db,worker}`, `lib/*`, CI, Railway config, and the features Access (auth), audit/queue/email, WhatsApp, hub and wizard, Meta Lead Ads, conversion feedback, health and alerts, security suite.
- **John:** the app shell and i18n, and the features workspace (clients, team, client users, settings), client dashboard, lead engine, leads/contacts/overview/reports, website/CSV, Google, pipeline/tasks, client marking, automation, audit viewer, TikTok/LinkedIn/Snapchat, Playwright.
- **Shared:** `api/src/contracts` (Zod; owner proposes and tells the other dev before pushing). Never edit `web/src/contracts` (generated): after any change run `node scripts/sync-contracts.mjs`. Also the `api/src/db/schema/index.ts` barrel (append-only).
- Single migration lane: schema lives in `modules/<x>/schema.ts`, migrations only in `api/src/db/migrations`; run `db:generate` only after `git pull --rebase`; push migration commits the same day they are generated; never edit a pushed migration.
- Git: **`master` is the working branch, `main` is the release branch** (production deploys from it). Nobody commits or pushes to `main` directly. Work on `master`: small commits pushed to `origin/master`, message prefix `<spec-id>: ...` (e.g. `F1a: add session contract`). Before every push: `git pull --rebase`, then `node scripts/verify.mjs` (runs verify in the apps you changed + contracts sync); push only when it passes. Contract changes go in their own `contracts:` commit and you tell the other dev. `master` must always be green: if CI goes red, fix it first. **Release:** when `master` is green and verified on staging, open a pull request `master` → `main` and merge it (fast-forward); production is then deployed from `main`. No other PRs.

## Conventions

- Errors: throw `AppError(code, status)` in services; one wrapper per Server Action/route maps it to a translated message or HTTP status. Unexpected: generic message + `error_log` + rate-limited alert email.
- Zod at every boundary (actions, routes, webhooks, env). Read env only via each app's `src/lib/env.ts`.
- Tenant data only via `withTenant()` (web) or `withSystem(projectId)` (worker, webhooks). Every mutation: `can()` check + audit row.
- Roles: `super_admin`, `manager`, `client` only (CONTRACTS §1; they don't nest). Client-role responses use client-safe projections; every new tenant table declares its `client_access` (ARCHITECTURE §4).
- Webhooks: verify signature → insert raw event (unique key) → return 200 → process via queue.
- UI follows `skills/sharkx-brand-guidelines` (SKILL.md golden rules): SHARKX Red `#e70101` and Black `#1c0f0f` only, light canvases (`#fff` / `#fafafa` / `#f5f5f5`), cards radius 16 and buttons 12, one primary red button per view, red table headers, max 6 KPI tiles, charts ≤5 series from `chart-theme.json`, SVG icons (no emoji), no gradients, no dark theme, 3px red focus ring, naming SHARKX (headlines) / SharkX (body). Use the real logo files from `assets/logos`. Don't invent palette colors; take tokens from `tokens.json`.
- UI: Tailwind logical properties only (`ms-`, `ps-`, `start-`, `text-start`). Strings live in `messages/<locale>/<module>.json`; English first, AR/FR batch at the D18 freeze.
- Names: DB snake_case plural tables; TS camelCase; components PascalCase; files kebab-case; UUID ids; UTC `timestamptz`; IANA time zones.
- Biome is the only linter/formatter. Tests beside code (`*.test.ts`); fixtures in `tests/fixtures`.
- Logs: JSON to stdout with request id; never PII.
- Done per push: `node scripts/verify.mjs` passes · `can()` + audit · strings in catalog · RTL checked · no new dependency.

## Never

- No features beyond the spec. Anything not in the PRD is an Extra: ask first, and only after F1–F15 are done.
- No new dependencies without asking.
- No tenant query outside the helpers; no BYPASSRLS; no caching of tenant data (`use cache`, fetch cache, `unstable_cache`).
- No sending WhatsApp messages, ad spend, campaign management, calling or white-label (SOW out of scope).
- No PII, tokens or message bodies in logs, alerts or error text. Tokens only AES-256-GCM encrypted. No secrets in git.
- No skipping webhook signature checks; no processing before the raw event is stored.
- No physical-direction Tailwind (`ml-`, `pl-`, `left-`, `text-left`); no hard-coded UI strings.
- No edits in the other dev's modules, or in `contracts/`, without telling them first.
- No `db:migrate` against production from a laptop; no hand-editing merged migrations.
- No push to `master` before `node scripts/verify.mjs` passes; no direct commit or push to `main` (it only changes through the `master` → `main` release PR); no force-push on either branch. GitHub CI is paused (billing), so that script is the only gate.

## Tracker (tracker/)

- Never edit tracker/index.html or tracker-data.js by hand. Use: node scripts/track.js <ID> --status <s> --pct <n> --note "<max 10 words>"
- Update only: (1) when starting a spec (`now`), (2) at each acceptance-criteria milestone, (3) when a spec is done (pct 100, status done).
- Not after every edit. One command per update. Notes max 10 words.
- Feature IDs come from docs/specs/STATUS.md. Don't invent new IDs; ask first.
- Don't read the tracker files unless asked. Run `node scripts/track.js list` if you need status.
