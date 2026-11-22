# F7 · Website forms and CSV import
Owner: B (John) · full stack (web + api + db + tests) · Days 12–12 · Release 2 · Tracker: F7.1, F7.2, F7.3 · PRD: [F7](../PRD.md#f7)

> Ownership changed: B (John) builds this feature end to end, web and api. Where "Files touched" below splits files between A and B, read it as a list of paths only.

## Goal
Any website form and any CSV of old leads land in the CRM through the same lead engine.

## Acceptance criteria
- [ ] One copy-paste snippet; any form posts to `/api/forms/:key`; captures UTM, gclid, fbclid; honeypot, rate limit, origin allowlist.
- [ ] CSV: column auto-match + confirm, dedupe on import, summary (created/merged/skipped), ≤10k rows.

## Data model / API / job changes
- Per-project form key; `POST /api/forms/[key]` (public, CORS for allowlisted origins) → `ingestLead` (source website).
- Snippet: static script served by the app; reads form fields + UTM/click ids.
- `csv.import` job: parse in memory, auto-match columns, run `ingestLead` (source csv) per row, store summary.
- Descriptors: website = `snippet` step, csv = `upload` + `mapping` steps (rendered by F14b wizard).

## Files touched
- A (Alex): src/modules/integrations/website/*, src/modules/integrations/csv/*, src/app/api/forms/[key]/*, public/forms.js, tests/fixtures/website/*, tests/fixtures/csv/*

## Dependencies
F4a, F1d.

## Edge cases
- Origin not allowlisted, honeypot filled, or rate limit hit → rejected silently (204).
- Row with neither phone nor email → skipped with reason.
- UTF-8 BOM, Arabic names, `;` delimiter, duplicate rows in the same file.
- File over 10k rows → refused before import.

## Out of scope
File storage (R2), scheduled imports, manual "Add lead".

## Test plan
- Snippet POST fixtures: valid, spam, wrong origin, burst.
- CSV fixtures: duplicates, Arabic, BOM, bad rows → correct summary counts.
