# F1 independent test report (F1b schema + RLS, F1c access, F1d queue + audit)

Reviewer: Claude (did not write the code). Date: 2026-11-22. Scope: `api/src`, `web/src/app/[locale]/(auth)`, specs F1b, F1c, F1d, F1-technical-plan §6, §7, §9, CONTRACTS §1, §7.

## Verdict

**Ready for John to build on. Nothing blocks him.** Two real bugs were found and fixed (commits below) and two test gaps were closed. Read "John must" first, and the ranked open issues for what Alex should still do before production.

**John must:**
- Call `requireSession()` in every page or layout he adds. The proxy only checks that a cookie exists.
- Register every api route through `defineRoute`, and read tenant data only through `withTenant()`.
- Re-run the client-isolation walk through the UI, api and polling once real tenant routes exist. Today it is proven at database level only (see O1).

## How it was tested

- Node 26.13.1 (the repo's `.nvmrc`) was installed beside the machine's 22.14 and used on PATH for these runs only.
- A fresh database `sharkx_f1review` on the Docker Postgres. Migrations ran clean on it and the super admin was seeded.
- api (:4100), worker and a **production build** of web (:3100) were started. Mail was read from `api/.mail`.
- Scripted HTTP walks used the internal token, as web does. A Playwright Chromium walked the screens at 1280 and 360 px, in English and Arabic.
- Raw SQL attacks ran through `SET LOCAL ROLE app_user` and `app_system`, exactly like `lib/tenant`. Time-based cases (expiry) were done by moving timestamps in the review database.
- Everything created is test data in that database. It was dropped at the end.

## Existing suites (before and after my changes)

| Check | Expected | Result | Evidence |
|---|---|---|---|
| api `pnpm typecheck`, `pnpm test` | green | PASS | before: 23 files / 678 tests; after: 26 files / 689 tests |
| web `pnpm typecheck`, `lint`, `test` | green | PASS | 8 files / 291 tests, then 293 with the new web tests |
| `node scripts/verify.mjs --all` | "Safe to push" | PASS | run before and after (final run at the end of this report) |
| api `pnpm lint` | no errors | PASS, 5 warnings | `useOptionalChain` in `auth/service.ts` and `auth/users.ts`, already there |

## F1c "Done when" walked as a user (S1 to S5)

| Check | Expected | Result | Evidence |
|---|---|---|---|
| S1 correct email + password reaches the code step | 200 `pending_2fa` + code mail | PASS | accept and login both returned a pending session and a code mail |
| S1 unknown email / wrong password / invited-not-accepted / disabled | identical 401 | PASS | identical bodies; 111 to 115 ms each (no timing gap); UI shows the same message for all three |
| S1 email is case-insensitive | 200 | PASS | upper-case email logged in |
| S1 lockout after 5 failures | 6th is 429 with wait time | PASS | `401 x5, 429 (retry 874 s)`; correct password while locked is also 429; the UI shows "Try again in 5 minutes." |
| S1 lockout under a parallel burst | 5 pass, rest 429 | **FAIL, fixed** | before: 12 of 12 got 401; after: 5 x 401, 7 x 429 (Bug 2) |
| S1 session rotation | new token at login and at code verify; old one dead | PASS | pending token is 401 after verify; a login also revokes the token it forwarded |
| S1 expiry | idle 12 h slides, absolute 7 d, pending 15 min | PASS | idle slides to about 12 h; idle and absolute expiry give 401; pending TTL 900 s; a pending session older than 15 min gives 401 |
| S1 logout | session ends | PASS | 200, then 401; another device's session survives (per-session logout) |
| S1 pending session against every other route | 401 | PASS | `/users` (3 forms), `/users/invite`, `/users/:id/status`, `/audit`, `PATCH /me` all 401; `GET /me` is 200 as designed |
| Internal token missing or wrong | 404 | PASS | 10 of 10 across five non-public routes |
| S2 wrong codes | attemptsLeft 4,3,2,1,0 then needNewCode | PASS | `422:4 … 422:0N`; the right code after five wrong is refused |
| S2 expired code | 422 expired | PASS | |
| S2 resend limit | 4th send in 10 min is 429 | PASS | `retryAfterSec 575`; the refused send did not destroy the live code |
| S2 newer code supersedes the older | | PASS | |
| S2 right code, 6 submitted in parallel | one active session | PASS | one 200, one active session |
| S2 12 wrong codes in parallel | at most 5 counted | PASS | attempts = 5, code dead |
| S3 manager role against `user.manage` routes | 403 | PASS | manager: invite manager, list managers, `/audit` all 403 |
| S3 client role against the 9 staff-only routes | 403, or 404 for another client's project | PASS | |
| S3 forged `role` or `kind` in invite body | refused or ignored | PASS | `kind:admin` gives 422; smuggled `role` is ignored (manager stays manager) |
| S4 invite manager, then accept, code, dashboard | manager lands | PASS | role manager, no projectIds |
| S4 invite client, then accept, code, own project | client lands | PASS | role client, projectIds=[A] |
| S4 invite link single use / reissue / TTL | | PASS | reuse gives 404 on accept and inspect; re-invite kills the old link; TTL 259200 s (72 h); expired link gives 404 |
| S4 weak password | 422 and the link survives | PASS | too short, no digit, no letter and 129 characters all give 422; the link still worked after |
| S4 forged or malformed token | 404 / 422, same body as unknown | PASS | |
| S4 existing account, other role, other project | 409 | PASS | |
| S4 manager invites manager / client invites anyone | 403 | PASS | |
| S4 invite email content | link and name only | PASS | no password in the mail |
| S4 disable user | session dead at once | PASS | the existing session is 401; sign-in is a generic 401; disabling mid code step gives 401 on verify |
| S4 disable rules | manager cannot disable a manager; nobody disables the super admin or themselves | PASS | 403 / 403 / 409 / 409 |
| S4 re-enable | active again | PASS | |
| S5 reset request is neutral | same 200 for 4 kinds of account, mail only to the active one | PASS | 11, 8, 8, 7 ms; mail counts +1/0/0/0 |
| S5 reset limit | 3 per hour, also for unknown emails | PASS | active `200,200,429`, unknown `200,200,200,429` |
| S5 reset token | single use, 1 h TTL, newest link only, kind-bound | PASS | TTL 3600 s; reuse and expired give 404; an older link gives 404; a reset token on the invite endpoint gives 404 |
| S5 reset revokes all sessions, new password works | | PASS | another device's session gives 401 afterwards; the old password gives 401 |
| S5 reset confirmed 6x in parallel | exactly one wins | PASS | |
| S4 same invite accepted 6x in parallel | one session | PASS | 1 x 200, 5 x 404 |
| S5 and S4 password that changes length under NFKC | 422 | **FAIL, fixed** | before: 500 INTERNAL plus an alert email (Bug 1) |
| Hostile bodies on `/auth/login` | 4xx, never 500 | PASS | bad JSON, empty, text/plain, 2 MB, NUL, SQL, `__proto__`, array, 300-character email: all 422 |
| Corrupt `pw_hash` value | 401, not 500 | PASS | |

## F1b isolation (independent SQL suite, 19 registered tables, 3 roles + system)

| Check | Expected | Result | Evidence |
|---|---|---|---|
| No context set, any tenant table, as app_user and app_system | 0 rows, no error | PASS | 18 tables x 2 roles |
| Client of A reads other client or its own staff-only tables | 0 | PASS | other client's rows are 0 on every table; notes, tasks, lead_events, automation, conversion_*, pipeline_stages, audit_log are 0 even for its own client |
| Client reads its own read/write tables | own rows only | PASS | contacts, leads, integrations, projects, notifications (own user), change_feed (no `task` rows) |
| Client writes | none on none/read tables; no DELETE; no moving a row to another client | PASS | 11 INSERTs refused; 11 UPDATE/DELETE statements touched 0 rows; `project_id` change is refused by WITH CHECK |
| Client updates its own leads | allowed (`write`) | PASS | by design: column limits are the service's job |
| audit_log is append-only | UPDATE, DELETE and TRUNCATE denied for super admin, client and system | PASS | 12 of 12 denied |
| audit_log spoofing | refused | PASS | another actor, another project, and system(A) writing project B are all refused |
| audit_log reads | super admin only | PASS | manager 0, client 0, super admin all |
| users columns | `pw_hash` unreadable; app_user cannot UPDATE users | PASS | `permission denied` |
| sessions, auth_tokens, rate_limits, error_log, webhook_events, integration_tokens | unreadable by app_user | PASS | all roles denied |
| Second super admin | refused | PASS | `users_one_super_admin` |
| system(A) sees only A; system(null) sees no tenant rows but lists projects | | PASS | A=1, B-from-A=0, null=0, projects=4 |
| Pool: 120 interleaved client / manager / super admin transactions on 4 connections | no crossing | PASS | 0 wrong |
| Pool: system(B) and client(A) interleaved | no crossing | PASS | 0 wrong of 60 |
| Connection reused after a failed transaction | no role or setting left | PASS | `current_user` is the connecting user, settings empty |
| project_members rules | client cannot add itself; one project per client | PASS | |
| project_members holds client users only | refused | **FAIL (open, O6)** | a manager was accepted as a member |
| system(A) reading webhook_events of B | ideally 0 | **FAIL (open, O7)** | the table has no RLS (design: system-only grants) |

## F1d queue, audit, alerts

| Check | Expected | Result | Evidence |
|---|---|---|---|
| Unexpected api error | 500 `INTERNAL`, `error_log` row, one alert mail via the worker | PASS | mail "[local] SharkX CRM alert" to the alert inbox |
| 10 identical unexpected errors | 10 error_log rows, 1 alert | PASS | +10 rows, +1 mail |
| error_log content | no email, token or password | PASS | message and context are redacted |
| Always-failing job (retryLimit 2) | 3 attempts, then failed, 1 alert | PASS | `1/3, 2/3, 3/3 last=true`; state `failed`; error_log +1; alert +1 |
| `singletonKey` | second send is a no-op | PASS | second `send` returned null; 1 mail |
| Audit rows | none missing for the 9 documented actions; meta never carries emails, tokens or passwords | PASS | 164 rows scanned; deleting the audit call in 5 services was caught each time |
| api logs | no email, token or password | PASS | 259 log lines scanned (route patterns only) |
| `GET /audit` | super admin only; keyset paging; filters | PASS | 24 pages, 164 distinct ids, no repeats; user + action filter; date filter; `limit=0`, bad projectId and malformed cursor give 422; manager and client give 403 |
| Seed twice | second run refused | PASS | "A super admin already exists." exit 1 |
| `db:migrate` on empty DB and again | clean, idempotent | PASS | |

## Attacks and hardening

| Check | Expected | Result | Evidence |
|---|---|---|---|
| Security headers on pages | CSP with nonce, HSTS, nosniff, Referrer-Policy (`no-referrer` on auth pages), XFO DENY, `frame-ancestors 'none'` | PASS | production build; every inline script on the auth pages carries the nonce; 0 CSP violations on EN/AR/FR login, reset, accept |
| api headers | nosniff, no-referrer, HSTS, `no-store` on non-public routes | PASS | |
| Session cookie | HttpOnly, SameSite=Lax, Path=/, no Domain; 15 min while pending, about 7 d after verify | PASS | `Secure` and `__Host-` are only applied outside `APP_ENV=local` (code and unit test checked; not observable over http) |
| CSRF on Server Actions | foreign Origin rejected | PASS | Next aborts with "Invalid Server Actions request" (HTTP 500, not 403); 3 code mails sent for 5 replays, so the foreign-origin calls did nothing |
| CSRF on cookie-authenticated route handlers | n/a | NOT TESTED | none exist yet (`/api/events`, `/api/export` are John's); `assertSameOrigin` is unit-tested |
| Protected path without a cookie | redirect to login | PASS | 307 to `/en/login`, also without a locale prefix |
| Pending cookie on a page that calls `requireSession` | redirect to `/code` | PASS | |
| Signed-in user on `/login` or a used invite link | redirected to the landing rule | PASS | |
| SQL context unset or wrong on a pooled connection | zero rows | PASS | see F1b |
| Client reading other clients or staff-only tables **through the UI, api or polling** | 0 | **NOT TESTABLE YET** | no tenant read routes exist; proven at database level only (O1) |
| Structure test: remove an audit call | a test fails | PASS | removed in `logout`, `requestReset`, `inviteUserTx`, `updateMe`, `confirmReset`: each caught (then restored) |
| Structure test: remove `assertCan` in `setUserStatus` | a test fails | PASS | caught |
| Structure test: open `/users/invite` to every role at route level | a test fails | **FAIL, closed** | all 112 tests passed because the service re-checks; now pinned by `tests/http/route-actions.test.ts` |
| Structure test: remove `can()` from a web Server Action | a test fails | **FAIL, closed** | the web test only checked for `defineAction(...)`; now `actions.test.ts` requires an `action:` on every signed-in action |

## Screens (Chromium; screenshots kept outside the repo)

| Check | Expected | Result | Evidence |
|---|---|---|---|
| Login at 360 px and 1280 px, EN and AR | no horizontal scroll; `dir=rtl` for AR | PASS | the layout mirrors correctly in RTL |
| Accept, code, reset and expired-link screens | usable | PASS (1280 px only) | I only captured these at desktop width; only login was captured at 360 px |
| Live password rules, mismatch message, disabled button | shown | PASS | |
| Code boxes | type, paste, wrong-code message with attempts left, boxes clear | PASS | "That code is not right. 4 attempts left." |
| Error states | readable, announced | PASS | `role=alert`, `aria-invalid` set |
| Keyboard focus | 3 px red ring | PASS | every focusable stop on login showed it |
| Arabic copy | translated | NOT YET | English text in an RTL layout; planned for the D18 batch |
| Landing pages `/clients` and `/p/<id>/overview` | exist | NOT YET | they do not exist (F2a/F2b), so after sign-in staff see Next's default 404 |

## Bugs found and fixed

| # | Bug | Failing test first | Fix commit |
|---|---|---|---|
| 1 | A password valid as typed (12 to 128 characters) could be under 12 or over 128 after NFKC normalisation; `hashPassword` threw `RangeError`, so accept-invite and reset-confirm answered **500** and raised an alert (real input: decomposed accents, or the character U+FDFA). Now a 422 and the link stays usable. | `src/modules/auth/regressions.test.ts` (4 cases) | `728659d` F1c: fix 500 on passwords that change length under NFKC |
| 2 | The login lockout read the count (peek) before the 100 ms password check and wrote it afterwards, so a parallel burst got unlimited guesses (12 of 12 got 401; limit is 5 per 15 min per email + IP). The attempt is now reserved with the atomic `hit` before verifying and given back on a correct password. | `src/modules/auth/login-burst.test.ts`, `rate-limit/index.test.ts` | `0aa6a7b` F1c: fix login lockout letting a parallel burst through |

Test gaps closed:
- `27a5f62` pins the route-level `can()` mapping for the user and audit routes.
- `2ab35c2` makes the web structure test require a `can()` action on every signed-in Server Action.

## Open issues, ranked

Nothing here needed a design decision from me except where noted; none blocks John.

**Medium**
- **O1.** The client-isolation walk through the UI, api and polling cannot be done yet. No tenant read route exists, only users and audit. Isolation is proven at database level (above). **Retest when F4b, F10a and F13 land.** John's pages and routes must go through `withTenant()` and `can()`.
- **O2.** Page guarding is per page. The proxy only checks that a cookie exists, so a page that forgets `requireSession()` is readable without a session. There is no structure test for pages yet. **John:** call it in the `(app)` layout (F2a), and add a test that fails for any page outside `(auth)` without it.
- **O3.** `accept-invite`, `reset/confirm` and `inspect` have no per-IP limit, and the 32 MiB scrypt hash runs before the token is checked. Anyone can send valid-looking tokens and force the hash each time (CPU and memory pressure). Suggested fix for Alex: check the token is live first (peek), or add an IP limit with the existing forms limiter. Not changed because it is a design choice.

**Low**
- **O4.** The login limit is per email + IP. An attacker rotating IPs gets 5 tries per IP. Two-factor (code) is the backstop. As specified; mention it to the client.
- **O5.** A correct password gives 429 instead of 401 while the account's code-send limit (3 per 10 min) is used up. That is a small "your password was right" signal. It needs the real user to be mid-sign-in.
- **O6.** `project_members` accepts a staff user (the spec says client users only). No role escalation results, because `app_client_project()` requires role = client, but session `projectIds` for staff would break the "staff = []" rule. Needs a trigger or CHECK (migration), so I left it.
- **O7.** `webhook_events` has no RLS. By design it is system-role-only, but `withSystem(A)` can read project B's raw payloads. Revisit in F3b and F5.
- **O8.** Defence in depth: the connecting role is a superuser (locally, and likely on Railway). Inside a tenant transaction raw SQL `SET LOCAL ROLE app_system` works. Isolation relies on never concatenating SQL; the `no-raw-pool` test and Drizzle parameters hold that today.
- **O9.** `knownAuditActions` in `contracts/audit.ts` lacks `user.locale_changed`, which `PATCH /me` writes. The F1e viewer's filter list would miss it. A contract change, so I did not touch it (additive `contracts:` commit; tell John).
- **O10.** The "letter" rule means A to Z only. An Arabic-only password with a digit is refused, which is odd in an Arabic UI. Product decision.
- **O11.** The `email.send` contract accepts the `invite`, `code` and `reset` templates, so nothing stops a producer from queuing a secret. Add an allow-list in `enqueue`.
- **O12.** Unknown URLs render Next's default English 404, not the branded page (the branded one only shows for `notFound()`). Its static scripts carry no nonce, so the console shows CSP errors there. Cosmetic.
- **O13.** A rejected Server Action origin returns HTTP 500 (Next's behaviour). A missing `Origin` header is accepted by Next; `SameSite=Lax` covers cross-site posts.
- **O14.** `GET /health` is public, does a DB and queue check per call with no rate limit, and shows version, commit and appEnv.
- **O15.** Not exercised: real Resend delivery, HTTPS (`Secure`, `__Host-`) cookies, Railway's `x-forwarded-for` shape, a screen reader, the accept/code/reset screens at 360 px, AR/FR copy.
- **O16.** Housekeeping: 5 Biome `useOptionalChain` warnings from before; `knownAuditActions` and `PLAN §7` still describe the login limit as "counted on failures", which stays true (successes are given back).
