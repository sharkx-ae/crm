# F14b · Integrations hub UI, connect wizard, bell
Owner: A (Alex) · full stack (web + api + db + tests) · Days 14–14 · Release 2 · Tracker: F14.2, F14.3, F14.4 (bell), F14.6 · PRD: [F14](../PRD.md#f14)

> Ownership changed: A (Alex) builds this feature end to end, web and api. Where "Files touched" below splits files between A and B, read it as a list of paths only.

## Goal
One generic wizard connects every platform, and the hub shows each connection's state with one-click fixes.

## Acceptance criteria
- [ ] Per-client hub as one card per platform (authentic platform icon, health, account, last lead); one-click Reconnect; each adapter labelled Live / Fixture-verified / Awaiting access.
- [ ] Client users get their own client's hub: connect and reconnect.
- [ ] Bell: connection issues, new leads, new messages, task reminders (client users: connection issues, new leads, new messages).

## Data model / API / job changes
- Wizard renders adapter `connectDescriptor` steps (oauth, select, mapping, qr, snippet, upload) and calls Alex's wizard actions (CONTRACTS §4); mapping step reuses F4a's component.
- Hub reads integrations (status, mode, note, last_data_at); Reconnect = `startConnect` again.
- Bell reads notifications (unread count, mark read).

## Files touched
- B (John): src/app/[locale]/(app)/p/[projectId]/integrations/*, agency connections page, src/components/wizard/*, src/components/bell/*, src/modules/notifications/*, messages/en/integrations.json

## Dependencies
F2a, F1d.

## Edge cases
- Adapter in `awaiting` mode → Connect disabled with the reason.
- OAuth window closed or denied → wizard returns to the start step.
- QR step polls status until connected or timed out.
- Connecting needs `integration.manage` (all three roles, own client for clients) and the platform role itself (Page admin, Google Ads admin, Snapchat Org Admin…); a missing platform role shows a plain-words message.

## Out of scope
Ctrl+K, push/Slack notifications, platform logic (Alex's adapters).

## Test plan
- Wizard driven by fixture descriptors for every step kind.
- Hub ordering (broken first) and labels from seed integrations.
