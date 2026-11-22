# F10b · Client marking, export, qualification settings
Owner: B (John) · full stack (web + api + db + tests) · Days 16–16 · Release 3 · Tracker: F10.4, F10.5, F10.6 · PRD: [F10](../PRD.md#f10)

## Goal
Client users mark leads MQL, SQL or Not qualified, and each mark flows to the CRM and the ad platforms in one transaction.

## Acceptance criteria
- [ ] Client marks MQL/SQL/Not qualified; Not qualified requires a reason (list editable by SHARKX in Settings → Lead qualification); a mark can be changed later; MQL/SQL definitions shown.
- [ ] Client exports CSV of its own leads.
- [ ] A mark is one transaction: status, history, audit row (actor kind `client`, the user), conversion outbox rows.

## Data model / API / job changes
- Client marking calls `changeStatus(…, by: {kind: client, id: userId})` (CONTRACTS §4); `lead.mark` required → outbox rows consumed by Alex's F11a.
- `/api/export/leads` scoped by role: a client gets its own client only, without owner or notes columns, no test leads.
- qualification_settings: MQL/SQL definitions, reasons list (`qualification.manage`, SHARKX only); settings page "Lead qualification".

## Files touched
- B (John): src/modules/leads (qualification settings, mark controls in the client view), src/app/[locale]/(app)/p/[projectId]/settings/qualification/*

## Dependencies
F10a, F11a.

## Edge cases
- Reason removed from the list later → existing leads keep their reason text.
- Rapid re-marks → each produces its own status_seq and events.
- Client double-clicks → idempotent within the same status.
- Client of A marks a lead of B → not found, nothing written.

## Out of scope
"SharkX suggests MQL", unreviewed reminders to clients, Won, per-client mark/export switches.

## Test plan
- Mark → one transaction creates status, event, audit, outbox rows (rollback test).
- Export contents for a client: own rows only, no forbidden columns.
- Cross-client mark attempt rejected.
