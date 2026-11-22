# F1c · Access: sign-in, emailed code, reset password, invites, roles
Owner: A (Alex) · full stack (web + api + db + tests) · Days 5–7 · Release 1 · Tracker: F1.3, F1.4, F1.5 · PRD: [F1](../PRD.md#f1)

## Goal
Anyone can be invited, set a password, sign in with an emailed code, reset a forgotten password and land on the dashboard that matches their role. Every action in the product is gated by `can()`.

## Sub-features
| # | Sub-feature | Tracker | Est. |
|---|---|---|---|
| S1 | Sign-in and session (password step, cookie, logout) | F1.3 | 1 d |
| S2 | Emailed code (second step) | F1.4 | 0.5 d |
| S3 | Roles and `can()` | F1.5 | 0.5 d |
| S4 | Invites and accept screen | F1.5 | 0.75 d |
| S5 | Reset password | F1.3 | 0.25 d |

## Shared by all sub-features
- **Tables:** users, sessions, auth_tokens, project_members (client users only), audit_log, rate_limits (all from F1b).
- **Passwords:** scrypt N=2^15, r=8, p=1, per-user salt, at least 12 characters (ARCHITECTURE §6). Tokens: 256-bit random, only the sha256 is stored.
- **Email:** one `sendEmail(template, locale, data)` in `lib/email` (Resend). Templates `invite`, `code`, `reset`, English now, Arabic and French in F2c. F1d later routes it through the `email.send` job; until then it sends directly and the caller does not change.
- **Audit actions written:** `auth.login`, `auth.login_failed`, `auth.code_verified`, `auth.logout`, `auth.reset_requested`, `auth.password_changed`, `user.invited`, `user.invite_accepted`, `user.status_changed`.
- **Contract additions (additive, `api/src/contracts/auth.ts`):** request/response schemas for the routes below.
- **Files:** `api/src/modules/auth/{service,routes,schema,index}.ts` + tests; `api/src/lib/{email,crypto}`; `web/src/app/[locale]/(auth)/{login,code,reset,reset/[token],accept-invite/[token]}/page.tsx`; `web/src/lib/session.ts` (cookie read/write, redirect rules); `web/src/proxy.ts` (guard); `web/messages/en/auth.json`.
- **Landing rule after a full sign-in:** super admin and manager go to `/[locale]/clients`; a client user goes to `/[locale]/p/<their projectId>/overview`.

## S1 · Sign-in and session
**Person story:** As any user, I enter email and password and move on to the code step, and I can sign out.
**Screens:** `/login` email, password, "Forgot password?" link, one red "Continue" button. Wrong credentials show one generic message ("Email or password is not right"), never which one. Rate-limited state shows the wait time. A signed-in user opening `/login` is redirected to the landing rule.
**Actions → routes:**
- `login(email, password)` → `POST /auth/login` → `{stage:'pending_2fa'}` and sets the session cookie in the pending state; sends the code email (S2).
- `logout()` → `POST /auth/logout` → revokes the session, clears the cookie, redirects to `/login`.
- `GET /me` → `{userId, name, role, projectIds, locale, stage}` (the CONTRACTS §1 session).
**Rules:**
- Session: opaque 256-bit token (sha256 in DB), `__Host-` cookie, HttpOnly, Secure, SameSite=Lax, idle 12 h, absolute 7 d, rotated at login and again when the code is verified. A `pending_2fa` session can reach `/code` and logout only.
- Rate limit 5 attempts per 15 min per email + IP. A disabled or invited-but-not-accepted user gets the same generic error.
- Email is case-insensitive. Password change or disabling a user revokes all that user's sessions.
**Errors:** UNAUTHENTICATED 401 (generic), RATE_LIMITED 429.
**Done when:** a correct email and password reaches the code step; wrong ones leave no hint; 6 quick failures lock the account for the window; logout ends the session everywhere it was used; headers CSP, HSTS, nosniff, Referrer-Policy and `frame-ancestors 'none'` are set.
**Tests:** hash and verify; session rotate and expiry (fake clock); rate-limit window; `pending_2fa` cannot call any other route or action; e2e login path lives in F15b.

## S2 · Emailed code
**Person story:** As a user who passed the password step, I enter the 6-digit code from my email to finish signing in.
**Screens:** `/code` six boxes with auto-advance and paste support, "Send a new code" link, "Back" link; the email is shown masked (`o•••@sharkx.ae`).
**Actions → routes:** `verifyCode(code)` → `POST /auth/code/verify` → `{stage:'active', redirect}`; `resendCode()` → `POST /auth/code/send`.
**Rules:** code is 6 digits, stored hashed, valid 10 minutes, 5 attempts then it is invalid and a new one is required. Sending is limited to 3 per 10 min. A new code invalidates the previous one. Verifying rotates the session to `active`.
**Errors:** VALIDATION 422 ("That code is not right", attempts left shown), RATE_LIMITED 429, UNAUTHENTICATED 401 when the pending session expired (back to `/login`).
**Done when:** the right code opens the dashboard for the role; 5 wrong codes kill the code; an expired code asks for a new one.
**Tests:** attempt counter, expiry, resend limit, single use, session becomes active only after verify.

## S3 · Roles and `can()`
**Person story:** As the system, I stop any person from reading or doing what their role does not allow, on every route and every action.
**Screens:** none. A forbidden page (generic "You do not have access") and a not-found page that is identical for "does not exist" and "not yours".
**Rules:** `can(session, action, projectId?)` exactly as CONTRACTS §1 (super_admin, manager, client; roles do not nest). `actionRoles` map in `api/src/contracts/session.ts` replaces `actionMinRole`. Super admin and manager see every project; a client only its one project; `pending_2fa` is always false. Every api route handler and every Server Action calls `can()` first and writes an audit row on mutation.
**Errors:** FORBIDDEN 403, NOT_FOUND 404.
**Done when:** a table test proves every action × role × (own project, other project, no project) and a CI test fails if a route or action is registered without a `can()` call.
**Tests:** the full matrix; the "every route is guarded" structure test.

## S4 · Invites and accept screen
**Person story:** As a super admin I invite a manager; as a super admin or manager I invite a client's user; the invited person sets a password and signs in.
**Screens:** `/accept-invite/[token]` shows who invited them and for which client, new password with live rules (12+ characters, a letter and a number), confirm, one button "Set password and continue" (then the code step). Expired, used or forged link → one "This link has expired. Ask for a new invite" page.
**Actions → routes:**
- `inviteUser({kind:'manager'|'client', email, name, projectId?})` → `POST /users/invite` (kind `manager` needs `user.manage`; kind `client` needs `clientuser.manage` and creates the `project_members` row). Returns the user in `invited` status.
- `GET /auth/invite/:token` validates the link and returns the inviter and client names.
- `acceptInvite(token, password)` → `POST /auth/invite/accept` → status `active`, password set, then the S1 flow continues at the code step.
- `setUserStatus(userId, 'active'|'disabled')` → `POST /users/:id/status` (revokes sessions on disable; a manager can only touch client users).
- `listUsers({kind, projectId?})` → `GET /users` used by F2b (Team) and F10a (Client users).
**Rules:** the invite link works once and expires in 72 h; inviting an email that already has an account is refused with a clear message; a role is fixed by the invite and never changes; a manager cannot invite a manager; a client user cannot invite anyone. Email carries no password and no personal data beyond the name.
**Errors:** VALIDATION 422 (weak password, bad email), CONFLICT 409 (email exists), FORBIDDEN 403, NOT_FOUND 404.
**Done when:** invite → email → accept → code → right dashboard works for both a manager and a client user; the link cannot be reused; disabling signs the person out at once.
**Tests:** token single use and expiry, role and project binding, manager cannot invite manager, disable revokes sessions, audit rows.

## S5 · Reset password
**Person story:** As a user who forgot my password I get a link by email and set a new one.
**Screens:** `/reset` email field → neutral confirmation ("If an account exists, a link is on its way"); `/reset/[token]` new password with the same live rules.
**Actions → routes:** `requestReset(email)` → `POST /auth/reset/request`; `resetPassword(token, password)` → `POST /auth/reset/confirm`.
**Rules:** link valid 1 hour, single use; limit 3 per hour per email; the response is identical whether the account exists or not; success revokes every session and sends the person to `/login`. A used or expired link shows the S4 expired page.
**Errors:** VALIDATION 422, RATE_LIMITED 429.
**Done when:** a reset link changes the password once, signs out all devices and cannot be reused.
**Tests:** neutral response, single use, expiry, session revoke, rate limit.

## Dependencies
F1b (tables, `withTenant`/`withSystem`). Resend domain may not be verified yet: use Conalytic's sending domain on staging.

## Out of scope
Authenticator-app TOTP, SSO, client-side roles, client users inviting colleagues, remembering devices, password history.
