# STATUS · seed for the tracker

F-ids are canonical. Format: `## F<n> | name | owner | spec` then `- F<n>.<m> | sub-feature | status`. `Specs:` lines map sub-features to spec files (`docs/specs/<spec>-*.md`); build order in `docs/specs/ORDER.md`. Owners: A = Alex, B = John. Live status: `node scripts/track.js list`.

## F1 | Foundation and access | A | docs/PRD.md#f1
Specs: F1a (F1.1, F1.9, Both) · F1b (F1.2) · F1c (F1.3–F1.5) · F1d (F1.6 writes, F1.7, F1.8) · F1e (F1.6 viewer)
- F1.1 | Repo, CI, Railway staging and prod, env validation, health endpoint | todo
- F1.2 | Schema, RLS roles, tenant helpers, isolation tests | todo
- F1.3 | Login, sessions, password reset | todo
- F1.4 | Emailed-code 2FA | todo
- F1.5 | Roles, can() matrix, invites | todo
- F1.6 | Audit log writes and super admin viewer | todo
- F1.7 | pg-boss queue, worker service, retries | todo
- F1.8 | Rate limits, security headers, error alerts | todo
- F1.9 | Shared contracts frozen (Zod, tables, jobs) | todo

## F2 | App shell and projects | B | docs/PRD.md#f2
Specs: F2a (F2.1, F2.2) · F2b (F2.3–F2.5) · F2c (F2.6)
- F2.1 | Shell, design tokens, nav, project switcher | todo
- F2.2 | i18n framework, RTL, logical CSS | todo
- F2.3 | Clients home cards | todo
- F2.4 | New-project wizard and default pipeline | todo
- F2.5 | Team (managers) and business hours | todo
- F2.6 | Arabic and French strings, RTL QA | todo

## F3 | WhatsApp tracking | A | docs/PRD.md#f3
Specs: F3a (F3.1, F3.2) · F3b (F3.3–F3.5, F3.8) · F3c (F3.6, F3.7)
- F3.1 | Meta app, Embedded Signup v4 QR onboarding | todo
- F3.2 | Webhook receiver, signature, raw store | todo
- F3.3 | History sync (6 months, 24 h window) | todo
- F3.4 | Live both-side message ingest | todo
- F3.5 | Chat to contact and lead linking | todo
- F3.6 | Inbox UI (list, thread, details) | todo
- F3.7 | Assign chats and internal notes | todo
- F3.8 | Number health and inactivity alerts | todo

## F4 | Lead engine and contacts | B | docs/PRD.md#f4
Specs: F4a (F4.1–F4.3, F4.7, + F15.5 seed) · F4b (F4.4–F4.6)
- F4.1 | ingestLead, phone normalisation, dedupe | todo
- F4.2 | Per-form field mapping model and UI | todo
- F4.3 | Round-robin assignment | todo
- F4.4 | Leads screen (tabs, filters, export) | todo
- F4.5 | Lead drawer and timeline | todo
- F4.6 | Contacts list and profile | todo
- F4.7 | Test-lead flag | todo

## F5 | Meta Lead Ads | A | docs/PRD.md#f5
Specs: F5 (F5.1–F5.4)
- F5.1 | OAuth connect, page and form selection | todo
- F5.2 | Leadgen webhook and lead retrieval | todo
- F5.3 | Token encryption, expiry, reconnect | todo
- F5.4 | Dev-mode testing tool and fixtures | todo

## F6 | Google Ads and YouTube lead forms | B | docs/PRD.md#f6
Specs: F6 (F6.1–F6.3)
- F6.1 | Google OAuth, account and form selection | todo
- F6.2 | Lead-form webhook receiver | todo
- F6.3 | Mapping, health, reconnect, fixtures | todo

## F7 | Website forms and CSV import | B | docs/PRD.md#f7
Specs: F7 (F7.1–F7.3)
- F7.1 | Snippet and public form endpoint | todo
- F7.2 | Spam guard, origin allowlist, attribution capture | todo
- F7.3 | CSV import with mapping and dedupe | todo

## F8 | Pipeline and tasks | B | docs/PRD.md#f8
Specs: F8a (F8.1, F8.2) · F8b (F8.3–F8.5)
- F8.1 | Custom stage editor | todo
- F8.2 | Kanban board | todo
- F8.3 | Tasks | todo
- F8.4 | Reminders | todo
- F8.5 | Overdue follow-ups feed | todo

## F9 | TikTok, LinkedIn, Snapchat | B | docs/PRD.md#f9
Specs: F9a (F9.1, F9.2) · F9b (F9.3, F9.4)
- F9.1 | Adapter interface and connect descriptors | todo
- F9.2 | TikTok adapter | todo
- F9.3 | LinkedIn adapter | todo
- F9.4 | Snapchat adapter | todo

## F10 | Client dashboard | B | docs/PRD.md#f10
Specs: F10a (F10.1–F10.3) · F10b (F10.4–F10.6)
- F10.1 | Client users: invite, list, disable | todo
- F10.2 | Client workspace: role-gated shell and nav | todo
- F10.3 | Client leads view (client-safe fields) | todo
- F10.4 | Marking with reasons | todo
- F10.5 | Client CSV export | todo
- F10.6 | Qualification settings (definitions, reasons) | todo

## F11 | Conversion feedback | A | docs/PRD.md#f11
Specs: F11a (F11.1, F11.2, F11.5) · F11b (F11.3, F11.4)
- F11.1 | Outbox and send job with retries | todo
- F11.2 | Meta Conversions API sender | todo
- F11.3 | Google Data Manager sender | todo
- F11.4 | Mapping table and toggles | todo
- F11.5 | Failure alerts | todo

## F12 | Routing and automation | B | docs/PRD.md#f12
Specs: F12 (F12.1–F12.5)
- F12.1 | Rule model and engine | todo
- F12.2 | Actions: assign, notify, task, stage | todo
- F12.3 | Response-time alerts | todo
- F12.4 | Rules UI | todo
- F12.5 | Business-hours timers | todo

## F13 | Reports and agency dashboard | B | docs/PRD.md#f13
Specs: F13a (F13.1, F13.4) · F13b (F13.2, F13.3)
- F13.1 | Overview KPIs and charts | todo
- F13.2 | Reports: source and campaign | todo
- F13.3 | Report CSV export (cut for this phase) | todo
- F13.4 | Agency-wide view | todo

## F14 | Integrations hub and live updates | A | docs/PRD.md#f14
Specs: F14a (F14.1, F14.4 endpoint, F14.5) · F14b (F14.2, F14.3, F14.4 bell, F14.6)
- F14.1 | Health model and 5-minute checks | todo
- F14.2 | Hub UI (platform cards) | todo
- F14.3 | Reconnect and test lead | todo
- F14.4 | Polling events endpoint and bell | todo
- F14.5 | Alert emails | todo
- F14.6 | Generic connect wizard UI | todo

## F15 | Testing, deploy and handover | A+B | docs/PRD.md#f15
Specs: F15a (F15.2, F15.3, A) · F15b (F15.4, B) · F15c (F15.1, F15.6, F15.7, Both) · F15d (F15.8, Both) · F15.5 seed lives in F4a
- F15.1 | CI/CD and staging deploy | todo
- F15.2 | Security and isolation suite | todo
- F15.3 | Adapter fixture suite | todo
- F15.4 | Playwright smoke flows | todo
- F15.5 | Seed demo data | todo
- F15.6 | Backups and restore drill | todo
- F15.7 | Handover docs and training | todo
- F15.8 | UAT checklist and production go-live | todo
