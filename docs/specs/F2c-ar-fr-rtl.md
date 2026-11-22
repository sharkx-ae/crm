# F2c · Arabic and French strings, RTL QA
Owner: B (John) · full stack (web + api + db + tests) · Days 22–22 · Release none (hardening) · Tracker: F2.6 · PRD: [F2](../PRD.md#f2)

## Goal
Every screen and email is complete in Arabic and French, and Arabic renders correctly right-to-left.

## Acceptance criteria
- [ ] EN/AR/FR with full RTL; language saved per user; no hard-coded strings.

## Data model / API / job changes
- Claude-drafted `messages/ar/*` and `messages/fr/*` from the frozen English keys; AR/FR email templates.
- CI key-parity check switched from warning to failing.

## Files touched
- B (John): messages/ar/*, messages/fr/*
- A (Alex): src/lib/email templates AR/FR (John drafts, Alex reviews)

## Dependencies
F13b (last screen with new strings).

## Edge cases
- Plurals and gender in Arabic; French apostrophes.
- Mixed-direction text: phone numbers, Latin names, campaign names inside Arabic UI.
- Truncation in table headers and badges.

## Out of scope
Native-speaker review (SHARKX reviewers during UAT, F15d).

## Test plan
- Key-parity CI passes for all three locales.
- RTL walkthrough of every screen; Arabic render flow in F15b.
