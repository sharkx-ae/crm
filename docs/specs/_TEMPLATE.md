# <ID> · <Feature name>
Owner: A (Alex) | B (John) · full stack (web + api + db + tests) · Days <start>–<end> · Release <1|2|3|none> · Tracker: <F#.#, …> · PRD: [F#](../PRD.md#f#)

## Goal
One sentence: what a person can do when this spec is done.

## Sub-features
| # | Sub-feature | Tracker | Est. |
|---|---|---|---|
| S1 | … | F#.# | 0.5 d |

## Shared by all sub-features
Tables touched · routes prefix · permissions (`can()` actions) · audit actions written · email templates · files (`web/…`, `api/…`).

## S1 · <Sub-feature name>
**Person story:** As a <role>, I can … so that …
**Screens (web):** route, what is on it, empty / loading / error states, RTL notes.
**Server Actions → api routes:** `POST /x` request → response (Zod schemas live in `api/src/contracts`, additive only).
**Rules:** limits, validations, who may do it, what is recorded (audit), what is sent (email / notification).
**Errors (AppError codes) and what the person sees.**
**Done when:** the acceptance criteria (copied from the PRD, nothing added).
**Tests:** unit / integration / one e2e path.

## Dependencies
Spec IDs that must be merged first, and any that run in parallel against fixtures.

## Out of scope
PRD Extras/Cut items that look related. Do not build them.

Rules: one dev builds a whole feature top to bottom (screen, Server Action, api route, service, schema, tests). No feature outside the PRD. Shapes shared with the other dev go through `docs/specs/CONTRACTS.md`.
