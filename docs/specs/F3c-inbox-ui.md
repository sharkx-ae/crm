# F3c · WhatsApp inbox UI
Owner: A (Alex) · full stack (web + api + db + tests) · Days 12–13 · Release 2 · Tracker: F3.6, F3.7 · PRD: [F3](../PRD.md#f3)

> Ownership changed: A (Alex) builds this feature end to end, web and api. Where "Files touched" below splits files between A and B, read it as a list of paths only.

## Goal
The team reads every tracked chat in one read-only inbox. A client user reads its own client's chats in the same inbox, read-only.

## Acceptance criteria
- [ ] Inbox is read-only: tabs Unread/All, number chips, search, thread, MQL/SQL/Not qualified buttons; no send box; media shown as typed placeholder.
- [ ] Assign and internal notes are done in the lead drawer (F4b), SHARKX only; the inbox shows neither.

## Data model / API / job changes
- Reads wa_conversations/wa_messages through the whatsapp module's exported read functions (Alex).
- Notes in `notes`; assignment via leads service (`lead.assign`, audit).
- Refresh via SWR interval until F14a's events endpoint; then change_feed `message` kind.
- Unread = inbound messages after the viewer's last open of that chat.

## Files touched
- B (John): src/app/[locale]/(app)/p/[projectId]/inbox/*, src/components/inbox/*, src/modules/leads (notes), messages/en/inbox.json
- A (Alex): whatsapp read exports (added in F3b)

## Dependencies
F4b; F3b runs in parallel (build against `tests/fixtures/whatsapp` until it merges).

## Edge cases
- Long threads paginate upward; day separators in project time zone.
- Chat on a disconnected number stays readable with a banner.
- Notes, assignment and owner are never returned to client users (API projection and RLS) or included in exports.
- Mobile: list → thread → details as stacked views.

## Out of scope
Composer/sending, starred chats, keyboard shortcuts, media download.

## Test plan
- Component tests: tabs counts, number filter, search.
- Permission: a client user of another client gets nothing; a client user never receives notes or owners.
