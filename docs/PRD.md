# PRD · SHARKX Agency CRM

- Authority: SOW (2026-10-16) > Client Requirements > Feature Document > mockup (UI only). Anything not in the SOW is an Extra.
- Window: build from D1 (Fri 20 Nov). Re-baselined D3: base portal D10, last new feature (TikTok/LinkedIn/Snapchat connectors) about D21, testing and handover D20–23, UAT and production D24–30. Order and owners: `docs/specs/ORDER.md`. Each dev builds whole features, web and api.
- Trace key: **SOW** = SOW §4 module (hours from §8) · **Mockup** = screen in `docs/inputs/sharkx-crm-mockup.html`. Sub-features and status: `docs/specs/STATUS.md`.
- Change 2026-11-21: three roles only (super admin, manager, client); the secure no-login client link is replaced by client login. SOW change order pending (ARCHITECTURE §10).

## Problem
- SHARKX runs campaigns for aesthetics clinics and SMEs (Abu Dhabi, Dubai, Morocco). Leads sit in Meta, Google, TikTok, Snapchat, LinkedIn, website forms and WhatsApp.
- Follow-up is unmanaged, clients cannot see or rate leads, ad platforms never learn which leads converted.
- Core loop: capture lead → follow up → client qualifies → ad platforms learn.

## Users and roles
| Role | Who | Can |
|---|---|---|
| Super admin | SHARKX owner | Seeded in the database, never created in the UI. Can do everything: creates clients, invites managers (the SHARKX team) and client users, agency settings, audit log. Sees all clients |
| Manager (UI: "Account manager") | SHARKX team member, invited by the super admin | Works on all clients: leads, chats, notes, tasks, assignment, pipeline, automation, qualification settings, connectors, conversion mapping, reports. Invites and disables client users. Cannot create clients, invite managers, change agency settings or read the audit log |
| Client | Clinic / SME user (one client per user), invited by the super admin or a manager | Signs in to a dashboard for its own client only: analytics, leads (view, mark MQL/SQL/Not qualified + reason, export CSV), WhatsApp chats (read-only), connectors (connect, reconnect). Never sees notes, tasks, pipeline, owners, contacts, automation, audit, team, conversion settings or other clients |

- One role per user; no agent role and no client-side sub-roles. Roles do not nest: matrix in CONTRACTS §1.
- Sign-in (all roles): email + password + emailed code.
- Statuses: New, MQL, SQL, Not qualified (reason from an editable list). Pipeline stage is independent of status.

## MVP features (all Must)

### F1
**Foundation and access** · A · SOW: Users and access (12h) · Mockup: Settings → Team and roles (login, code, audit screens new, mockup style)
- The super admin is seeded in the database (one per environment); there is no sign-up. The super admin invites managers; the super admin and managers invite a client's users (one client per user). No other roles.
- Invite by email → single-use set-password link (72 h) → sign in with password + 6-digit emailed code (10 min, 5 tries). Reset by link (1 h).
- Roles per matrix. A client user reads zero rows from other clients, and none of its own client's staff-only data (notes, tasks, events, automation, conversion settings), via UI, actions, API and polling (isolation suite proves it). Managers and the super admin see all clients.
- Every mutation, sign-in event, integration connect and client mark writes an audit row. Super admin filters by user, action, client, date.
- The api's `/health` reports DB, queue, each integration, last webhook time. The web `/api/health` only reports web + api reachability.
- Failed jobs retry with backoff; exhausted jobs send an alert email.

