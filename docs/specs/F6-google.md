# F6 · Google Ads and YouTube lead forms
Owner: B (John) · full stack (web + api + db + tests) · Days 13–13 · Release 2 · Tracker: F6.1, F6.2, F6.3 · PRD: [F6](../PRD.md#f6)

> Ownership changed: B (John) builds this feature end to end, web and api. Where "Files touched" below splits files between A and B, read it as a list of paths only.

## Goal
Google Search, YouTube and Demand Gen lead forms deliver leads into the CRM.

## Acceptance criteria
- [ ] Connect Google account; choose Ads account and lead forms (Search, YouTube, Demand Gen).
- [ ] Lead-form webhook (key-verified) → ingest; fields mapped per form.
- [ ] Health and reconnect as F5; fixture-tested, live with real forms.

## Data model / API / job changes
- Google adapter: descriptor oauth → select (account, forms) → mapping. One OAuth grant also requests the Data Manager scope used in F11b.
- Per-form webhook URL + key shown in the wizard; `POST /api/webhooks/google` verifies key → `webhook_events` → `ingestLead` (gclid in attribution).
- integrations + lead_forms rows as F5.

## Files touched
- A (Alex): src/modules/integrations/google/*, src/app/api/webhooks/google/*, src/app/api/oauth/google/*, tests/fixtures/google/*

## Dependencies
F4a, F14b.

## Edge cases
- Wrong or missing key → 401, nothing stored.
- Google "send test data" payload → `isTest`.
- Lead without gclid → ingested; conversion later skipped for Google (F11b).
- Refresh token revoked → Broken + reconnect.

## Out of scope
Google Ads API offline conversion import (closed to new adopters), spend data.

## Test plan
- Fixture tests: valid, wrong key, test payload, duplicate.
- Manual: real form submission once SHARKX provides access.
