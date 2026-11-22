# F2b · Workspace: clients home, create client, team, client settings
Owner: B (John) · full stack (web + api + db + tests) · Days 7–7 · Release 1 · Tracker: F2.3, F2.4, F2.5 · PRD: [F2](../PRD.md#f2)

## Goal
The super admin and managers open the product on a Clients home, the super admin creates clients and manages the SHARKX team, and each client has its time zone and business hours.

## Sub-features
| # | Sub-feature | Tracker | Est. |
|---|---|---|---|
| S1 | Clients home | F2.3 | 0.25 d |
| S2 | Create client (wizard) | F2.4 | 0.25 d |
| S3 | Team (managers) | F2.5 | 0.25 d |
| S4 | Client settings: time zone and business hours | F2.5 | 0.25 d |

## Shared by all sub-features
- **Tables:** projects (incl. `first_reply_minutes`), pipeline_stages, project_members, users, integrations (read), leads and tasks (read for counts).
- **Permissions:** `project.read`, `project.create` (super admin), `project.update`, `user.manage` (super admin), `clientuser.manage`.
- **Audit actions:** `project.created`, `project.updated`, `user.invited` (via Alex's action).
- **Files:** `api/src/modules/projects/{service,routes,schema,index}.ts` + tests; `web/src/app/[locale]/(app)/clients/page.tsx`, `(app)/team/page.tsx`, `(app)/p/[projectId]/settings/hours/page.tsx`; `web/src/components/clients/*`; `web/messages/en/projects.json`.
- A client user opening any of these screens is redirected to its own dashboard (F10a S1).

## S1 · Clients home
**Person story:** As a super admin or manager I see every client at a glance and open one.
**Screens:** `/clients` table: client (initials square, name, city, industry), new today, unreplied chats, overdue follow-ups, connection dots (one per platform, grey when not connected) with a "N to fix" chip when something is warning or broken; a four-number strip above it (new today, unreplied, overdue, connections to fix); client search; "Add client" (super admin only). Row click opens `/p/<id>/overview`. Empty state for no clients: one sentence and the Add client button.
**Routes:** `GET /projects?q=` → `[{id, name, city, industry, newToday, unreplied, overdue, integrations:[{platform,status}]}]` (one aggregate query, excludes test leads).
**Rules:** unreplied = conversations whose last message is inbound; overdue = open tasks past due; counts are zero, never an error, for a client without data. Sorted by new today then unreplied.
**Done when:** every number matches seed data and a client with no data shows zeros.
**Tests:** aggregate against hand-computed seed numbers; search; permission (client role blocked).

## S2 · Create client
**Person story:** As a super admin I add a client and invite its first user in one step.
**Screens:** modal "Add a client": name, city (Abu Dhabi, Dubai, Morocco), industry, first client user's email; button "Create client and send invite".
**Actions → routes:** `createProject(input)` → `POST /projects` → `{projectId}`; runs in one transaction: project row (time zone from the city, default business hours Mon–Fri 09:00–18:00), default pipeline (New, Contacted, Qualified, Visit booked, Won, Lost), then Alex's `inviteUser({kind:'client', projectId})`. Any failure leaves nothing behind.
**Rules:** name unique (case-insensitive); the new client opens on its Overview; the invited user appears in S3-style list under the client's Settings → Client users (F10a S2).
**Errors:** VALIDATION 422, CONFLICT 409 (name or email exists), FORBIDDEN 403.
**Done when:** the client exists with its default pipeline and the invite email is sent; a manager cannot see the button or call the route.
**Tests:** atomic create and rollback, default stages, role guard, audit row.

## S3 · Team (managers)
**Person story:** As a super admin I invite and disable the SHARKX managers.
**Screens:** `/team` (super admin only) table: name, email, status (Active / Invited / Disabled), actions (Disable / Enable); "Invite manager" modal (name, email).
**Actions → routes:** uses Alex's `inviteUser({kind:'manager'})`, `setUserStatus` and `listUsers({kind:'manager'})`.
**Rules:** a disabled manager is removed from round-robin and signed out at once; the super admin cannot disable themselves.
**Done when:** invite and disable work and are audited.
**Tests:** role guard, disable revokes sessions, self-disable refused.

## S4 · Client settings: time zone and business hours
**Person story:** As a manager I set a client's time zone and its opening hours so reply timers count only working time.
**Screens:** `/p/<id>/settings/hours`: IANA time zone select (Asia/Dubai, Africa/Casablanca), seven rows (day, open switch, from, to); Save.
**Routes:** `PATCH /projects/:id/settings {timezone, businessHours}`.
**Rules:** the time zone is required; closing time is after opening time; changes apply to future timers only.
**Done when:** values persist and F12 reads them.
**Tests:** validation, persistence, permission.

## Dependencies
F2a (shell), F1b (tables). F1c S4 `inviteUser` (until it lands, call it through a stub with the same contract).

## Out of scope
Manual Add lead, extra cities, default-language and first-reply defaults page (the first-reply target is a per-client setting in Automation, F12).
