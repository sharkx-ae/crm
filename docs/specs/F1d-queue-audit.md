# F1d · Queue, worker, audit writes, limits, alerts
Owner: A (Alex) · full stack (web + api + db + tests) · Days 8–8 · Release 1 · Tracker: F1.6 (writes), F1.7, F1.8 · PRD: [F1](../PRD.md#f1)

## Goal
Background jobs run reliably, every mutation is audited, abuse is rate-limited and failures reach the alert inbox.

## Acceptance criteria
- [ ] Every mutation, sign-in event, integration connect and client mark writes an audit row.
- [ ] Failed jobs retry with backoff; exhausted jobs send an alert email.

## Data model / API / job changes
- pg-boss in the `worker` service; queue registry with every job in CONTRACTS §5 and its retry policy (ARCHITECTURE §5).
- `audit()` helper used by every Server Action wrapper; `error_log` + alert email rate-limited to one per fingerprint per hour.
- Postgres rate limits: login 5/15 min per email+IP, code send 3/10 min, reset 3/h, forms per IP.
- Security headers (CSP, HSTS, nosniff, Referrer-Policy, frame-ancestors none).
- `AppError` + boundary wrapper (CONTRACTS §7); JSON logger with request id.
- Exports a read function for the audit viewer (F1e).

## Files touched
- A (Alex): src/worker/*, src/modules/audit/*, src/lib/rate-limit/*, src/lib/errors/*, src/lib/log/*, next.config (headers)

## Dependencies
F1b.

## Edge cases
- Job re-run after a crash produces no duplicate side effects (`singletonKey`).
- Alert storm: identical errors collapse into one email per hour.
- Audit meta never contains message bodies, tokens or full phone numbers.
- Worker restart mid-job resumes from the queue.

## Out of scope
Audit viewer UI (F1e), Sentry, Redis.

## Test plan
- Job that always fails: retries per policy, lands in error_log, one alert email.
- Each wrapped mutation writes exactly one audit row.
- Rate-limit window tests (allow, block, reset).
