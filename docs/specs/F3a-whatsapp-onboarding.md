# F3a · WhatsApp onboarding and webhook receiver
Owner: A (Alex) · full stack (web + api + db + tests) · Days 9–9 · Release 2 · Tracker: F3.1, F3.2 · PRD: [F3](../PRD.md#f3)

## Goal
A client's WhatsApp Business number connects by QR (Embedded Signup v5, Coexistence) and Meta webhooks are verified, stored and queued.

> **Plan wins (2026-11-25, [technical plan](F3a-technical-plan.md)):** Embedded Signup **v5** (not v4); QR path only (`FINISH` for a new Cloud API number is refused); **no OAuth callback route**: the SDK returns the code in the browser, so it goes Server Action → internal api route (`POST /projects/:projectId/whatsapp/connect`). Webhook checks against Meta run in production (one callback URL per app).

## Acceptance criteria
- [ ] Connect: analyst starts Embedded Signup; client scans QR in the WhatsApp Business app; several numbers per client; sync % shown.

## Data model / API / job changes
- Meta app (dev mode) with Embedded Signup v5; Meta test number for development.
- `wa_numbers` row per number; tokens in `integration_tokens` (AES-256-GCM).
- `GET|POST /api/webhooks/meta`: verify token handshake, signature check → `webhook_events` (unique provider+external id) → 200 → `webhook.process`.
- Starts `wa.history.sync` when the client approves history (handled in F3b).

## Files touched
- A (Alex): src/modules/whatsapp/*, src/modules/webhooks/*, src/app/api/webhooks/meta/* (→ `api/src/routes/webhooks/meta.ts`), tests/fixtures/whatsapp/* (no `oauth/meta` route: see the note above)
- B (John): none (temporary connect button until the F14b wizard renders the `qr` step)

## Dependencies
F1d.

## Edge cases
- Bad signature → 401, nothing stored.
- Same webhook delivered twice → one row.
- Number already linked to another project → rejected with message.
- App version below 2.24.17 or number active < 7 days → Meta error shown in plain words.
- Unverified business: onboarding limit (10 per 7 days) surfaced, not hidden.

## Out of scope
Sending messages, templates, groups, media download.

## Test plan
- Signature and handshake tests with recorded fixtures.
- Idempotency test (duplicate deliveries).
- Manual: onboard the Meta test number in dev mode end to end.
