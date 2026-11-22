# F12 · Routing and automation
Owner: B (John) · full stack (web + api + db + tests) · Days 17–17 · Release 3 · Tracker: F12.1, F12.2, F12.3, F12.4, F12.5 · PRD: [F12](../PRD.md#f12)

## Goal
Leads are routed automatically, slow replies raise alerts, and simple when/then rules run per client.

## Acceptance criteria
- [ ] Auto-assignment (round-robin) configurable per client.
- [ ] Response-time alert: no reply in N min (default 15, set per client in Automation) during business hours → notify the lead's owner (a manager; bell + email).
- [ ] Simple rules: when (new lead from source, no reply N min, client marks status, unreviewed N h) → then (assign, notify, create task, move stage); enable/disable; run count.
- [ ] Business hours per client drive the timers.

## Data model / API / job changes
- automation_rules (`automation.manage`); engine subscribes to lead created, message in, statusChanged.
- `automation.timer` delayed jobs (no_reply, unreviewed) honouring business hours; cancelled when the condition clears.
- Actions call existing services: assign (leads), notify, create task (tasks), move stage (pipeline). run_count increments.
- Rules page: list, toggle, simple builder with the four triggers and four actions only.

## Files touched
- B (John): src/modules/automation/*, src/app/[locale]/(app)/p/[projectId]/settings/automation/*, messages/en/automation.json

## Dependencies
F8b, F3b.

## Edge cases
- Message arrives outside business hours → timer starts at next opening.
- Reply arrives before the timer → timer cancelled, no alert.
- Two rules on one event → both run, order by creation.
- Rule loops (move stage triggering itself) prevented: rules don't trigger on their own actions.

## Out of scope
WhatsApp reminders to clients, multi-step workflows, custom code actions.

## Test plan
- Timer tests with fake clock across business-hour boundaries.
- Each trigger × action pair on seed data; run_count updates.
