# F1c-X · Trust this device (skip the emailed code for 30 days)
Owner: A (Alex) · full stack (web + api + db + tests) · Status: built, awaiting approval to ship · Days TBD · Release none · Tracker: none yet (needs an F-id: ask before inventing one) · PRD: not in the PRD (an Extra; F1c lists "remembering devices" as out of scope, so this needs explicit approval and normally waits until F1–F15 are done)

## Goal
After a successful emailed code, a person can tick "Don't ask for a code on this device for 30 days"; on that device the next sign-ins ask for the password only, until the trust expires or is revoked.

## Sub-features
| # | Sub-feature | Tracker | Est. |
|---|---|---|---|
| S1 | Trusted-device store and api (create, check, slide, revoke, prune) | — | 1 d |
| S2 | Web: checkbox on the code step, device cookie, stale-cookie cleanup | — | 0.5 d |
| S3 | Tests, docs, staging check | — | 0.5–1 d |

Total about 2 to 2.5 days for one developer, 3 with review and staging.

## Shared by all sub-features
- **Behaviour (the standard "trust this device" pattern):** the password is always required; trust only replaces the second step. A trusted device gets an active session straight after the password, with no pending session and no code email. This is not "keep me signed in": session lifetimes (idle 12 h, absolute 7 d) do not change.
- **Duration:** 30 days from the last use (sliding), never more than 90 days from creation. Same for every role. At most 10 trusted devices per user; creating an 11th removes the oldest.
- **Table (new, `modules/auth/schema.ts`):** `trusted_devices`: `id`, `user_id` → users (cascade), `token_hash` (unique, sha256 of a 256-bit random token; the raw token exists only in the cookie), `created_at`, `last_used_at`, `expires_at`. Index on `user_id` and on `expires_at`. System-only by grants, like `sessions` (ARCHITECTURE §4 exceptions list gets one line). One migration, generated after `git pull --rebase`, pushed the same day.
- **Cookie:** `__Host-sharkx_device` (plain `sharkx_device` without Secure when `APP_ENV=local`), HttpOnly, Secure, SameSite=Lax, Max-Age 30 d. Web Server Actions set and clear it; the api never sets cookies (ARCHITECTURE §6).
- **Revocation:** every path that calls `revokeAllSessions` (reset, disable; a password change when one exists) also deletes the user's trusted devices. A normal logout keeps the trust. A removed or expired device simply falls back to the code step.
- **Pruning:** the daily 03:00 UTC maintenance job also deletes expired `trusted_devices`.
- **Audit (no new actions):** a route writes exactly one audit row, so the facts go in the `meta` of the existing row: `auth.code_verified` gets `trustedDevice: true|false`, a trusted sign-in is `auth.login` with `meta: { stage: 'active', via: 'trusted_device' }`, and `auth.password_changed` (reset) and `user.status_changed` (disable) get `devicesRevoked: <count>` when any were removed. No token, email or user agent in logs, audit meta or error text.
- **Contract changes (own `contracts:` commit, tell John before pushing; `api/src/contracts/auth.ts`, additive):**
  - `verifyCodeRequest` gains `trustDevice: boolean` (default false).
  - `activeSessionResponse` and the verify-code response gain optional `deviceToken` and `deviceExpiresAt` (present only when the person ticked the box).
  - The login response becomes `pendingSessionResponse | activeSessionResponse`, discriminated on `stage`. A trusted sign-in returns `stage: 'active'` and also `deviceExpiresAt` (the slid expiry), so web can refresh the cookie.
  - The login request forwards the cookie value as the `x-device-token` header, the same way the old session token is forwarded today.
- **Files:** `api/src/modules/auth/{devices.ts,service.ts,routes.ts,schema.ts,sessions.ts}` + tests; `api/src/lib/maintenance` (prune); `api/src/db/migrations`; `api/src/contracts/auth.ts` (+ `node scripts/sync-contracts.mjs`); `web/src/lib/session.ts` (device cookie read/write/clear); `web/src/lib/actions/auth.ts`; `web/src/app/[locale]/(auth)/code/{page,code-form}.tsx`; `web/messages/en/auth.json`; `docs/ARCHITECTURE.md` §4 and §6.

