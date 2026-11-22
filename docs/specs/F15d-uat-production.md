# F15d · UAT and production go-live
Owner: Both · Days 24–30 (outside the build) · Release none · Tracker: F15.8 · PRD: [F15](../PRD.md#f15), [Demo](../PRD.md#demo-success-criteria)

## Goal
SHARKX tests every feature on live accounts, signs off milestones, and the CRM goes live in production.

## Acceptance criteria
- [ ] UAT exit (D24–30): each integration verified live or logged as blocked with a dated dependency entry; milestone reviews signed (3 working days each); production live; training done.

## Data model / API / job changes
- None. Production promote, production secrets, production domains.

## Files touched
- Both: UAT checklist, dependency log, release notes

## Dependencies
F15c.

## Edge cases
- Platform access still missing → integration stays Fixture-verified, logged under SOW T&C 4.
- Arabic/French reviewer feedback → string-only fixes allowed; no feature changes.
- Bug found in UAT → fixed on `main`, re-verified on staging, then promoted.

## Out of scope
Extras, new features, warranty work (starts at go-live).

## Test plan
- UAT checklist per PRD feature signed by SHARKX.
- Post-go-live smoke run on production.
