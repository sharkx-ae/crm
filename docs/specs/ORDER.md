# ORDER · build order, full-stack ownership

- Day 1 = Fri 20 Nov 2026 · Day 3 = Sun 22 Nov (today's baseline) · Day 14 = Thu 3 Dec · Day 21 = Thu 10 Dec. Calendar days, weekends included.
- **Alex** and **John** each own whole features: screen, Server Action, api route, service, schema, tests. Nobody waits for the other half of a feature.
- **Priority:** Phase 1 Base portal (sign-in, invites, reset password, role dashboards) → Phase 2 WhatsApp → Phase 3 lead sources → Phase 4 work the leads → Phase 5 close the loop → hardening. Phases overlap only where the two devs work in parallel.
- Re-baselined from D3 (F1b was in progress, F2a not started). Estimates, not promises: feature freeze lands about D19 (was D18); see "Risks".

> **F1 delivered (D3):** see [F1-technical-plan.md](F1-technical-plan.md). John: `getSession`/`requireSession`, `defineAction`, `inviteUser`/`setUserStatus`/`getUsers` and `inviteUserTx` (for F2b `createProject`, call `deliver()` after commit) are ready; `GET /audit` is ready for F1e. Local setup: both apps need the same `INTERNAL_API_TOKEN`.

## Phase 1 · Base portal (Release 1, demo D10)
Demo script: super admin signs in with a code → creates a client → invites its first user → the user accepts, sets a password, signs in and lands on its own dashboard; a manager is invited; a password is reset; every step is in the audit table.

| Start | End | Spec | Owner | Depends on |
|---|---|---|---|---|
| D3 | D4 | [F1b Schema, RLS, tenant helpers](F1b-schema-rls.md) | Alex | F1a |
| D3 | D4 | [F2a Shell, tokens, i18n/RTL, role-gated nav](F2a-shell-i18n.md) | John | F1a |
| D5 | D7 | [F1c Access: sign-in, code, reset, invites, roles](F1c-auth.md) | Alex | F1b |
| D5 | D6 | [F4a Lead engine and seed](F4a-lead-engine.md) | John | F1b |
| D7 | D7 | [F2b Workspace: clients home, create client, team, settings](F2b-clients-projects.md) | John | F2a, F1b (invite action from F1c S4) |
| D8 | D8 | [F1d Audit writes, queue, email, limits, alerts](F1d-queue-audit.md) | Alex | F1b |
| D8 | D8 | [F10a Client dashboard foundation + client users](F10a-client-workspace.md) | John | F2a, F1c |
| D9 | D10 | [F4b Leads screen, drawer, contacts](F4b-leads-ui.md) | John | F4a, F2a |
| D11 | D11 | [F13a Overview (staff and client)](F13a-overview-agency.md) | John | F4b |

## Phase 2 · WhatsApp (Alex, one feature end to end)
| Start | End | Spec | Owner | Depends on |
|---|---|---|---|---|
| D9 | D9 | [F3a Onboarding + webhook](F3a-whatsapp-onboarding.md) | Alex | F1d |
| D10 | D11 | [F3b History sync, ingest, linking](F3b-whatsapp-sync.md) | Alex | F3a, F4a |
| D12 | D13 | [F3c Inbox UI](F3c-inbox-ui.md) | Alex | F4b, F3b |

## Phase 3 · Lead sources
| Start | End | Spec | Owner | Depends on |
|---|---|---|---|---|
| D12 | D12 | [F7 Website forms and CSV](F7-website-csv.md) | John | F4a, F1d |
| D13 | D13 | [F6 Google lead forms](F6-google.md) | John | F4a, F14b |
| D14 | D14 | [F14b Hub UI and connect wizard](F14b-hub-ui.md) | Alex | F2a, F1d |
| D15 | D16 | [F5 Meta Lead Ads](F5-meta-lead-ads.md) | Alex | F3a, F4a, F14b |

Note: F6 needs the F14b wizard (D14), so John builds F6 on fixtures D13 and wires the wizard after D14.

## Phase 4 · Work the leads (John)
| Start | End | Spec | Owner | Depends on |
|---|---|---|---|---|
| D14 | D14 | [F8a Stages and kanban](F8a-stages-kanban.md) | John | F2b, F4b |
| D15 | D15 | [F8b Tasks and reminders](F8b-tasks-reminders.md) | John | F8a, F1d |
| D17 | D17 | [F12 Routing and automation](F12-routing-automation.md) | John | F8b, F3b |

## Phase 5 · Close the loop
| Start | End | Spec | Owner | Depends on |
|---|---|---|---|---|
| D16 | D16 | [F10b Client marking, export, qualification settings](F10b-marking-settings.md) | John | F10a, F11a (stub the outbox until D17) |
| D17 | D17 | [F11a Outbox and Meta CAPI](F11a-outbox-meta-capi.md) | Alex | F1d, F4b |
| D18 | D18 | [F11b Google Data Manager and mapping](F11b-google-dm-mapping.md) | Alex | F11a |
| D19 | D19 | [F14a Health, events, alerts](F14a-health-events.md) | Alex | F1d |
| D18 | D18 | [F13b Reports](F13b-reports.md) | John | F13a |
| D19 | D19 | [F1e Audit log viewer](F1e-audit-viewer.md) | John | F1d, F2a |

## Hardening and handover
| Start | End | Spec | Owner | Depends on |
|---|---|---|---|---|
| D20 | D21 | [F9a Adapter interface and TikTok](F9a-adapters-tiktok.md) + [F9b LinkedIn and Snapchat](F9b-linkedin-snapchat.md) | John | F4a, F14b |
| D20 | D21 | [F15a Security and fixture suites](F15a-security-fixtures.md) | Alex | F1b, F3b, F5 |
| D22 | D22 | [F2c Arabic/French and RTL QA](F2c-ar-fr-rtl.md) | John | F13b |
| D22 | D23 | [F15b Playwright smoke flows](F15b-playwright.md) | John | F13b, F10b |
| D21 | D23 | [F15c Staging, backups, handover, demo](F15c-staging-handover-demo.md) | Both | F15a, F15b |
| D24 | D30 | [F15d UAT and production](F15d-uat-production.md) | Both | F15c |

## Who owns what (about 70 h each)
- **Alex:** database and RLS, Access (sign-in, code, reset, invites, roles), audit/queue/email, WhatsApp, hub and wizard, Meta Lead Ads, conversion feedback, health and alerts, security suite.
- **John:** shell and i18n, workspace (clients, team, client users, settings), client dashboard, lead engine, leads/contacts/overview/reports, website/CSV, Google, pipeline/tasks, client marking, automation, audit viewer, TikTok/LinkedIn/Snapchat, Playwright.

## Critical cross-dev links
- F1b → everything: every new tenant table declares its `client_access` (ARCHITECTURE §4).
- F1c S4 (invites, D6) → F2b and F10a: John calls Alex's `inviteUser` action; until it lands John stubs it behind the same contract.
- F4a `ingestLead` must be real by D6 for every adapter (WhatsApp D9, Meta D15, Google D13).
- F14b wizard (D14) → F5 and F6.
- F11a outbox (D17) ← F10b marking writes the outbox rows; John stubs until then.

## Risks
- **Meta App Review:** WhatsApp submission moves from D9 to about D11, lead retrieval from D12 to about D16. Mitigation: Alex registers the Meta developer app and starts Tech Provider paperwork on D3; SHARKX business verification must be underway (CONTACT-SHARKX day 1).
- **Capacity:** both devs are booked to about D19. If the freeze must stay D18, cut F9b (LinkedIn/Snapchat) to post-launch: it is fixture-only and awaiting platform access anyway.
- `docs/plan-data.js` and `docs/plan.html` still show the old days and owners; re-sync them from this table.

## Releases
- **R1 (D10):** base portal and seeded dashboards.
- **R2 (D16):** WhatsApp, website/CSV, Google, Meta, hub, pipeline, tasks.
- **R3 (D19):** client marking, conversion feedback, health, automation, reports, audit viewer.
- D20–23 hardening and the TikTok/LinkedIn/Snapchat fixtures; D24–30 UAT and production.

## External milestones (not build work)
- Meta App Review: WhatsApp about D11, lead retrieval about D16.
- LinkedIn, TikTok, Snapchat access requests: D1–5 (no SLA for LinkedIn).
