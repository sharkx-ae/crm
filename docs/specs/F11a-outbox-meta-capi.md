# F11a · Conversion outbox and Meta Conversions API
Owner: A (Alex) · full stack (web + api + db + tests) · Days 17–17 · Release 3 · Tracker: F11.1, F11.2, F11.5 · PRD: [F11](../PRD.md#f11)

## Goal
Every status change is sent to Meta within a minute, exactly once, with a visible log.

## Acceptance criteria
- [ ] Status change → outbox → sent ≤60 s; retries with backoff; one event per platform per change (idempotent event id).
- [ ] Meta Conversions API (hashed phone/email, lead id/fbclid; `test_event_code` on staging).
- [ ] Failed sends retry with backoff, then raise the alert email.
- [ ] Test leads and leads with no usable identifier are skipped and logged.

## Data model / API / job changes
- Consumes `conversion_events` rows written by John's `changeStatus` (CONTRACTS §4); `conversion.send` job (8 retries, exponential from 10 s).
- Meta sender: event_id = conversion_events.id; sha256 of normalised phone/email; Lead Ads lead id or fbclid; dataset from the Meta integration.

## Files touched
- A (Alex): src/modules/conversion/*, src/worker/jobs/conversion-send, tests/fixtures/meta-capi/*

## Dependencies
F1d, F4b (status changes exist).

## Edge cases
- Status flips MQL → SQL → MQL quickly → three events in order (status_seq).
- Meta 4xx (bad data) → failed, no retry; 5xx/timeouts → retry.
- Mapping disabled for a status → no row created.
- No dataset access yet → skipped with reason "no dataset".

## Out of scope
Google sender and mapping UI (F11b), other platforms' conversion APIs.

## Test plan
- Outbox test: one row per enabled mapping per change; replay sends once.
- Meta sender against fixtures + staging `test_event_code`.
- Retry/failure classification tests; skip rules for test leads.
