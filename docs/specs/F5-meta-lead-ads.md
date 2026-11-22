# F5 · Meta Lead Ads
Owner: A (Alex) · full stack (web + api + db + tests) · Days 15–16 · Release 2 · Tracker: F5.1, F5.2, F5.3, F5.4 · PRD: [F5](../PRD.md#f5)

## Goal
A client's Facebook/Instagram lead forms deliver leads into the CRM within seconds.

## Acceptance criteria
- [ ] Connect via Facebook login: choose Page and lead forms; health shown.
- [ ] New lead via webhook → retrieve → ingest ≤30 s; fields mapped per form.
- [ ] Tokens encrypted; expiry warned ≥5 days ahead; one-click reconnect.
- [ ] Verified with Meta's lead testing tool (dev mode) and fixtures; live on approval.

## Data model / API / job changes
- Meta adapter (CONTRACTS §4): descriptor steps oauth → select (Page, forms) → mapping.
- integrations row (platform meta), lead_forms per form (mapping saved via John's `saveFormMapping`).
- `leadgen` events on `/api/webhooks/meta` → `webhook.process` → Graph retrieve → `ingestLead` (attribution: ad id, campaign).
- Token expiry feeds F14a health.
- After this spec: submit lead-retrieval permissions for App Review (target end of D12).

## Files touched
- A (Alex): src/modules/integrations/meta/*, src/app/api/oauth/meta/*, tests/fixtures/meta/*

## Dependencies
F3a (Meta app, webhook route), F4a, F14b (wizard).

## Edge cases
- Lead deleted or expired before retrieval → logged, not retried forever.
- Form not mapped yet → custom answers kept, mapped on save.
- Page access revoked → Broken + reconnect.
- Duplicate leadgen events → one lead (externalId).
- Testing-tool leads → `isTest`.

## Out of scope
Ad spend, campaign management, Click-to-WhatsApp tag.

## Test plan
- Fixture replay: webhook → retrieve → ingest, including duplicates.
- Manual: Meta lead testing tool in dev mode, lead visible ≤30 s.
- Token-expiry fixture flips health to needs_attention.
