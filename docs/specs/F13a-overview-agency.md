# F13a · Client overview and agency view
Owner: B (John) · full stack (web + api + db + tests) · Days 11–11 · Release 1 · Tracker: F13.1, F13.4 · PRD: [F13](../PRD.md#f13)

## Goal
Each client's health and the whole agency's workload are readable in seconds.

## Acceptance criteria
- [ ] Overview KPIs: Leads (30 d), New today, Median first reply, MQL rate, SQL rate; leads per day; leads by source; client users also get a waiting-for-review list.
- [ ] Definitions: MQL rate = (MQL+SQL)/leads; SQL rate = SQL/leads; first reply = first customer message → first outbound message.
- [ ] Agency view (super admin and managers): new leads, unreplied chats, overdue follow-ups, connection health across clients.
- [ ] Client users see the same Overview for their own client only; no agency view.

## Data model / API / job changes
- Read-only aggregate queries (exclude is_test) in `modules/reports`; leads.first_reply_at set when the first outbound message is recorded.
- Hand-rolled SVG charts as in the mockup; times in the client's zone, agency view labels zones.

## Files touched
- B (John): src/modules/reports/*, src/app/[locale]/(app)/p/[projectId]/overview/*, clients home agency panel, messages/en/reports.json

## Dependencies
F4b, F3b.

## Edge cases
- No chats yet → median first reply shows "—".
- Leads without chats excluded from first-reply metrics.
- Agency view is staff only; a client user gets forbidden.

## Out of scope
Cost per SQL, Won KPI, spend.

## Test plan
- KPI values against hand-computed seed numbers.
- Permission scoping: agency view staff only; client Overview limited to its own client.
