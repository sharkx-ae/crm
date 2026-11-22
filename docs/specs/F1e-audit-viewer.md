# F1e · Audit log viewer
Owner: B (John) · full stack (web + api + db + tests) · Days 19–19 · Release 3 · Tracker: F1.6 (viewer) · PRD: [F1](../PRD.md#f1)

## Goal
The super admin can see who did what, where and when.

## Acceptance criteria
- [ ] Super admin filters audit rows by user, action, client, date.

## Data model / API / job changes
- Reads via the audit module's exported read function (Alex, F1d); `audit.read` only; paginated.

## Files touched
- B (John): src/app/[locale]/(app)/audit/*, messages/en/audit.json

## Dependencies
F1d, F2a.

## Edge cases
- Anyone but the super admin (managers and client users included) → forbidden.
- System and client actors shown as "System" / "Client user (name, client)".
- Large ranges paginate; times shown with zone.

## Out of scope
Audit export, editing or deleting entries.

## Test plan
- Permission test; filter combinations on seeded audit rows.
