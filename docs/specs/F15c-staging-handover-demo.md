# F15c · Staging release, backups, handover, demo
Owner: Both · Days 21–23 · Release none (hardening/demo) · Tracker: F15.1, F15.6, F15.7 · PRD: [F15](../PRD.md#f15), [Demo](../PRD.md#demo-success-criteria)

## Goal
A release candidate runs on staging, backups are proven, handover material exists, and the Day 21 demo passes.

## Acceptance criteria
- [ ] Staging auto-deploys from `master`; production is promoted by merging `master` into `main`.
- [ ] Backups on; restore drill passed before production.
- [ ] Handover: runbook, env/secrets list, reconnect guide, team training session.
- [ ] Day 21 scripted demo (PRD steps 1–10), each integration labelled Live or Fixture-verified.
- [ ] Gates: CI green; isolation and security suite pass; no open P1/P2 bugs; seed loaded; restore drill done.

## Data model / API / job changes
- None. Production environment configured but not promoted.

## Files touched
- Both: docs/runbook (new handover doc), Railway configuration, release notes

## Dependencies
F15a, F15b.

## Edge cases
- Live access arrived for some platforms → re-run their fixture suite live before the demo.
- A gate fails → demo shows the RC with the failing item called out, not hidden.

## Out of scope
Production go-live (F15d), new features.

## Test plan
- Restore drill: restore staging backup into a scratch database and run the smoke flows.
- Dry run of the demo script on D20.
