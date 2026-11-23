# SHARKX Agency CRM

A multi-client CRM for the ad agency SHARKX. It captures leads from every channel, helps the team follow them up, lets each client sign in and mark leads as **MQL**, **SQL** or **Not qualified**, and sends those results back to Meta and Google so the ad platforms learn which leads were good.

```
capture lead  →  follow up  →  client marks MQL / SQL / Not qualified  →  ad platforms learn
```

Clients: aesthetic clinics and SMEs in Abu Dhabi, Dubai and Morocco. The product is English first, with Arabic (right-to-left) and French.

## Who uses it

| Role | Who | What they see |
|---|---|---|
| **Super admin** | SHARKX owner (seeded, never created in the UI) | Everything: all clients, team, audit log |
| **Manager** | SHARKX account manager (invited) | All clients: leads, chats, tasks, pipeline, reports |
| **Client** | A clinic or SME user (invited, one client per user) | Only their own client: Overview, Leads, WhatsApp (read-only), Reports, Connectors. Never notes, owners, stages, tasks or other clients |

Everyone signs in with email, password and a 6-digit emailed code.

## Architecture

Two independent projects, each with its own `package.json`, lockfile and `node_modules`. There is no root workspace.

```
 browser ──▶ web (Next.js 16, UI + BFF, no database access)
                 │  HTTP, internal token + the user's session
                 ▼
             api (Fastify 5) ──▶ Postgres 18 (row-level security per client)
                 ▲
             worker (pg-boss, same code as the api)

 Meta, Google, TikTok, LinkedIn, Snapchat, website forms ──▶ api (webhooks, OAuth callbacks, form endpoint)
```

- The browser only ever talks to `web`. `web` calls `api` over HTTP; the api owns the database, the audit log and all business rules.
- Every client's data is a tenant: all tenant queries go through `withTenant()` (web requests) or `withSystem(projectId)` (worker, webhooks), and Postgres RLS is the second wall behind the services.
- Shared request/response shapes are Zod schemas in `api/src/contracts`. `web/src/contracts` is a generated copy (`node scripts/sync-contracts.mjs`); never edit it by hand.

### Stack

Node 26.13.1 · TypeScript 6 (strict) · Next.js 16.4 App Router (Cache Components off) · React 19 · Tailwind 4 (logical properties only) · Radix · next-intl · Fastify 5 · Drizzle ORM · Postgres 18 · pg-boss · Zod · Resend · Biome · Vitest · Playwright. Hosted on Railway (Europe West).

## Repository layout

```
web/        Next.js UI and BFF  (src/app/[locale], src/components, src/lib, messages/<locale>/<module>.json)
api/        Fastify API + worker (src/modules/<domain>, src/db, src/lib, src/contracts, src/worker)
docs/       PRD, architecture, environments, specs (docs/specs), build plan (plan.html)
skills/     SHARKX brand guidelines (tokens, logos, QA checklist) used for all UI
scripts/    verify gate, contracts sync, tracker CLI
tracker/    build progress dashboard
CLAUDE.md   rules for contributors and Claude Code
```

## Getting started

Requirements: Node **26.13.1** (`nvm use`, see `.nvmrc`), pnpm 10 (`corepack enable`), Docker Desktop.

```bash
# 1. dependencies (one install per app)
cd api && pnpm install && cd ..
cd web && pnpm install && cd ..

# 2. environment
cp api/.env.example api/.env.local
cp web/.env.example web/.env.local
# Set INTERNAL_API_TOKEN to the SAME random value (32+ chars) in both files:
#   openssl rand -base64 32

# 3. database (Postgres 18 on :5433, plus a sharkx_test database)
cd api && docker compose up -d && pnpm db:migrate

# 4. create the super admin (the invite mail is written to api/.mail/ when APP_ENV=local)
pnpm auth:seed-admin --email you@example.com --name "Your Name"

# 5. run
pnpm dev            # api  → http://localhost:4000   (pnpm dev:worker for background jobs)
cd ../web && pnpm dev   # web → http://localhost:3000
```

Open `http://localhost:3000`, accept the invite link from `api/.mail/`, set a password, then sign in with the emailed code (also in `api/.mail/`).

## Commands

Run inside `api/` or `web/` (there is no root `package.json`).

| Command | What it does |
|---|---|
| `pnpm dev` | Start the app (api :4000, web :3000) |
| `pnpm dev:worker` (api) | Start the pg-boss worker |
| `pnpm verify` | Typecheck + Biome lint + Vitest (api needs the Docker Postgres) |
| `pnpm check` / `pnpm format` | Biome check / format |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` (api) | Drizzle migrations and studio |
| `pnpm build && pnpm test:e2e` (web) | Production build, then Playwright (first time: `pnpm exec playwright install chromium`) |

`web` lint also fails on physical-direction Tailwind classes (`ml-`, `left-`, `text-left`…) and on hard-coded UI strings, so Arabic right-to-left layouts and translations cannot regress.

## Quality gate

Before every push, from the repo root:

```bash
node scripts/verify.mjs          # apps you changed + contracts sync check
node scripts/verify.mjs --all    # both apps
```

GitHub CI is currently paused (manual trigger only), so this script is the only gate. `main` must always be green.

## Working on it

- **Specs:** one file per spec in `docs/specs/` (build order and owners in `docs/specs/ORDER.md`). Build one sub-feature at a time and tick its acceptance criteria. Anything not in the PRD is an Extra: ask first.
- **Git:** small commits straight to `main`, message prefix `<spec-id>: …` (for example `F2a: add app shell`). `git pull --rebase` and `node scripts/verify.mjs` before each push. Contract changes go in their own `contracts:` commit.
- **UI:** follows `skills/sharkx-brand-guidelines` (SHARKX Red `#e70101` and Black `#1c0f0f`, light canvases, no dark theme, SVG icons) and the clickable prototype in `docs/inputs/` (kept local, not in git).
- **Strings:** English in `web/messages/en/<module>.json`; Arabic and French follow in the F2c batch.
- **Progress:** `node scripts/track.js list`; open `docs/plan.html` for the timeline.

## Status

Foundation and access (database, row-level security, sign-in with emailed code, roles, invites, audit writes, queue, rate limits) are built and independently reviewed. The web app shell, i18n and RTL are in progress, followed by the lead engine, workspace, client dashboard, leads screen and overview. See `docs/specs/ORDER.md` for the schedule and `node scripts/track.js list` for live status.

## Deployment

Railway services `web`, `api` and `worker` plus Postgres. Staging deploys automatically from `main`; production is promoted manually after UAT. Environments, variables and secrets: [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md). Never commit secrets: only the two `.env.example` files are tracked. Never run `db:migrate` against production from a laptop.

## Documentation

- [CLAUDE.md](CLAUDE.md): rules for contributors and Claude Code
- [docs/PRD.md](docs/PRD.md): features F1 to F15, extras, what is cut
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): stack, data model and RLS, auth, integrations
- [docs/specs/](docs/specs/): specs, shared contracts, build order, technical plans
- [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md): environments, secrets, deployment steps

SharkX · Confidential · sharkx.ae