## S1 · Trusted-device store and api
**Person story:** As a user on my own computer, I am not asked for an emailed code again for 30 days, so that signing in is quick and the mailbox is not a daily chore.
**Rules:**
- `verifyCode(..., trustDevice: true)` on success creates a device row for that user and returns the raw token once.
- In `login`, after the password is verified and the user is active, if a device token was forwarded: look up its hash; accept only if the row belongs to this same user, `expires_at` is in the future and `created_at` is under 90 days ago. Then: skip `issueCode` and the code email, revoke any forwarded old session, create an `active` session, set `last_used_at` and slide `expires_at` to now + 30 d (capped at created + 90 d), write the audit row.
- Anything else (no token, unknown, expired, another user's, disabled user) is ignored without an error and the normal pending + code flow runs. A wrong password never reaches this check.
- The login rate limits behave as today (a trusted sign-in also gives its two reservations back); the code-send counter is not used when the code is skipped.
- A device token never works as a session: it only skips the second step after a correct password.
**Errors:** no new codes. A bad device cookie is not an error: the person gets the code step.
**Done when:** a device trusted at the code step signs in with the password only; an expired, revoked or other user's token falls back to the code; password change, reset and disable remove all devices.
**Tests:** api integration (all the rules above, including the 90-day cap, the 10-device cap, same token on a second user, disabled user, revoke on reset, prune job, clock moved with the injected `now`); contract tests for the new shapes.

## S2 · Checkbox on the code step and the cookie
**Person story:** As a user entering my code, I can tick one box to trust this device.
**Screens (web):** `/code` gets one checkbox under the code field, **unchecked by default** (safe on a shared computer): "Don't ask for a code on this device for 30 days", with a muted line "Only tick this on your own device." The brand focus ring and logical properties apply; RTL checked. The login page does not change. Strings live in `messages/en/auth.json` (AR/FR at the freeze).
**Server Actions → api routes:**
- `verifyCode({ code, trustDevice })` → `POST /auth/verify-code`. When the response carries `deviceToken`, set the device cookie (Max-Age to `deviceExpiresAt`).
- `login(...)` reads the device cookie and forwards it as `x-device-token`. On an `active` response: set the session cookie, refresh the device cookie's Max-Age, and redirect by the landing rule, never showing `/code`. On a `pending_2fa` response while a device cookie was sent: clear the stale cookie.
- `logout()` keeps the device cookie.
**Errors:** unchanged; the code step's existing messages apply.
**Done when:** ticking the box and entering a correct code sets the cookie; the next sign-in on that browser lands on the dashboard after the password; unticked behaves exactly as today.
**Tests:** component test (checkbox default and submitted value), action tests (cookie set, refreshed and cleared), one e2e path on the stubbed api: sign in with the box ticked, sign out, sign in again with the password only.

## S3 · Tests, docs, staging
- Run `node scripts/verify.mjs` (both apps); the api tests need the local Postgres.
- ARCHITECTURE §6 gets the trusted-device paragraph, §4 gets the `trusted_devices` grants line; F1c's out-of-scope line is updated to point here; STATUS.md gets the sub-feature only after an F-id is agreed.
- Staging check: trust a device, wait for nothing (use the test clock), reset the password and see the code step return.

## Dependencies
F1c merged (sign-in, code, sessions). F1d (maintenance job) for the prune. Contract change goes to John before it is pushed.

## Out of scope
Authenticator-app TOTP, a "my devices" list or "sign out everywhere" screen, device names or user-agent labels, IP or location binding, risk-based prompts, a different duration per role, a "Remember me" checkbox on the login page, and longer sessions ("keep me signed in"). Do not build them.

Rules: one dev builds the whole feature top to bottom. Build one sub-feature at a time. No feature outside the approved scope.
