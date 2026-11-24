# ENVIRONMENTS

## The three environments
| | local | staging | production |
|---|---|---|---|
| Runs on | your machine (`pnpm dev` in `api/` and `web/`, Docker Postgres on :5433) | Railway env `staging` | Railway env `production` |
| Deploys | — | automatically from `master` after CI passes | from `main`, which only changes through a `master` → `main` release PR of a commit already verified on staging; deployed by hand |
| URLs | web :3000, api :4000 | Railway staging domains (custom later) | `app.<domain>`, `api.<domain>` |
| Database | `sharkx` (+ `sharkx_test` for Vitest) | own Railway Postgres | own Railway Postgres + backups |
| Secrets/keys | dummy or none (`.env.local`) | staging-only values | production-only values |
| Email sender | none required | Resend, test sender/domain | Resend, SHARKX verified domain |
| Log level | `debug` | `info` | `info` |
| Platform accounts | fixtures | Meta dev mode, CAPI `test_event_code`, test ad accounts | live client accounts |

- Staging and production never share a database, `INTERNAL_API_TOKEN`, `TOKEN_ENC_KEY` or any API key.
- `APP_ENV` (local | staging | production) drives behaviour. `NODE_ENV` stays `production` on Railway.

## Where secrets live
- Railway variables, per environment and per service. This is the only source for staging/production.
- GitHub Actions: CI uses dummy, non-secret values in `ci.yml`. Repository secrets only if CI ever needs a real one.
- Never in git: `.env*` is ignored except the two `.env.example` files (`web`, `api`).
- Local: `web/.env.local` and `api/.env.local`, copied from the examples.

## Add a new variable
1. Add it with a comment to the right `.env.example` (`web` or `api`).
2. Add it to that app's `src/lib/env.ts` schema (required or optional, per environment if needed).
3. Set it in Railway for **staging and production** on every service that reads it (api and worker share most).
4. If tests need it, add a dummy value to `.github/workflows/ci.yml`. Mention it in the commit message.

## Rotate a secret
1. Generate a new value (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).
2. Replace it in Railway for that environment only; Railway redeploys the affected services.
3. Confirm the healthchecks are green, then revoke the old key at the provider (Resend, Meta, Google…).
4. Note: `INTERNAL_API_TOKEN` must be changed on `api` and `web` together (until both have redeployed, web calls get 404); it does not sign anyone out. Rotating `TOKEN_ENC_KEY` needs the key-id migration (F5).

## Manual setup steps (you, in the UIs)
**GitHub**
1. Create a private repository (Conalytic or SHARKX organisation). Push `master` (the working branch) and `main` (the release branch, created from it).
2. Settings → Rules → Rulesets, two branch rulesets:
   - `master`: **only** block force pushes and deletions. Do **not** require pull requests or status checks: the team pushes straight to `master`, and those rules would block that. The gates are `node scripts/verify.mjs` before each push, CI after it, and Railway's "Wait for CI" so staging only deploys green commits.
   - `main`: block force pushes and deletions and **require a pull request before merging**, so nothing is pushed to `main` directly. It only changes through a `master` → `main` release PR.
3. Actions: keep enabled for the repository; no secrets needed now.

**Railway** (SHARKX's Pro account, Conalytic invited as admin)
1. New project `sharkx-crm`. Environments: keep `production`, add `staging` as a new **empty** environment (don't duplicate, so no secrets are copied).
2. In **each** environment: add a PostgreSQL database (check it is version 18 to match local and CI).
3. In each environment add three services from the GitHub repo (install the Railway GitHub app when asked), all region **Europe West (Amsterdam)**. Each service's Settings → Root Directory, Config-as-code path and Watch Paths:
   - `web` → root `/web`, config `/web/railway.json`, watch `/web/**`
   - `api` → root `/api`, config `/api/railway.json`, watch `/api/**`
   - `worker` → root `/api`, config `/api/railway.worker.json`, watch `/api/**`
4. Deploy triggers: **staging**: branch `master`, automatic deploys on, "Wait for CI" **off while GitHub CI is paused** (turn it on again when CI is re-enabled in `.github/workflows/ci.yml`). **production**: branch `main`, automatic deploys **off**; after the `master` → `main` release PR is merged, deploy that commit by hand.
5. Variables (set separately in each environment):
   - Templates with every variable: `api/.env.production.example` and `web/.env.production.example` (never read by the app; the values live in Railway). Use real values: no `<placeholder>` text, no quotes. A wrong `APP_ENV` is dangerous (`local` writes emails to disk and uses non-secure cookies).
   - `api`: `NODE_ENV=production`, `APP_ENV`, `LOG_LEVEL=info`, `PORT=8080`, `APP_URL` (web URL with `https://`), `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `INTERNAL_API_TOKEN` (same value as web), `RESEND_API_KEY`, `EMAIL_FROM`, `ALERT_EMAIL` (the three email variables are required outside local; without a real key no sign-in code or invite is sent). Staging only: `SEED_PASSWORD` for `pnpm db:seed` (demo users' password); never set it in production.
   - `worker`: `NODE_ENV=production`, `APP_ENV`, `LOG_LEVEL=info`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `RESEND_API_KEY`, `EMAIL_FROM`, `ALERT_EMAIL`
   - `web`: `NODE_ENV=production`, `APP_ENV`, `APP_URL`, `PORT=8080`, `API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8080`, `INTERNAL_API_TOKEN` (the same random value as the api, new per environment)
6. Networking: generate public domains for `web` and `api` (api is public only for webhooks/OAuth/forms). No public domain for `worker`. Custom domains when SHARKX gives DNS access.
7. First deploy: check api logs show `migrations applied`, then open web `/api/health` → `"status":"ok"`.
8. Later (F15c): enable Postgres backups in production and run one restore drill.
9. If Railway cannot build Node 26: set `RAILPACK_NODE_VERSION=24` on all three services and tell the team.
