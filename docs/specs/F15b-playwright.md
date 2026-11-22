# F15b · Playwright smoke flows
Owner: B (John) · full stack (web + api + db + tests) · Days 22–23 · Release none (hardening) · Tracker: F15.4 · PRD: [F15](../PRD.md#f15)

## Goal
Six end-to-end flows prove the core loop on staging-like data and run in CI.

## Acceptance criteria
- [ ] Tests: … 6 Playwright flows.

## Data model / API / job changes
- None. Uses seed data and adapter fixtures; emailed code captured from a test mailbox stub.

## Files touched
- B (John): tests/e2e/*

## Dependencies
F13b, F10b.

## Edge cases (the six flows)
1. Login with password + emailed code.
2. Fixture lead arrives → visible in Leads ≤10 s, auto-assigned.
3. Client user signs in, marks SQL → outbox rows queued.
4. WhatsApp fixture message → appears in the inbox.
5. Create a client project → default pipeline exists.
6. Switch to Arabic → RTL renders on Leads and the client dashboard.

## Out of scope
Visual regression, load tests.

## Test plan
- All six pass in CI headless in under 5 minutes.
