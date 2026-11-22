// GENERATED from api/src/contracts by scripts/sync-contracts.mjs. Do not edit; change the source and re-run the script.
// Shared Zod contracts between web (BFF) and api: docs/specs/CONTRACTS.md, frozen Day 1 (spec F1a).
// Source of truth is this folder (api/src/contracts). web/src/contracts is a generated copy:
// run `node scripts/sync-contracts.mjs` after every change; CI fails if the copy is stale.
// Files here may import only `zod` and each other (relative, with .ts extension).
export * from './audit.ts';
export * from './auth.ts';
export * from './common.ts';
export * from './functions.ts';
export * from './http.ts';
export * from './jobs.ts';
export * from './session.ts';
export const CONTRACTS_VERSION = '2.0.0';
