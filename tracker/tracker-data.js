window.TRACKER = {
"now":"F10a built, awaiting review; Phase 3 complete",
"lastActivity":{"time":"2026-11-25T16:32:10.296Z","file":"(turn finished)"},
"features":[
{"id":"F1","name":"Foundation and access","spec":"docs/PRD.md#f1","owner":"A","subs":[
{"id":"F1.1","name":"Repo, CI, Railway staging and prod, env validation, health endpoint","status":"blocked","pct":0,"note":"Railway admin pending (unconfirmed); skipped for now","updated":"2026-11-22T17:13:00.618Z"},
{"id":"F1.2","name":"Schema, RLS roles, tenant helpers, isolation tests","status":"done","pct":100,"note":"Independent review passed; 2 bugs fixed","updated":"2026-11-22T17:06:38.221Z"},
{"id":"F1.3","name":"Login, sessions, password reset","status":"done","pct":100,"note":"Independent review passed; 2 bugs fixed","updated":"2026-11-22T17:06:38.312Z"},
{"id":"F1.4","name":"Emailed-code 2FA","status":"done","pct":100,"note":"Independent review passed; 2 bugs fixed","updated":"2026-11-22T17:06:38.396Z"},
{"id":"F1.5","name":"Roles, can() matrix, invites","status":"done","pct":100,"note":"Independent review passed; 2 bugs fixed","updated":"2026-11-22T17:06:38.472Z"},
{"id":"F1.6","name":"Audit log writes and Admin viewer","status":"doing","pct":60,"note":"Review passed; audit writes, GET /audit done; viewer F1e","updated":"2026-11-22T17:06:38.697Z"},
{"id":"F1.7","name":"pg-boss queue, worker service, retries","status":"done","pct":100,"note":"Independent review passed; 2 bugs fixed","updated":"2026-11-22T17:06:38.547Z"},
{"id":"F1.8","name":"Rate limits, security headers, error alerts","status":"done","pct":100,"note":"Independent review passed; 2 bugs fixed","updated":"2026-11-22T17:06:38.618Z"},
{"id":"F1.9","name":"Shared contracts frozen (Zod, tables, jobs)","status":"done","pct":100,"note":"Contracts 1.0.0 on main; CI result unchecked","updated":"2026-11-19T12:30:42.804Z"}
]},
{"id":"F2","name":"App shell and projects","spec":"docs/PRD.md#f2","owner":"B","subs":[
{"id":"F2.1","name":"Shell, design tokens, nav, project switcher","status":"done","pct":100,"note":"Shell, guards, projects api, auth restyle, e2e done","updated":"2026-11-24T17:30:37.002Z"},
{"id":"F2.2","name":"i18n framework, RTL, logical CSS","status":"done","pct":100,"note":"Framework, RTL, saved locale done; strings are F2.6","updated":"2026-11-24T17:32:39.440Z"},
{"id":"F2.3","name":"Clients home cards","status":"done","pct":100,"note":"Clients home: KPI strip, table, search, matches seed","updated":"2026-11-24T19:32:49.404Z"},
{"id":"F2.4","name":"New-project wizard and default pipeline","status":"done","pct":100,"note":"Add client: 4 fields, atomic create, 2 audit rows","updated":"2026-11-24T19:32:49.482Z"},
{"id":"F2.5","name":"Agency settings and business hours","status":"done","pct":100,"note":"Team page, settings tabs, business hours","updated":"2026-11-24T19:32:49.566Z"},
{"id":"F2.6","name":"Arabic and French strings, RTL QA","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
]},
{"id":"F3","name":"WhatsApp tracking","spec":"docs/PRD.md#f3","owner":"A","subs":[
{"id":"F3.1","name":"Meta app, Embedded Signup v4 QR onboarding","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F3.2","name":"Webhook receiver, signature, raw store","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F3.3","name":"History sync (6 months, 24 h window)","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F3.4","name":"Live both-side message ingest","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F3.5","name":"Chat to contact and lead linking","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F3.6","name":"Inbox UI (list, thread, details)","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F3.7","name":"Assign chats and internal notes","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F3.8","name":"Number health and inactivity alerts","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
]},
{"id":"F4","name":"Lead engine and contacts","spec":"docs/PRD.md#f4","owner":"B","subs":[
{"id":"F4.1","name":"ingestLead, phone normalisation, dedupe","status":"done","pct":100,"note":"ingestLead: E.164, dedupe, merge, idempotent, 24 tests","updated":"2026-11-24T18:29:29.386Z"},
{"id":"F4.2","name":"Per-form field mapping model and UI","status":"done","pct":100,"note":"saveFormMapping route, action, MappingStep component","updated":"2026-11-24T18:40:29.049Z"},
{"id":"F4.3","name":"Round-robin assignment","status":"done","pct":100,"note":"Round-robin cursor per client, active managers only","updated":"2026-11-24T18:29:29.587Z"},
{"id":"F4.4","name":"Leads screen (tabs, filters, export)","status":"doing","pct":40,"note":"Leads api done: list, status, assign, export","updated":"2026-11-25T15:57:45.444Z"},
{"id":"F4.5","name":"Lead drawer and timeline","status":"done","pct":100,"note":"Drawer, marking, owner, timeline, client view done","updated":"2026-11-25T16:55:29.739Z"},
{"id":"F4.6","name":"Contacts list and profile","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F4.7","name":"Test-lead flag","status":"done","pct":100,"note":"Flag stored; exclusion is checked in F4b, F13, F11a","updated":"2026-11-24T18:51:35.217Z"}
]},
{"id":"F5","name":"Meta Lead Ads","spec":"docs/PRD.md#f5","owner":"A","subs":[
{"id":"F5.1","name":"OAuth connect, page and form selection","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F5.2","name":"Leadgen webhook and lead retrieval","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F5.3","name":"Token encryption, expiry, reconnect","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F5.4","name":"Dev-mode testing tool and fixtures","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
]},
{"id":"F6","name":"Google Ads and YouTube lead forms","spec":"docs/PRD.md#f6","owner":"A","subs":[
{"id":"F6.1","name":"Google OAuth, account and form selection","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F6.2","name":"Lead-form webhook receiver","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F6.3","name":"Mapping, health, reconnect, fixtures","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
]},
{"id":"F7","name":"Website forms and CSV import","spec":"docs/PRD.md#f7","owner":"A","subs":[
{"id":"F7.1","name":"Snippet and public form endpoint","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F7.2","name":"Spam guard, origin allowlist, attribution capture","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F7.3","name":"CSV import with mapping and dedupe","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
]},
{"id":"F8","name":"Pipeline and tasks","spec":"docs/PRD.md#f8","owner":"B","subs":[
{"id":"F8.1","name":"Custom stage editor","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F8.2","name":"Kanban board","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F8.3","name":"Tasks","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F8.4","name":"Reminders","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F8.5","name":"Overdue follow-ups feed","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
]},
{"id":"F9","name":"TikTok, LinkedIn, Snapchat","spec":"docs/PRD.md#f9","owner":"A","subs":[
{"id":"F9.1","name":"Adapter interface and connect descriptors","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F9.2","name":"TikTok adapter","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F9.3","name":"LinkedIn adapter","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F9.4","name":"Snapchat adapter","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
]},
{"id":"F10","name":"Client lead link","spec":"docs/PRD.md#f10","owner":"B","subs":[
{"id":"F10.1","name":"Token issue, revoke, regenerate","status":"done","pct":100,"note":"Client users tab: invite, disable, enable","updated":"2026-11-25T13:04:35.935Z"},
{"id":"F10.2","name":"Lead-link domain routing and middleware","status":"done","pct":100,"note":"Full guard matrix, real-api client e2e","updated":"2026-11-25T13:04:35.866Z"},
{"id":"F10.3","name":"Portal view","status":"done","pct":100,"note":"Lead and overview projections, allowlist tests","updated":"2026-11-25T13:04:36.016Z"},
{"id":"F10.4","name":"Marking with reasons","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F10.5","name":"Export and permission toggles","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F10.6","name":"Link and qualification settings","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
]},
{"id":"F11","name":"Conversion feedback","spec":"docs/PRD.md#f11","owner":"A","subs":[
{"id":"F11.1","name":"Outbox and send job with retries","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F11.2","name":"Meta Conversions API sender","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F11.3","name":"Google Data Manager sender","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F11.4","name":"Mapping table and toggles","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F11.5","name":"Event log and failure alerts","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
]},
{"id":"F12","name":"Routing and automation","spec":"docs/PRD.md#f12","owner":"B","subs":[
{"id":"F12.1","name":"Rule model and engine","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F12.2","name":"Actions: assign, notify, task, stage","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F12.3","name":"Response-time alerts","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F12.4","name":"Rules UI","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F12.5","name":"Business-hours timers","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
]},
{"id":"F13","name":"Reports and agency dashboard","spec":"docs/PRD.md#f13","owner":"B","subs":[
{"id":"F13.1","name":"Overview KPIs and charts","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F13.2","name":"Reports: funnel, source, campaign, agents","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F13.3","name":"Report CSV export","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F13.4","name":"Agency-wide view","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
]},
{"id":"F14","name":"Integrations hub and live updates","spec":"docs/PRD.md#f14","owner":"A","subs":[
{"id":"F14.1","name":"Health model and 5-minute checks","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F14.2","name":"Hub UI and cross-client table","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F14.3","name":"Reconnect and test lead","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F14.4","name":"Polling events endpoint and bell","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F14.5","name":"Alert emails","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F14.6","name":"Generic connect wizard UI","status":"todo","pct":0,"note":"","updated":"2026-11-19T08:56:36.393Z"}
]},
{"id":"F15","name":"Testing, deploy and handover","spec":"docs/PRD.md#f15","owner":"A+B","subs":[
{"id":"F15.1","name":"CI/CD and staging deploy","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F15.2","name":"Security and isolation suite","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F15.3","name":"Adapter fixture suite","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F15.4","name":"Playwright smoke flows","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F15.5","name":"Seed demo data","status":"done","pct":100,"note":"db:seed: 5 clients, 64 leads, expected.json frozen","updated":"2026-11-24T18:40:29.241Z"},
{"id":"F15.6","name":"Backups and restore drill","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F15.7","name":"Handover docs and training","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F15.8","name":"UAT checklist and production go-live","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
]}
],
"log":[
{"t":"2026-11-23T12:15:49.864Z","m":"F2.1 doing 15% Tokens done; shell, nav, switcher next"},
{"t":"2026-11-23T12:15:49.952Z","m":"F2.2 doing 60% Lint checks, formatters, catalogs done; RTL pending"},
{"t":"2026-11-24T13:40:48.978Z","m":"F2.1 doing 45% Tokens, base components, overlays done; shell next"},
{"t":"2026-11-24T13:40:49.256Z","m":"F2.2 doing 70% RTL-safe components, direction provider done; AR strings later"},
{"t":"2026-11-24T15:14:38.261Z","m":"F2.1 doing 85% Shell, nav guard, switcher, projects api done; auth restyle next"},
{"t":"2026-11-24T15:14:38.347Z","m":"F2.2 doing 90% Language menu saves locale; AR/FR strings in F2c"},
{"t":"2026-11-24T17:30:37.002Z","m":"F2.1 done 100% Shell, guards, projects api, auth restyle, e2e done"},
{"t":"2026-11-24T17:30:37.087Z","m":"F2.2 doing 90% Saved locale applied at sign-in; AR/FR strings in F2c"},
{"t":"2026-11-24T17:32:39.440Z","m":"F2.2 done 100% Framework, RTL, saved locale done; strings are F2.6"},
{"t":"2026-11-24T18:23:09.931Z","m":"F4.1 doing 10% Phase 1 started: phone normalisation"},
{"t":"2026-11-24T18:29:29.386Z","m":"F4.1 done 100% ingestLead: E.164, dedupe, merge, idempotent, 24 tests"},
{"t":"2026-11-24T18:29:29.587Z","m":"F4.3 done 100% Round-robin cursor per client, active managers only"},
{"t":"2026-11-24T18:29:29.837Z","m":"F4.7 doing 60% is_test stored; no assign or notify; reports later"},
{"t":"2026-11-24T18:40:29.049Z","m":"F4.2 done 100% saveFormMapping route, action, MappingStep component"},
{"t":"2026-11-24T18:40:29.241Z","m":"F15.5 done 100% db:seed: 5 clients, 64 leads, expected.json frozen"},
{"t":"2026-11-24T18:40:29.432Z","m":"F4.7 doing 80% Flag, no assign/notify, seed; reports filter later"},
{"t":"2026-11-24T18:51:35.217Z","m":"F4.7 done 100% Flag stored; exclusion is checked in F4b, F13, F11a"},
{"t":"2026-11-24T19:10:11.949Z","m":"F2.3 doing 5% Phase 2 started: audit count, contract, home api"},
{"t":"2026-11-24T19:14:40.515Z","m":"F2.3 doing 50% Home aggregates api matches seed; UI next"},
{"t":"2026-11-24T19:14:40.587Z","m":"F2.4 doing 50% Create client api: atomic, 2 audit rows"},
{"t":"2026-11-24T19:32:49.404Z","m":"F2.3 done 100% Clients home: KPI strip, table, search, matches seed"},
{"t":"2026-11-24T19:32:49.482Z","m":"F2.4 done 100% Add client: 4 fields, atomic create, 2 audit rows"},
{"t":"2026-11-24T19:32:49.566Z","m":"F2.5 done 100% Team page, settings tabs, business hours"},
{"t":"2026-11-25T12:54:39.043Z","m":"F10.2 doing 10% Phase 3 started: guard matrix"},
{"t":"2026-11-25T13:04:35.866Z","m":"F10.2 done 100% Full guard matrix, real-api client e2e"},
{"t":"2026-11-25T13:04:35.935Z","m":"F10.1 done 100% Client users tab: invite, disable, enable"},
{"t":"2026-11-25T13:04:36.016Z","m":"F10.3 done 100% Lead and overview projections, allowlist tests"},
{"t":"2026-11-25T15:28:47.665Z","m":"F4.4 doing 10% Building leads list api"},
{"t":"2026-11-25T15:57:45.444Z","m":"F4.4 doing 40% Leads api done: list, status, assign, export"},
{"t":"2026-11-25T16:55:29.739Z","m":"F4.5 done 100% Drawer, marking, owner, timeline, client view done"}
]
};
