# F11b · Google Data Manager sender and mapping table
Owner: A (Alex) · full stack (web + api + db + tests) · Days 18–18 · Release 3 · Tracker: F11.3, F11.4 · PRD: [F11](../PRD.md#f11)

## Goal
Status changes also reach Google Ads, and each client controls which statuses are sent to which platform.

## Acceptance criteria
- [ ] Mapping table per client (New, MQL, SQL, Not qualified → Meta event / Google event) with on/off toggles.
- [ ] Google Data Manager API (gclid / enhanced conversion).

## Data model / API / job changes
- `conversion_mappings` defaults created per project (mockup values minus Won).
- Google sender in `conversion.send`: Data Manager API with the OAuth grant from F6; destination = client's Ads account + conversion action id; no developer token.
- Settings page "Conversion feedback" (mockup) shows the mapping toggles.

## Files touched
- A (Alex): src/modules/conversion/google/*, tests/fixtures/google-dm/*
- B (John): settings page src/app/[locale]/(app)/p/[projectId]/settings/feedback/*, built by Alex in its own commit that John looks over

## Dependencies
F11a.

## Edge cases
- No gclid and no email/phone → skipped for Google.
- Conversion action missing in the client's account → failed with a readable reason.
- Toggle off mid-retry → pending rows for that mapping are skipped.

## Out of scope
Google Ads API offline imports, Won/value events (Extra).

## Test plan
- Google sender against fixtures; skip rules.
- Mapping toggle test: disabled status creates no rows.
