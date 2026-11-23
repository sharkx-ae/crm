window.TRACKER = {
"now":"F1b-F1d built and independently reviewed; next F2a, F4a",
"lastActivity":{"time":"2026-11-23T14:34:40.014Z","file":"(turn finished)"},
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
{"id":"F2.1","name":"Shell, design tokens, nav, project switcher","status":"doing","pct":15,"note":"Tokens done; shell, nav, switcher next","updated":"2026-11-23T12:15:49.864Z"},
{"id":"F2.2","name":"i18n framework, RTL, logical CSS","status":"doing","pct":60,"note":"Lint checks, formatters, catalogs done; RTL pending","updated":"2026-11-23T12:15:49.952Z"},
{"id":"F2.3","name":"Clients home cards","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F2.4","name":"New-project wizard and default pipeline","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F2.5","name":"Agency settings and business hours","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
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
{"id":"F4.1","name":"ingestLead, phone normalisation, dedupe","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F4.2","name":"Per-form field mapping model and UI","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F4.3","name":"Round-robin assignment","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F4.4","name":"Leads screen (tabs, filters, export)","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F4.5","name":"Lead drawer and timeline","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F4.6","name":"Contacts list and profile","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F4.7","name":"Test-lead flag","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
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
{"id":"F10.1","name":"Token issue, revoke, regenerate","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F10.2","name":"Lead-link domain routing and middleware","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F10.3","name":"Portal view","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
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
{"id":"F15.5","name":"Seed demo data","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F15.6","name":"Backups and restore drill","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F15.7","name":"Handover docs and training","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"},
{"id":"F15.8","name":"UAT checklist and production go-live","status":"todo","pct":0,"note":"","updated":"2026-11-19T07:55:47.276Z"}
]}
],
"log":[
{"t":"2026-11-19T12:28:35.532Z","m":"F1.9 doing 10% Writing Zod contracts from CONTRACTS.md"},
{"t":"2026-11-19T12:30:42.804Z","m":"F1.9 done 100% Contracts 1.0.0 on main; CI result unchecked"},
{"t":"2026-11-19T12:57:40.289Z","m":"F1.2 doing 5% plan approved, building"},
{"t":"2026-11-22T12:22:58.272Z","m":"F1.2 doing 40% Schema, RLS and isolation suite committed"},
{"t":"2026-11-22T12:36:27.009Z","m":"F1.3 doing 15% Crypto, route guard, email done; sessions next"},
{"t":"2026-11-22T12:47:25.501Z","m":"F1.3 doing 40% api sign-in and web plumbing committed"},
{"t":"2026-11-22T12:47:25.652Z","m":"F1.4 doing 60% Emailed code api done; screen pending"},
{"t":"2026-11-22T12:49:40.074Z","m":"F1.5 doing 35% Roles, can() everywhere done; invites next"},
{"t":"2026-11-22T12:57:01.153Z","m":"F1.5 doing 60% Invites and user status api done"},
{"t":"2026-11-22T13:01:04.935Z","m":"F1.3 doing 70% Login and code screens, headers done"},
{"t":"2026-11-22T13:03:49.385Z","m":"F1.3 doing 90% Reset password done; seed and sweep left"},
{"t":"2026-11-22T13:06:22.830Z","m":"F1.2 done 100% Schema, RLS, isolation suite green"},
{"t":"2026-11-22T13:12:35.622Z","m":"F1.7 done 100% Queue, worker, retries, email job done"},
{"t":"2026-11-22T13:12:35.701Z","m":"F1.8 doing 70% Rate limits, alerts, headers done"},
{"t":"2026-11-22T13:20:35.636Z","m":"F1.3 done 100% Login, sessions, reset password done"},
{"t":"2026-11-22T13:20:35.720Z","m":"F1.4 done 100% Emailed-code 2FA done"},
{"t":"2026-11-22T13:20:35.824Z","m":"F1.5 done 100% Roles, can() matrix, invites done"},
{"t":"2026-11-22T13:20:35.931Z","m":"F1.6 doing 60% Audit writes and GET /audit done; viewer is F1e"},
{"t":"2026-11-22T13:20:36.026Z","m":"F1.8 done 100% Rate limits, headers, error alerts done"},
{"t":"2026-11-22T17:06:38.221Z","m":"F1.2 done 100% Independent review passed; 2 bugs fixed"},
{"t":"2026-11-22T17:06:38.312Z","m":"F1.3 done 100% Independent review passed; 2 bugs fixed"},
{"t":"2026-11-22T17:06:38.396Z","m":"F1.4 done 100% Independent review passed; 2 bugs fixed"},
{"t":"2026-11-22T17:06:38.472Z","m":"F1.5 done 100% Independent review passed; 2 bugs fixed"},
{"t":"2026-11-22T17:06:38.547Z","m":"F1.7 done 100% Independent review passed; 2 bugs fixed"},
{"t":"2026-11-22T17:06:38.618Z","m":"F1.8 done 100% Independent review passed; 2 bugs fixed"},
{"t":"2026-11-22T17:06:38.697Z","m":"F1.6 doing 60% Review passed; audit writes, GET /audit done; viewer F1e"},
{"t":"2026-11-22T17:06:38.898Z","m":"F1 independent review: 2 bugs fixed, report in docs/specs"},
{"t":"2026-11-22T17:13:00.618Z","m":"F1.1 blocked 0% Railway admin pending (unconfirmed); skipped for now"},
{"t":"2026-11-23T12:15:49.864Z","m":"F2.1 doing 15% Tokens done; shell, nav, switcher next"},
{"t":"2026-11-23T12:15:49.952Z","m":"F2.2 doing 60% Lint checks, formatters, catalogs done; RTL pending"}
]
};
