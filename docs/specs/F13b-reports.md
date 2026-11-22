# F13b · Reports
Owner: B (John) · full stack (web + api + db + tests) · Days 18–18 · Release 3 · Tracker: F13.2, F13.3 · PRD: [F13](../PRD.md#f13)

## Goal
SHARKX managers and each client's users see lead quality by source and campaign.

## Acceptance criteria
- [ ] Reports: 7/30/90 days; performance by source **and** campaign (leads, MQL, SQL, SQL rate per row).
- [ ] Definitions: MQL rate = (MQL+SQL)/leads; SQL rate = SQL/leads; first reply = first customer message → first outbound message.

## Data model / API / job changes
- Aggregates in `modules/reports` (shared with F13a), excluding is_test.
- `report.read` is allowed for the client role, scoped to its own client.

## Files touched
- B (John): src/modules/reports/*, src/app/[locale]/(app)/p/[projectId]/reports/*, messages/en/reports.json

## Dependencies
F13a.

## Edge cases
- Range boundaries in the client's time zone.
- Campaign names missing → "(no campaign)" bucket.

## Out of scope
Funnel chart, report CSV export (F13.3, cut for this phase), first-reply time by manager, cost per SQL, Won, scheduled report emails.

## Test plan
- Source/campaign tables against seed data for each range.
