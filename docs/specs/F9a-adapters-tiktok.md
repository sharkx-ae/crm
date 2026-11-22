# F9a · Adapter interface and TikTok
Owner: B (John) · full stack (web + api + db + tests) · Days 20–20 · Release none (hardening) · Tracker: F9.1, F9.2 · PRD: [F9](../PRD.md#f9)

> Ownership changed: B (John) builds this feature end to end, web and api. Where "Files touched" below splits files between A and B, read it as a list of paths only.

## Goal
TikTok lead forms plug into the shared adapter shape, fixture-verified now and live when access arrives.

## Acceptance criteria
- [ ] One adapter interface. Per platform: connect, account/form selection, lead retrieval (webhook or polling), mapping, health, reconnect.
- [ ] Each passes its fixture suite. A platform without access shows "Awaiting platform access" and is verified live when access arrives.

## Data model / API / job changes
- Adapter interface (CONTRACTS §4) extracted from Meta/Google into a shared base; TikTok implements it.
- TikTok: oauth → select (advertiser, forms) → mapping; webhook `POST /api/webhooks/tiktok` or polling job; → `ingestLead` (source tiktok).
- integrations.mode = awaiting until credentials exist.

## Files touched
- A (Alex): src/modules/integrations/_shared/*, src/modules/integrations/tiktok/*, src/app/api/webhooks/tiktok/*, tests/fixtures/tiktok/*

## Dependencies
F4a, F14b.

## Edge cases
- No developer access yet → hub shows Awaiting; connect disabled with reason.
- Polling overlaps previous run → no duplicate leads (externalId).
- Token expiry → needs_attention.

## Out of scope
TikTok conversion feedback, spend.

## Test plan
- Shared adapter contract test run against Meta, Google and TikTok.
- TikTok fixture replay (webhook and poll) idempotent.