### F2
**App shell and projects** · B · SOW: Interface, Agency workspace (10h) · Mockup: rail, topbar, Clients home, New project wizard, Team
- SHARKX brand from `skills/sharkx-brand-guidelines` (tokens, real logo files; Sharp Sans files pending), usable at 360 px. The left rail is icon-only and opens on hover or focus, pushing the page. Pages carry no in-page title; the rail shows where you are.
- EN/AR/FR with full RTL; language saved per user; no hard-coded strings.
- Clients home (super admin and managers): per client new today, unreplied, overdue follow-ups, connection dots; client search; add client (super admin only). Client users skip it and land on their own client's dashboard.
- Create project (super admin only: name, city, industry, first client user's email) → isolated workspace + default pipeline (New, Contacted, Qualified, Visit booked, Won, Lost); the first client user gets an invite. Cities: Abu Dhabi, Dubai, Morocco.
- Team (super admin): managers (invite, disable). Per client: client users (super admin and managers), IANA time zone, business hours.
- Navigation. Super admin and managers, all clients: Clients (super admin also Team, Audit log). Inside a client: Overview, Inbox, Leads, Contacts, Pipeline, Tasks, Reports, Integrations, Settings. Client users: Overview, Leads, WhatsApp, Reports, Connectors.

### F3
**WhatsApp tracking** · A · SOW: WhatsApp tracking (18h) · Mockup: WhatsApp inbox; connect flow (steps 2–3 replaced by QR)
- Connect: a SHARKX user or the client's own user starts Embedded Signup; the number's owner scans the QR in the WhatsApp Business app; several numbers per client; sync % shown.
- History: last 6 months imported once (Meta allows one sync within 24 h of onboarding); groups excluded; interrupted sync resumes; missed window shows "Reconnect needed".
- Both sides tracked live (customer messages and messages sent from the app); duplicate deliveries never duplicate messages.
- Chat from an unknown number creates contact + lead (source WhatsApp); a known number attaches to the contact's open lead.
- Inbox is read-only: tabs Unread/All, number chips, search, thread, MQL/SQL/Not qualified buttons; no send box; media shown as typed placeholder. Client users get the same inbox for their own client, read-only, without assignment or notes.
- Assign lead and internal notes are done in the lead drawer (Leads), SHARKX only: never visible to client users.
- Disconnect, lost permission or ~14-day app inactivity shows Needs attention + alert email (also to that client's users), with a reconnect path.

### F4
**Lead engine and contacts** · B · SOW: Lead capture (field mapping), Contacts, Routing (assignment) (10h) · Mockup: Leads, lead drawer, "Check the fields" step
- Every source calls `ingestLead()`; phones normalised to E.164.
- Per-form field mapping (name, phone, email, custom → custom field / notes / ignore).
- Dedupe per client: same phone (else email) merges into the contact's open lead timeline; no open lead → new lead on the same contact.
- Auto-assign round-robin among active managers (all clients). Client users are never assignable.
- Lead visible ≤10 s after arrival with source, campaign, form answers.
- Leads screen: tabs All/Unreviewed/MQL/SQL/Not qualified; search; source and owner filters; single assign; CSV export of the current filter. Client view: same tabs, search and source filter; no owner filter, assign, stage or timeline.
- Lead drawer: qualification, details, answers, timeline (client users: qualification, details, answers, campaign only). Contacts list + profile (all leads, chats, notes, status changes): SHARKX only.
- Test leads (`is_test`) are excluded from reports, exports and conversion feedback.

### F5
**Meta Lead Ads** · A · SOW: Lead capture (8h) · Mockup: Integrations → Meta, connect flow
- Connect via Facebook login: choose Page and lead forms; health shown.
- New lead via webhook → retrieve → ingest ≤30 s; fields mapped per form.
- Tokens encrypted; expiry warned ≥5 days ahead; one-click reconnect.
- Verified with Meta's lead testing tool (dev mode) and fixtures; live on approval.

### F6
**Google Ads and YouTube lead forms** · B · SOW: Lead capture (6h) · Mockup: Integrations → Google
- Connect Google account; choose Ads account and lead forms (Search, YouTube, Demand Gen).
- Lead-form webhook (key-verified) → ingest; fields mapped per form.
- Health and reconnect as F5; fixture-tested, live with real forms.

### F7
**Website forms and CSV import** · B · SOW: Lead capture (4h) · Mockup: website snippet modal, CSV import modal
- One copy-paste snippet; any form posts to `/api/forms/:key`; captures UTM, gclid, fbclid; honeypot, rate limit, origin allowlist.
- CSV: column auto-match + confirm, dedupe on import, summary (created/merged/skipped), ≤10k rows.

### F8
**Pipeline and tasks** · B · SOW: Pipeline and tasks (12h) · Mockup: none (kanban CSS only), design in mockup style
- Custom stages per client (add, rename, reorder, delete; deleting moves leads to a chosen stage).
- Kanban with drag and drop; a stage change writes timeline + audit; stage is independent of the client mark.
- Tasks: create from a lead (or from the Tasks list), assignee, due date, done; Tasks list per client.
- Reminders at due time via bell + email; overdue tasks feed the agency view (F13).
- Pipeline stages, kanban and tasks are SHARKX only; client users never see them.

### F9
**TikTok, LinkedIn, Snapchat** · B · SOW: Lead capture (15h) · Mockup: Integrations cards, connect flow
- One adapter interface. Per platform: connect, account/form selection, lead retrieval (webhook or polling), mapping, health, reconnect.
- Each passes its fixture suite. A platform without access shows "Awaiting platform access" and is verified live when access arrives.

### F10
**Client dashboard** · B · SOW: Client lead link (10h), replaced by client login (change order pending, ARCHITECTURE §10) · Mockup: Settings → Client lead link and the client portal, restyled as the client's own dashboard
- Client users sign in at the app address (invite → set password → emailed code) and land on their own client: analytics, leads, WhatsApp chats, connectors. The nav shows only those.
- Invites: the super admin and managers invite, list and disable a client's users (Settings → Client users). One client per user, one role.
- Leads: KPIs (leads 30 d, MQL rate, SQL rate, waiting for review); tabs Waiting for review/All/MQL/SQL/Not qualified; source filter; expandable row (form answers, campaign, email). No owner, stage, notes or timeline.
- Client marks MQL/SQL/Not qualified; Not qualified requires a reason (list editable by SHARKX in Settings → Lead qualification); a mark can be changed later; MQL/SQL definitions shown.
- Client exports CSV of its own leads.
- A mark is one transaction: status, history, audit row (actor = the client user), conversion outbox rows.
- A client user never reads notes, tasks, owners, stages, contacts, automation, audit, team, conversion settings or other clients: enforced in `can()`, in client-safe API projections and by RLS (ARCHITECTURE §4).

### F11
**Conversion feedback** · A · SOW: Conversion feedback (10h) · Mockup: Settings → Conversion feedback
- Mapping table per client (New, MQL, SQL, Not qualified → Meta event / Google event) with on/off toggles.
- Status change → outbox → sent ≤60 s; retries with backoff; one event per platform per change (idempotent event id).
- Meta Conversions API (hashed phone/email, lead id/fbclid; `test_event_code` on staging); Google Data Manager API (gclid / enhanced conversion).
- Failed sends retry with backoff, then raise the alert email (F14).
- Test leads and leads with no usable identifier are skipped and logged.

### F12
**Routing and automation** · B · SOW: Routing and automation (5h) · Mockup: none (rule-card CSS only)
- Auto-assignment (round-robin) configurable per client.
- Response-time alert: no reply in N min (default 15, set per client in Automation) during business hours → notify the lead's owner (a manager; bell + email).
- Simple rules: when (new lead from source, no reply N min, client marks status, unreviewed N h) → then (assign, notify, create task, move stage); enable/disable; run count.
- Business hours per client drive the timers.

### F13
**Reports and agency dashboard** · B · SOW: Reports, Agency workspace (8h) · Mockup: Overview, Reports, Clients home
- Overview KPIs: Leads (30 d), New today, Median first reply, MQL rate, SQL rate; leads per day; leads by source; client users also get a waiting-for-review list.
- Reports: 7/30/90 days; performance by source **and** campaign (SQL rate per row).
- Definitions: MQL rate = (MQL+SQL)/leads; SQL rate = SQL/leads; first reply = first customer message → first outbound message.
- Agency view: new leads, unreplied chats, overdue follow-ups, connection health across clients (super admin and managers). Client users see Overview and Reports for their own client only, without the by-manager table.

### F14
**Integrations hub and live updates** · A · SOW: Integrations hub (8h shared with F2.6) · Mockup: Integrations, Connections, bell
- Four health states (Connected, Needs attention, Broken, Not connected) from token expiry, last data, webhook errors; checked every 5 min.
- Per-client hub as one card per platform (authentic platform icon, health state, account, last lead); one-click Reconnect; each adapter labelled Live / Fixture-verified / Awaiting access. Client users get their own client's hub and can connect and reconnect there. Cross-client health is the connection dots on Clients home.
- Bell: connection issues, new leads, new messages, task reminders (client users: connection issues, new leads, new messages). Polling `/api/events` ≤5 s on inbox and leads, ≤30 s elsewhere.
- Alert emails to the alert inbox for broken connections and job failures (rate-limited, no personal data); connection issues also go to that client's users.

### F15
**Testing, deploy, handover** · A + B · SOW: testing, deployment, handover (14h)
- CI: typecheck, Biome, Vitest (Postgres), audit; runs on every push to `master` (devs run `node scripts/verify.mjs` first). Staging auto-deploys from `master` only after green CI (Railway "Wait for CI"); production promoted manually.
- Tests: isolation + permission suite (super admin, manager, client), webhook signature and idempotency, adapter fixtures, 6 Playwright flows; manual UAT checklist.
- Seed/demo data from the mockup (5 clients, ~64 leads) plus a super admin, two managers and one client user per client.
- Backups on; restore drill passed before production.
- Handover: runbook, env/secrets list, reconnect guide, team training session.

## UI deltas vs mockup
- **Hide:** Won/Junk (menus, tabs, KPI, funnel, mapping row), Cost per SQL (KPI, column), "SharkX suggests MQL", Send test lead, Disconnect, funnel chart, report export, first-reply-by-manager chart, 14-day sparkline, Inbox "Recent" tab, Leads "New today" tab and WhatsApp column, period-over-period deltas, page titles, the "last 30 days · time zone · source" line, Settings → Client lead link (link, regenerate, revoke, toggles), passcode and expiry, Add lead, bulk bar and checkboxes, starred chats, Ctrl+K, "Remind client on WhatsApp" rule and the unreviewed-reminder setting.
- **Change:** "Reject" → "Not qualified"; WhatsApp connect → QR (Embedded Signup); the client portal becomes the client's own login dashboard (same screens, client-safe fields); Reports add the campaign table, drop Won; team roles reduce to Manager (SHARKX) and Client.
- **Platform icons:** authentic Meta, Facebook, Instagram, WhatsApp, Google, YouTube, TikTok, LinkedIn and Snapchat marks (Simple Icons paths) on app-icon tiles. Integrations stay a card grid.
- **New screens (mockup style):** login + code, reset/invite, kanban + stage editor, tasks, contacts, automation rules, business hours, audit log, client users.

## Extras (lowest priority, in order; only after F1–F15 are done and tested)
1. Manual "Add lead"
2. Bulk assign / bulk status
3. Click-to-WhatsApp tag; extra cities (Sharjah, Rabat, Marrakech, Casablanca)
4. Starred chats, Ctrl+K palette, inbox shortcuts
5. Won + Junk statuses (Client Requirements #14 open; adds Won event with value)
6. Email reminder to client for unreviewed leads
7. WhatsApp media download and storage
8. Authenticator-app TOTP
9. Cost per SQL (needs a written change order: ad spend is out of scope)
10. "SharkX suggests MQL" (no rule defined)
11. Offsite database dump

## Cut
- SOW out of scope: calling/IVR; white-label; sending WhatsApp from the CRM (incl. auto-reply add-on); ad spend and campaign management. Client logins were out of scope and are now included by change order (ARCHITECTURE §10).
- Not planned: SSO, multi-currency, data-retention tooling, UAE-resident database (deferred), agent role, client-side sub-roles, the no-login client link.
- SOW §5 stack changes: ARCHITECTURE §10.

## SHARKX inputs needed
| By day | Input | Blocks |
|---|---|---|
| 1 | Meta business verification started, with business documents (legal name, registered address, trade licence, phone, website, DNS-verified domain) | F3, F5, F11 |
| 1 | Named product owner + review contact (3-working-day reviews) | acceptance |
| 1 | Railway Pro account, Conalytic invited as admin | production |
| 1 | Answer on Won status (#14); default = Extra | Extras |
| 3 | Domain + DNS access; address for the app | F15 |
| 3 | Brand assets (logo, colours, fonts) | F2 |
| 3 | Resend account in SHARKX's name + sending-domain DNS records | F1 email |
| 3 | Alert inbox address | F14 |
| 3 | Privacy policy and terms URLs + data-deletion instructions on SHARKX's domain | F3, F5, F6, F9 (app reviews, consent screens) |
| 5 | Admin for the pilot client: Facebook Page, Meta ad account + dataset (Pixel) used for conversions; Google Ads (incl. YouTube forms) with conversion-upload access. Clients later connect their own accounts in the dashboard | F5, F6, F11 |
| 5 | Admin for the pilot client: TikTok, LinkedIn, Snapchat ad accounts (not in Client Requirements); LinkedIn legal-entity details + verified Page (SHARKX's) | F9 |
| 7 | Pilot client: WhatsApp Business app (≥2.24.17, ≥7 days active), owner with phone for QR + history approval; live form or test campaign per platform | F3, F5–F9 |
| 14 | SHARKX reviewers and one pilot client booked for testing on D22–28 | F15 (acceptance, go-live) |
| 18 | Native Arabic and French reviewers | F2.6 |

## Demo success criteria
- Day 21, staging, scripted; each integration labelled Live or Fixture-verified:
  1. Create a client project → default pipeline.
  2. Connect Meta (dev mode) → test lead appears ≤10 s with source, campaign, answers, auto-assigned.
  3. WhatsApp: customer message arrives; a message sent from the Business app appears; a new chat becomes a lead.
  4. A manager moves the lead on the kanban and creates a task; the 15-min no-reply alert fires.
  5. Manager invites a client user; the client signs in, sees only its own client, marks SQL and Not qualified (with reason).
  6. Conversion event reaches Meta test events (Google where access exists) ≤60 s; a failure shows its retry state.
  7. Reports and agency view reflect the marks.
  8. Switch to Arabic: RTL renders.
  9. A client user of A cannot see client B, nor A's notes, tasks or owners; the audit log shows the actions.
  10. Health endpoint and hub show all states, incl. a broken connection + alert email.
- Gates: CI green; isolation and security suite pass; no open P1/P2 bugs; seed loaded; restore drill done.
- UAT exit (D22–28): each integration verified live or logged as blocked with a dated dependency entry; milestone reviews signed (3 working days each); production live; training done.
