# F4a · Lead engine and seed data
Owner: B (John) · full stack (web + api + db + tests) · Days 5–6 · Release 1 · Tracker: F4.1, F4.2, F4.3, F4.7, F15.5 · PRD: [F4](../PRD.md#f4), [F15](../PRD.md#f15)

## Goal
One `ingestLead()` turns any source's payload into a deduplicated, mapped, assigned lead; demo data exists for every screen.

## Acceptance criteria
- [ ] Every source calls `ingestLead()`; phones normalised to E.164.
- [ ] Per-form field mapping (name, phone, email, custom → custom field / notes / ignore).
- [ ] Dedupe per client: same phone (else email) merges into the contact's open lead timeline; no open lead → new lead on the same contact.
- [ ] Auto-assign round-robin among active managers (all clients). Client users are never assignable.
- [ ] Test leads (`is_test`) are excluded from reports, exports and conversion feedback.
- [ ] Seed/demo data from the mockup (5 clients, ~64 leads).

## Data model / API / job changes
- Implements `ingestLead` exactly per CONTRACTS §4 (real by end of D4 for Alex's adapters).
- lead_forms.mapping + `saveFormMapping(formId, mapping)`; mapping step component reused by the F14b wizard.
- Round-robin pointer per project; lead_events, audit, `emitChange('lead')` in the same transaction.
- `db:seed` loads mockup data on dev/staging only.

## Files touched
- B (John): src/modules/leads/*, src/modules/contacts/*, src/components/mapping/*, tests/fixtures/seed/*

## Dependencies
F1b.

## Edge cases
- No phone and no email → new contact, no match attempted.
- Invalid phone → raw value kept, flagged, no E.164 match.
- Same externalId twice → same lead returned (`created: false`).
- Two submissions of one phone at the same moment → one contact (unique constraint + retry).
- No active managers → unassigned.

## Out of scope
Manual Add lead, bulk actions, Won/Junk.

## Test plan
- Dedupe matrix: phone/email × open/closed lead × same/different source.
- E.164 cases for UAE and Morocco; round-robin fairness; seed runs on an empty DB.
