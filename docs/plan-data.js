window.PLAN = {
"start":"2026-11-20","days":30,"buildDays":23,
"devs":{"A":"Alex","B":"John"},
"releases":[
{"key":1,"name":"Release 1 · Base portal","due":10,"what":"People can sign in and be invited. The agency creates clients, and each client sees its own dashboard, leads and contacts."},
{"key":2,"name":"Release 2 · Lead sources and follow-up","due":16,"what":"Leads arrive from WhatsApp, Meta, Google, website forms and CSV, and the team works them with a pipeline and tasks."},
{"key":3,"name":"Release 3 · Close the loop","due":19,"what":"Clients mark leads MQL / SQL / Not qualified, results go back to Meta and Google, plus automation, reports and the audit log."},
{"key":4,"name":"Release 4 · TikTok, LinkedIn, Snapchat","due":21,"what":"The three remaining lead connectors. This is the last new feature; after it the work is testing and fixes only."}
],
"milestones":[
{"day":10,"label":"Release 1 · base portal"},
{"day":16,"label":"Release 2 · lead sources"},
{"day":18,"label":"Translation key freeze (last day to add new text)"},
{"day":19,"label":"Release 3 · close the loop"},
{"day":21,"label":"Release 4 · all connectors (last new feature)"},
{"day":23,"label":"Demo"},
{"from":20,"to":23,"label":"Testing · staging · handover"},
{"from":24,"to":30,"label":"UAT + production · outside the build","kind":"outside"}
],
"shared":[
{"name":"Daily 10-min sync","startDay":1,"endDay":23}
],
"specs":[
{"id":"F1a","name":"Project setup + shared contracts","what":"Repo, CI, hosting, and the shared data shapes the web app and the api both follow.","owner":"Both","startDay":1,"endDay":1,"release":1,"dependsOn":[],"subs":["F1.1","F1.9"]},
{"id":"F1b","name":"Database + client data isolation","what":"All tables, with the database itself stopping one client from reading another client's data.","owner":"A","startDay":3,"endDay":4,"release":1,"dependsOn":["F1a"],"subs":["F1.2"]},
{"id":"F1c","name":"Sign-in, emailed code, reset, invites","what":"Super admin invites managers, managers invite client users, and everyone signs in with password plus an emailed code.","owner":"A","startDay":5,"endDay":7,"release":1,"dependsOn":["F1b"],"subs":["F1.3","F1.4","F1.5"]},
{"id":"F1d","name":"Audit trail, background jobs, emails, limits","what":"Every action is recorded, background jobs retry, failures alert the team, and abuse is rate-limited.","owner":"A","startDay":8,"endDay":8,"release":1,"dependsOn":["F1b"],"subs":["F1.7","F1.8"],"note":"Audit writes (F1.6) also done here; the screen is the Audit log screen"},
{"id":"F3a","name":"WhatsApp: connect a number by QR","what":"A client's WhatsApp Business number connects with a QR scan, and Meta's messages are received safely.","owner":"A","startDay":9,"endDay":9,"release":2,"dependsOn":["F1d"],"subs":["F3.1","F3.2"]},
{"id":"F3b","name":"WhatsApp: history sync + live messages","what":"Six months of history and every new message (both sides) are stored once and linked to the right lead.","owner":"A","startDay":10,"endDay":11,"release":2,"dependsOn":["F3a","F4a"],"subs":["F3.3","F3.4","F3.5","F3.8"]},
{"id":"F3c","name":"WhatsApp: inbox screen","what":"A read-only inbox where the team and the client's users read every tracked chat.","owner":"A","startDay":12,"endDay":13,"release":2,"dependsOn":["F4b","F3b"],"subs":["F3.6","F3.7"]},
{"id":"F14b","name":"Integrations hub + connect wizard","what":"One screen showing every connector's status, and one wizard that connects any platform.","owner":"A","startDay":14,"endDay":14,"release":2,"dependsOn":["F2a","F1d"],"subs":["F14.2","F14.3","F14.6"]},
{"id":"F5","name":"Meta Lead Ads connector","what":"Facebook and Instagram lead forms deliver leads into the CRM within seconds.","owner":"A","startDay":15,"endDay":16,"release":2,"dependsOn":["F3a","F4a","F14b"],"subs":["F5.1","F5.2","F5.3","F5.4"]},
{"id":"F11a","name":"Send results to Meta (Conversions API)","what":"Every status change is sent to Meta within a minute, exactly once, with retries.","owner":"A","startDay":17,"endDay":17,"release":3,"dependsOn":["F1d","F4b"],"subs":["F11.1","F11.2","F11.5"]},
{"id":"F11b","name":"Send results to Google + settings","what":"Status changes also reach Google Ads, and each client chooses which statuses go to which platform.","owner":"A","startDay":18,"endDay":18,"release":3,"dependsOn":["F11a"],"subs":["F11.3","F11.4"]},
{"id":"F14a","name":"Connection health, alerts, live updates","what":"Every connection is checked every 5 minutes, screens update within seconds, and breakage emails the alert inbox.","owner":"A","startDay":19,"endDay":19,"release":3,"dependsOn":["F1d"],"subs":["F14.1","F14.4","F14.5"]},
{"id":"F15a","name":"Security + connector test suites","what":"Tests proving client isolation, permissions, webhook safety and every connector with recorded data.","owner":"A","startDay":20,"endDay":21,"release":null,"dependsOn":["F1b","F3b","F5","F9b"],"subs":["F15.2","F15.3"]},
{"id":"F2a","name":"App shell, branding, languages","what":"Navigation, SHARKX branding, and the English / Arabic / French and right-to-left framework.","owner":"B","startDay":3,"endDay":4,"release":1,"dependsOn":["F1a"],"subs":["F2.1","F2.2"]},
{"id":"F4a","name":"Lead engine + demo data","what":"One entry point turns a lead from any source into a de-duplicated, mapped, assigned lead. Demo data for every screen.","owner":"B","startDay":5,"endDay":6,"release":1,"dependsOn":["F1b"],"subs":["F4.1","F4.2","F4.3","F4.7","F15.5"]},
{"id":"F2b","name":"Clients, team, settings","what":"Create a client and invite its first user, manage the managers, set time zone and business hours.","owner":"B","startDay":7,"endDay":7,"release":1,"dependsOn":["F2a","F1b","F1c"],"subs":["F2.3","F2.4","F2.5"]},
{"id":"F10a","name":"Client dashboard + client users","what":"A client signs in to its own dashboard; staff invite, list and disable that client's users.","owner":"B","startDay":8,"endDay":8,"release":1,"dependsOn":["F2a","F1b","F1c"],"subs":["F10.1","F10.2","F10.3"]},
{"id":"F4b","name":"Leads list, lead drawer, contacts","what":"Find, filter, assign and export leads; open a lead for its full history; browse contacts.","owner":"B","startDay":9,"endDay":10,"release":1,"dependsOn":["F4a","F2a"],"subs":["F4.4","F4.5","F4.6"]},
{"id":"F13a","name":"Overview dashboard + agency view","what":"Each client's key numbers and charts, and one agency-wide view of new leads, unreplied chats and connection health.","owner":"B","startDay":11,"endDay":11,"release":1,"dependsOn":["F4b","F3b"],"subs":["F13.1","F13.4"]},
{"id":"F7","name":"Website forms + CSV import","what":"Any website form posts leads in through a copy-paste snippet, and old leads import from a CSV file.","owner":"B","startDay":12,"endDay":12,"release":2,"dependsOn":["F4a","F1d"],"subs":["F7.1","F7.2","F7.3"]},
{"id":"F6","name":"Google lead forms connector","what":"Google Search, YouTube and Demand Gen lead forms deliver leads into the CRM.","owner":"B","startDay":13,"endDay":13,"release":2,"dependsOn":["F4a","F14b"],"subs":["F6.1","F6.2","F6.3"]},
{"id":"F8a","name":"Pipeline stages + kanban board","what":"Each client gets its own stages, and the team drags leads across a kanban board.","owner":"B","startDay":14,"endDay":14,"release":2,"dependsOn":["F2b","F4b"],"subs":["F8.1","F8.2"]},
{"id":"F8b","name":"Tasks + reminders","what":"Follow-ups become tasks with due dates; reminders fire on time; overdue work is visible.","owner":"B","startDay":15,"endDay":15,"release":2,"dependsOn":["F8a","F1d"],"subs":["F8.3","F8.4","F8.5"]},
{"id":"F10b","name":"Client marks leads MQL / SQL / Not qualified","what":"Client users rate their leads (with a reason when not qualified), export CSV, and SHARKX sets the definitions.","owner":"B","startDay":16,"endDay":16,"release":3,"dependsOn":["F10a","F11a"],"subs":["F10.4","F10.5","F10.6"]},
{"id":"F12","name":"Routing + automation rules","what":"Leads are assigned automatically, slow replies raise alerts, and simple when/then rules run per client.","owner":"B","startDay":17,"endDay":17,"release":3,"dependsOn":["F8b","F3b"],"subs":["F12.1","F12.2","F12.3","F12.4","F12.5"]},
{"id":"F13b","name":"Reports by source + campaign","what":"Lead quality by source and campaign over 7, 30 or 90 days, for staff and for each client.","owner":"B","startDay":18,"endDay":18,"release":3,"dependsOn":["F13a"],"subs":["F13.2","F13.3"]},
{"id":"F1e","name":"Audit log screen","what":"The super admin sees who did what, where and when, with filters.","owner":"B","startDay":19,"endDay":19,"release":3,"dependsOn":["F1d","F2a"],"subs":["F1.6"]},
{"id":"F9a","name":"TikTok connector + shared connector shape","what":"TikTok lead forms deliver leads. Also extracts the one connector shape that LinkedIn and Snapchat reuse.","owner":"B","startDay":20,"endDay":20,"release":4,"dependsOn":["F4a","F14b"],"subs":["F9.1","F9.2"]},
{"id":"F9b","name":"LinkedIn + Snapchat connectors","what":"LinkedIn Lead Gen Forms and Snapchat lead ads deliver leads through the shared connector shape.","owner":"B","startDay":21,"endDay":21,"release":4,"dependsOn":["F9a"],"subs":["F9.3","F9.4"]},
{"id":"F2c","name":"Arabic + French text, right-to-left check","what":"Every screen and email is complete in Arabic and French and renders correctly right-to-left.","owner":"B","startDay":22,"endDay":22,"release":null,"dependsOn":["F13b"],"subs":["F2.6"]},
{"id":"F15b","name":"End-to-end browser tests","what":"Six automated browser flows prove the core loop and run on every build.","owner":"B","startDay":22,"endDay":23,"release":null,"dependsOn":["F13b","F10b"],"subs":["F15.4"]},
{"id":"F15c","name":"Staging, backups, handover","what":"A release candidate on staging, proven backups, runbook and team training.","owner":"Both","startDay":21,"endDay":23,"release":null,"dependsOn":["F15a","F15b"],"subs":["F15.1","F15.6","F15.7"]},
{"id":"F15d","name":"UAT + production go-live","what":"SHARKX tests every feature on live accounts, signs off, and the CRM goes live.","owner":"Both","startDay":24,"endDay":30,"release":null,"dependsOn":["F15c"],"subs":["F15.8"]}
]
};
