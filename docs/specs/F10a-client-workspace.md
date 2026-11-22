# F10a · Client dashboard foundation and client users
Owner: B (John) · full stack (web + api + db + tests) · Days 8–8 · Release 1 · Tracker: F10.1, F10.2, F10.3 · PRD: [F10](../PRD.md#f10)

## Goal
A client's people sign in and land on a dashboard that shows only their own client, with the five client sections in the sidebar, and SHARKX staff can manage that client's users.

## Sub-features
| # | Sub-feature | Tracker | Est. |
|---|---|---|---|
| S1 | Landing, route guards and the client sidebar | F10.2 | 0.35 d |
| S2 | Client users (invite, list, disable) | F10.1 | 0.35 d |
| S3 | Client-safe projections | F10.3 | 0.3 d |

## Shared by all sub-features
- **Tables:** project_members, users, leads, wa_* (read), integrations (read).
- **Permissions:** `project.read`, `clientuser.manage` (S2), `lead.read`, `chat.read`, `report.read`, `integration.manage` for the client role, own client only.
- **Audit actions:** `user.invited`, `user.status_changed` (via Alex's actions).
- **Files:** `api/src/modules/leads/projection.ts`, `api/src/modules/reports/projection.ts`; `web/src/app/[locale]/(app)/p/[projectId]/layout.tsx` (guard); `web/src/components/nav/client-nav.tsx`; `web/src/app/[locale]/(app)/p/[projectId]/settings/client-users/page.tsx`; `web/messages/en/team.json`.

## S1 · Landing, route guards and the client sidebar
**Person story:** As a client user I sign in and see my own client, never a list of clients and never staff screens.
**Screens:** after sign-in the landing rule opens `/p/<projectId>/overview`. The sidebar shows five items: Overview, Leads, WhatsApp, Reports, Connectors (each appears as its feature lands; before that the item is hidden, not greyed). The top bar shows the client name (not a switcher). Every other route (pipeline, tasks, contacts, settings, clients, team, audit) returns the not-found page.
**Rules:** the layout reads the session; a client user whose `projectId` differs from the URL gets the same not-found page as a URL that does not exist. `can()` is re-checked in every Server Action and route; hiding a menu item is never the protection.
**Done when:** a client user of A opening B's URL, or any staff-only URL of A, sees the not-found page; staff behaviour is unchanged.
**Tests:** route guard matrix for super admin, manager and client; deep-link attempts.

## S2 · Client users
**Person story:** As a super admin or manager I invite, list and disable the users of one client.
**Screens:** `/p/<id>/settings/client-users` table: name, email, status (Active / Invited / Disabled), actions (Disable / Enable); "Invite client user" modal (name, email).
**Actions → routes:** Alex's `inviteUser({kind:'client', projectId})`, `setUserStatus`, `listUsers({kind:'client', projectId})`.
**Rules:** one client per user and one role; a disabled user is signed out at once; a client user never sees this screen; the first user is invited by F2b S2.
**Errors:** CONFLICT 409 (email already used), FORBIDDEN 403.
**Done when:** invite, accept, disable and re-enable work end to end and are audited.
**Tests:** invite to accepted path against F1c; disable revokes sessions; cross-client attempt is not found.

## S3 · Client-safe projections
**Person story:** As the system, I give a client user only the columns a client may see, in every response, export and update.
**Rules:** a projection function per entity returns the client shape: leads without owner, stage, notes and events; reports without any per-manager data; conversations without notes or assignment. Services pick the projection from the session role, so a new endpoint cannot forget it. RLS `client_access` (F1b) is the second wall.
**Done when:** a contract test lists the allowed fields and fails if a response for a client contains anything else.
**Tests:** field allowlist per entity; export columns; polling feed kinds for the client role.

## Dependencies
F2a (shell), F1b (RLS), F1c (`inviteUser`, `setUserStatus`, `listUsers`, `can()`), F4b and F13a supply the Leads and Overview screens that S3's projections feed.

## Out of scope
Client-side roles, client users inviting colleagues, passcode and expiry, the no-login link, Won. Marking and export are F10b.
