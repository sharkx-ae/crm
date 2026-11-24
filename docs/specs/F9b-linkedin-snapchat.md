# F9b · LinkedIn and Snapchat
Owner: B (John) · full stack (web + api + db + tests) · Days 21–21 · Release 4 · Tracker: F9.3, F9.4 · PRD: [F9](../PRD.md#f9)

> Ownership changed: B (John) builds this feature end to end, web and api. Where "Files touched" below splits files between A and B, read it as a list of paths only.

## Goal
LinkedIn Lead Gen Forms and Snapchat lead ads deliver leads through the shared adapter, fixture-verified now.

## Acceptance criteria
- [ ] Per platform: connect, account/form selection, lead retrieval (webhook or polling), mapping, health, reconnect.
- [ ] Each passes its fixture suite. A platform without access shows "Awaiting platform access" and is verified live when access arrives.

## Data model / API / job changes
- LinkedIn: Lead Sync API, oauth → select (ad account, forms) → mapping; polling job (notifications if granted) → `ingestLead` (source linkedin).
- Snapchat: Marketing API, oauth → select (ad account, forms) → mapping; webhook `POST /api/webhooks/snapchat` or polling → `ingestLead` (source snapchat).
- integrations.mode awaiting until access is granted.

## Files touched
- A (Alex): src/modules/integrations/linkedin/*, src/modules/integrations/snapchat/*, src/app/api/webhooks/snapchat/*, tests/fixtures/{linkedin,snapchat}/*

## Dependencies
F9a.

## Edge cases
- LinkedIn access pending (no SLA) → Awaiting, logged in dependency log.
- Snapchat user lacks Organization Admin → clear error at connect.
- Poll window gaps after downtime → backfill from last cursor.

## Out of scope
Conversion feedback to LinkedIn/Snapchat, spend.

## Test plan
- Shared adapter contract test passes for both.
- Fixture replay idempotent; backfill test after a simulated gap.
