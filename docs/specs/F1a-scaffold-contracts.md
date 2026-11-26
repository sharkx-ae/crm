# F1a · Scaffold, CI, Railway, contracts
Owner: Both (Alex leads, John reviews contracts) · Days 1–1 · Release 1 · Tracker: F1.1, F1.9 · PRD: [F1](../PRD.md#f1), [F15](../PRD.md#f15)

## Goal
Repo, toolchain, environments and frozen contracts exist so Alex and John build in parallel from Day 1.

## Acceptance criteria
- [ ] The api's `/health` reports DB, queue, each integration, last webhook time (checks stubbed until F1d/F14a). Web `/api/health` stays reachability only.
- [ ] CI: typecheck, Biome, Vitest (Postgres), audit; runs on every push to `master`; staging deploys only after green CI.
- [ ] Staging auto-deploys from `master`; production is promoted by merging `master` into `main`.

## Data model / API / job changes
- No tables (F1b). `api/src/contracts/` mirrors `docs/specs/CONTRACTS.md` exactly; `web/src/contracts/` is its generated copy.
- `lib/env.ts` validates every env var at boot.
- Railway project `sharkx-crm`, Europe West; environments staging/production; services web, api, worker, Postgres; public staging URL.
- Node gate: Railway build + CI on Node 26; on failure pin Node 24 and note it in ARCHITECTURE §1.
- pnpm scripts exactly as listed in CLAUDE.md.

## Files touched
- A (Alex): .nvmrc, .github/workflows/ci.yml, api (package.json, biome, env, health route, worker entry, railway*.json, docker-compose)
- B (John): web (package.json, biome, next.config, env, BFF client, `/api/health`, railway.json)
- Both: api/src/contracts/* (then `node scripts/sync-contracts.mjs`)
- Base setup (repo skeleton, envs, CI, Railway config) done 2026-11-19; F1a remaining = contracts from CONTRACTS.md.

## Dependencies
None.

## Edge cases
- Railpack lacks Node 26 → `RAILPACK_NODE_VERSION`, else Node 24.
- Missing env var → boot fails naming the variable, never printing its value.
- Contract disagreement on Day 1 → resolved before merge; no "temporary" shapes.

## Out of scope
Feature code, schema, Redis, WebSocket, Sentry, R2.

## Test plan
- CI green on a sample test against the Postgres service.
- Staging `/api/health` returns 200.
- Contracts typecheck and match CONTRACTS.md field for field.
