# F4b · Leads screen, lead drawer, contacts
Owner: B (John) · full stack (web + api + db + tests) · Days 9–10 · Release 1 · Tracker: F4.4, F4.5, F4.6 · PRD: [F4](../PRD.md#f4)

> Ownership changed: B (John) builds this feature end to end, web and api. Where "Files touched" below splits files between A and B, read it as a list of paths only.

## Goal
The team finds, filters, qualifies, assigns and exports leads, and sees each person's full history.

## Acceptance criteria
- [ ] Lead visible ≤10 s after arrival with source, campaign, form answers.
- [ ] Leads screen: tabs All/Unreviewed/MQL/SQL/Not qualified; search; source and owner filters; single assign; CSV export of the current filter.
- [ ] Lead drawer: qualification, details, answers, timeline. Contacts list + profile (all leads, chats, notes, status changes).
- [ ] Client view (client role): same Leads screen with tabs All/Unreviewed/MQL/SQL/Not qualified, search and source filter; drawer shows qualification, details, answers, campaign only; no owner filter, assign, stage, timeline, notes or Contacts screen.

## Data model / API / job changes
- `changeStatus()` per CONTRACTS §4 (writes the conversion outbox rows Alex sends in F11a).
- Export through `/api/export/leads` (Alex's route shell, John's query); excludes is_test; scoped to the caller's role (a client gets its own client, no owner or notes columns).
- Client-safe projection of leads (no owner_id, stage_id, notes, events) for the client role; marking uses `lead.mark`, other edits `lead.update`.
- SWR refresh every 5 s until F14a events.

## Files touched
- B (John): src/app/[locale]/(app)/p/[projectId]/{leads,contacts}/*, src/components/leads/*, src/modules/leads/*, messages/en/leads.json
- A (Alex): src/app/api/export/[kind] shell (John adds the leads query in his own commit)

## Dependencies
F4a, F2a.

## Edge cases
- Not qualified requires a reason from the client's list.
- "Unassigned" owner filter; search across name, phone, campaign.
- Lists paginate; counts per tab stay correct with filters.
- Status changed by the team is audited like a client mark (actor kind `user` vs `client`).

## Out of scope
Bulk assign/status, manual Add lead, starred, Won/Junk.

## Test plan
- Tab counts and filters on seed data.
- Export rows equal the filtered list (minus test leads).
- Drawer timeline order; status change creates outbox rows.
