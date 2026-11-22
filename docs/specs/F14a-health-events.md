# F14a · Integration health, live events, alert emails
Owner: A (Alex) · full stack (web + api + db + tests) · Days 19–19 · Release 3 · Tracker: F14.1, F14.4 (endpoint), F14.5 · PRD: [F14](../PRD.md#f14)

## Goal
Every connection's health is known within minutes, screens update within seconds, and the alert inbox hears about breakage.

## Acceptance criteria
- [ ] Four health states (Connected, Needs attention, Broken, Not connected) from token expiry, last data, webhook errors; checked every 5 min.
- [ ] Polling `/api/events` ≤5 s on inbox and leads, ≤30 s elsewhere (endpoint; John wires the screens).
- [ ] Alert emails to the alert inbox for broken connections and job failures (rate-limited, no personal data).

## Data model / API / job changes
- `integration.health` cron: each adapter's `health()` → integrations.status/note; changes → `emitChange('health')` + `notify(connection_issue)`.
- `GET /api/events?since=` over change_feed, RLS-scoped (CONTRACTS §6); the client role receives only kinds lead, message, health, notification for its own client; `maintenance` prunes change_feed.
- `notify(connection_issue)` also reaches the affected client's users (bell + email, no personal data).
- `/api/health` final version (db, queue, integrations, lastWebhookAt).
- Alert email template (no PII), one per integration per state change.

## Files touched
- A (Alex): src/modules/integrations/hub/*, src/app/api/events/*, src/app/api/health/*, src/worker/jobs/health, maintenance

## Dependencies
F1d.

## Edge cases
- Flapping connection → one alert per state change, not per check.
- Cursor older than pruned rows → client told to full-refresh.
- User loses access to a project → its changes stop appearing (RLS).

## Out of scope
Uptime pinger service, push/Slack/WhatsApp alerts.

## Test plan
- Health transitions from fixtures (expiry, no data 24 h, webhook errors).
- Events endpoint: isolation (other client's changes never returned; a client never sees `task` changes), cursor paging.
