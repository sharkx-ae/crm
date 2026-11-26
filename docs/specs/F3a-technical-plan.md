# F3a · Technical plan: WhatsApp onboarding and webhook receiver (F3.1, F3.2)

Owner: Alex · Written D9 (Wed 25 Nov 2026) · Inputs: CLAUDE.md, [F3a spec](F3a-whatsapp-onboarding.md), PRD F3, ARCHITECTURE §1, §4, §7, §8, CONTRACTS §3–§6, F14b (qr step), and the repo as of `8185bc5`.
Rules this plan keeps: no new dependencies (Node `crypto` + `fetch` only); web (BFF, no DB) → api route → service → db; tenant data only through `withTenant` / `withSystem`; every mutation `can()` + one audit row; webhooks verify → store → 200 → queue; no PII, tokens or message bodies in logs; no sending messages.

Meta facts below were checked on 2026-11-25 against the current docs (links at the end of §12). Where Meta's docs are silent or inconsistent, the plan says so instead of guessing.

**Decisions (Alex, 2026-11-25):** Embedded Signup **v5** (not v4 as the spec says) · QR path only: `FINISH` (`is_on_biz_app: false`) rejected · real test phone arranged later · no local tunnel: Meta checks run **in production** · `external_id` = body hash · static limit notice (`META_ONBOARDING_LIMITED`) · processed `webhook_events` pruned after 30 days · "Require app secret" on.

---

## 1. Current state vs target

| Item | Exists? | Action |
|---|---|---|
| `lib/crypto` | scrypt, `randomToken`, `sha256`, `safeEqual` | Add AES-256-GCM `sealToken` / `openToken`, a keyring parser and `hmacSha256` (§4.1) |
| `lib/env.ts` (api) `TOKEN_ENC_KEY: z.string().min(1).optional()` | yes, unused, no format | Format `<keyId>:<base64 32 bytes>` + `TOKEN_ENC_KEYS_OLD`; required whenever Meta is configured, and always outside local (§4.2) |
| Meta env vars | only placeholders in `api/.env.example`; nothing in either `env.ts` | api + worker: `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `META_ONBOARDING_LIMITED`. web: `META_APP_ID`, `META_ES_CONFIG_ID`, `META_GRAPH_VERSION` (§4.2) |
| Fastify raw body | none; the global JSON parser discards the bytes | Buffer parser registered **only inside the webhook plugin scope** (§5.2) |
| `modules/webhooks/schema.ts` `webhook_events` | yes; unique `(provider, external_id)`; system-only by grants | Keep. No schema change |
| `modules/whatsapp/schema.ts` `wa_numbers` | yes; `phone_number_id`, `waba_id` nullable, no index | `phone_number_id` NOT NULL + unique, `waba_id` NOT NULL + index, + `onboarded_at` (§3) |
| `integrations/hub/schema.ts` `integration_tokens` | yes; one token per integration, no link to a WABA | + `account_ref` (WABA id) + unique `(integration_id, account_ref)` (§3) |
| `integrations` | yes; unique `(project_id, platform)` | Keep: one `whatsapp` row per client, many numbers under it |
| RLS (`0002`) | `wa_numbers` write, `integration_tokens` none + REVOKE from app_user, `webhook_events` system grants | Keep. No new table, so no new `client_access` |
| `worker/registry.ts` `'webhook.process': {}` | yes | Keep the empty slot (F3b fills it). Jobs wait in the queue until then |
| `lib/queue` `enqueue()` | yes | Use with `singletonKey = webhookEventId` |
| web `buildCsp` (`lib/security.ts`), `proxy.ts` | strict CSP, no Facebook | Add a Meta variant used **only** on the integrations path (§7.2) |
| web `lib/action.ts`, `lib/api/client.ts` | yes | Reuse: `defineAction` + `apiCall` |
| web `p/[projectId]/integrations` page | no (nav link exists, falls to the not-found catch-all) | Temporary page with the connect button and number list (§6.3) |
| `messages/en/integrations.json` | no | New (English only) |
| `tests/fixtures/` | empty | `tests/fixtures/whatsapp/{webhooks,graph}/*` (§9) |

Spec deviation (tell nobody, note in the spec): "Files touched" lists `src/app/api/oauth/meta/*`. The JS SDK flow returns the code in the browser callback, not through a redirect, so **no OAuth callback route is needed**. The code goes Server Action → internal api route.

---

## 2. Contract changes (one `contracts:` commit, T0, before any route push)

All additive. No version bump (same as the 2026-11-23 additive change). After it: `node scripts/sync-contracts.mjs`, both apps typecheck.

### 2.1 `common.ts`
| Change | Kind |
|---|---|
| `waSyncState = z.enum(['none', 'syncing', 'done', 'missed'])` | additive (moves the literal list out of `db/schema/enums.ts`, which then reads it from the contract like the others) |

### 2.2 `whatsapp.ts` (new)
| Schema | Shape |
|---|---|
| `metaId` | `z.string().regex(/^\d{1,32}$/)` (Graph ids are numeric strings) |
| `waSignupEvent` | `z.enum(['FINISH', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'])` |
| `waConnectRequest` | `{ code: z.string().min(1).max(2048), event: waSignupEvent, messagingAccountIds: z.array(metaId).min(1).max(10), phoneNumberId: metaId, isOnBizApp: z.boolean() }` (v5 session info fields; project id is in the path) |
| `waNumber` | `{ id: uuid, phoneE164: e164, label: z.string().nullable(), syncState: waSyncState, syncPct: z.number().int().min(0).max(100), onboardedAt: iso }`. Client-safe as is: no WABA id, no phone number id, no token data |
| `waNumbersResponse` | `{ numbers: waNumber[], connect: z.object({ ready: z.boolean(), limited: z.boolean() }) }` (`ready` false when Meta is not configured on the api; `limited` = the unverified-business notice, §6.5) |
| `waConnectResponse` | `{ numbers: waNumber[] }` (only the numbers this connect added or refreshed) |

### 2.3 `audit.ts`
- `knownAuditActions` += `integration.connected` (one row per connect; `entity: 'integration'`, `entityId` = integrations.id, `meta: { platform: 'whatsapp', numberIds: uuid[], reconnect: boolean }`; no phone numbers, no Meta ids).

### 2.4 `index.ts`
- `export * from './whatsapp.ts'`.

### 2.5 What to tell John (before the push)
- New `contracts/whatsapp.ts` and `waSyncState`. He does not consume them yet; F3c/F13a will read `waNumber`.
- `integration.connected` in `knownAuditActions` (his audit viewer filter list picks it up).
- Two one-line edits in files he authored, each in its own commit: `web/src/lib/env.ts` (three optional Meta vars, §4.2) and `web/src/lib/i18n/request.ts` (`'integrations'` added to `MESSAGE_MODULES` and `CLIENT_MODULES`).
- The `integrations` nav item (already in his route table) now resolves to a real page instead of not-found.
- Docs in the same day's docs commit: CONTRACTS.md change line + §6 internal routes; ARCHITECTURE §8 key format.

---

## 3. Data model

### 3.1 Changes (one migration, next free number after `git pull --rebase`; John's F4a `0003` may already be in)
| Table | Change | Why |
|---|---|---|
| `wa_numbers` | `phone_number_id` **NOT NULL** + **unique** (`wa_numbers_phone_number_id_unique`) | Webhook routing key (`value.metadata.phone_number_id`); a number can belong to one client only |
| `wa_numbers` | `waba_id` **NOT NULL** + index `wa_numbers_waba_idx` | `account_update` webhooks carry only the WABA id (`entry[].id`); token lookup |
| `wa_numbers` | + `onboarded_at timestamptz NOT NULL default now()` | Meta allows the history sync only within 24 h of onboarding; F3b needs the clock, and a reconnect restarts it (`created_at` does not) |
| `wa_numbers` | `phone_e164` unique (exists) | Kept: the second guard for "linked to another client" |
| `integration_tokens` | + `account_ref text NOT NULL` + unique `(integration_id, account_ref)` | One business token per WABA (each Embedded Signup run is one WABA); several numbers per client can sit in different WABAs |

The tables are empty in every environment (nothing writes them before F3a), so `SET NOT NULL` is safe. Generated by `pnpm db:generate` (no hand-written SQL needed: no RLS change). Pushed the same day.

### 3.2 RLS and `client_access` (no change, verified against 0002)
| Table | client_access | Who writes in F3a |
|---|---|---|
| `integrations` | write | connect service, inside `withSystem(projectId)` |
| `integration_tokens` | none + `REVOKE ALL FROM app_user` | connect service, `withSystem(projectId)` only |
| `wa_numbers` | write (read is what the client needs; write kept for connectors) | connect service, `withSystem(projectId)` |
| `webhook_events` | system-only by grants, no RLS | webhook route, `withSystem(null)` |

Why the connect transaction is `withSystem(projectId)` and not `withTenant`: the token row must be written in the same transaction, and `app_user` has no privilege on `integration_tokens` at all. The route has already run `can(session, 'integration.manage', projectId)`; the audit row carries the real actor (`audit_insert` for `app_system` accepts `project_id = app_project_id()`).

"Number already linked to another client": RLS hides other clients' rows, so the service cannot look first. It does not need to: the unique constraints on `phone_number_id` and `phone_e164` hold across all rows regardless of RLS, so the insert fails with `23505` and the service maps it to `CONFLICT { reason: 'number_taken' }`. Nothing about the other client is revealed.

**Note for F3b (my own, not F3a work):** routing a webhook to its project (`phone_number_id` → `project_id`) is a cross-project read. `withSystem(null)` sees no `wa_numbers` row. F3b needs a system-only read policy like `projects_list` (e.g. `wa_numbers_route FOR SELECT TO app_system USING (app_project_id() IS NULL)`) in its own migration.

---

## 4. Module layout

### 4.1 api
| File | Job |
|---|---|
| `src/contracts/{common,whatsapp,audit,index}.ts` | §2 |
| `src/db/schema/enums.ts` | `waSyncStateEnum` takes its values from `c.waSyncState` |
| `src/lib/crypto/index.ts` | + `hmacSha256(key, data: Buffer \| string): Buffer`; + `sealToken`, `openToken`, `parseKeyring` (below) |
| `src/lib/crypto/index.test.ts` | + round trip, tamper (ciphertext, tag, iv, AAD, key id), wrong key, old-key decrypt, keyring parse errors |
| `src/lib/env.ts` | §4.2 |
| `src/modules/webhooks/signature.ts` | `verifyMetaSignature(raw: Buffer, header: string \| undefined, appSecret: string): boolean` |
| `src/modules/webhooks/service.ts` | `storeWebhook(provider, raw: Buffer, payload: unknown) → { id, duplicate, processed }` (insert … ON CONFLICT DO NOTHING); `externalIdOf(raw)` |
| `src/modules/webhooks/index.ts` | Public API: `verifyMetaSignature`, `storeWebhook` |
| `src/routes/webhooks/meta.ts` | `GET /webhooks/meta` (handshake), `POST /webhooks/meta` (signature → store → enqueue → 200). Spec mapping `src/app/api/webhooks/meta/*` → `api/src/routes` |
| `src/modules/whatsapp/graph.ts` | Thin Graph client over `fetch`: `exchangeCode`, `debugToken`, `listPhoneNumbers`, `subscribeApp`. Base `https://graph.facebook.com/${META_GRAPH_VERSION}`, `AbortSignal.timeout(10_000)`, `Authorization: Bearer`, `appsecret_proof` on every token call. Errors → `GraphError { status, code, subcode, fbtraceId }` (never the token, never the URL query). `setGraphFetch()` for tests |
| `src/modules/whatsapp/service.ts` | `connectWhatsApp(session, projectId, input)`, `listWaNumbers(session, projectId)`; Graph error → plain reason map (§6.4) |
| `src/modules/whatsapp/phone.ts` | `toE164(displayPhoneNumber)`: keep digits, prefix `+`, validate with contract `e164` (no libphonenumber: Meta's `display_phone_number` always carries the country code) |
| `src/modules/whatsapp/routes.ts` | `GET /projects/:projectId/whatsapp/numbers`, `POST /projects/:projectId/whatsapp/connect` |
| `src/modules/whatsapp/index.ts` | Public API: `whatsappRoutes`, `listWaNumbers` |
| `src/modules/whatsapp/schema.ts`, `integrations/hub/schema.ts` | §3.1 |
| `src/app.ts` | Register `metaWebhookRoutes` and `whatsappRoutes` |
| `.env.example` | §4.2 |

#### `lib/crypto` token sealing (gap 1)
```ts
export type Keyring = { current: { id: string; key: Buffer }; old: Map<string, Buffer> };
export function parseKeyring(current: string, old?: string): Keyring;   // "<id>:<b64>" and "id:b64,id:b64"
export function sealToken(ring: Keyring, plain: string, aad: string): { encValue: string; keyId: string };
export function openToken(ring: Keyring, sealed: { encValue: string; keyId: string }, aad: string): string;
```
- AES-256-GCM, 12-byte random IV per seal, 16-byte tag. `encValue = "v1." + b64url(iv) + "." + b64url(ciphertext) + "." + b64url(tag)`; `key_id` column holds the key id (ARCHITECTURE §8 "key-id prefix": the id travels with the row).
- AAD = `"integration_tokens:" + projectId + ":" + integrationId + ":" + accountRef`. A ciphertext copied to another client's row fails to open.
- Key id `/^[a-z0-9]{1,16}$/`; key must decode to exactly 32 bytes; ids unique across current + old.
- `openToken` failure throws one generic `TokenOpenError` (no detail that helps an attacker; no value in the message).
- Rotation: generate `k2`, set `TOKEN_ENC_KEY=k2:…`, move the old value into `TOKEN_ENC_KEYS_OLD=k1:…`. New seals use k2; old rows still open. Re-sealing old rows happens on reconnect (and a one-off script later if ever needed; not in F3a).
- Generate: `node -e "console.log('k1:'+require('node:crypto').randomBytes(32).toString('base64'))"`.

### 4.2 Environment (gap 3)
| Variable | api | worker | web | Rule |
|---|---|---|---|---|
| `TOKEN_ENC_KEY` | ✓ | ✓ | | `<id>:<base64 32 bytes>`. Required when `APP_ENV≠local` or when `META_APP_SECRET` is set |
| `TOKEN_ENC_KEYS_OLD` | ✓ | ✓ | | optional, comma list, decrypt only |
| `META_APP_ID` | ✓ | ✓ | ✓ | numeric string |
| `META_APP_SECRET` | ✓ | ✓ | | secret; HMAC key for signatures and `appsecret_proof` |
| `META_WEBHOOK_VERIFY_TOKEN` | ✓ | | | 32+ random chars, our own value, typed into the Meta dashboard |
| `META_GRAPH_VERSION` | ✓ | ✓ | ✓ | `/^v\d+\.0$/`, default `v27.0` (the latest in Meta's examples today). One value everywhere |
| `META_ES_CONFIG_ID` | | | ✓ | Facebook Login for Business configuration id |
| `META_ONBOARDING_LIMITED` | ✓ | | | `true` until Meta business verification + access verification are done (§6.5) |

- api: a `meta` group, all-or-none (`APP_ID`, `APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`), **optional on every environment**: production may deploy before App Review. When absent: the webhook route answers 404 and `connect.ready` is false (UI shows "Awaiting access").
- web: `META_APP_ID` + `META_ES_CONFIG_ID` all-or-none, optional. Read on the server and passed to the client component as props (not `NEXT_PUBLIC_*`, so Railway changes need no rebuild). Both values are public by nature (they appear in the page).
- New getters: `getMetaEnv()` and `getCryptoEnv()` (api and worker both use them, like `getEmailEnv`).
- `.env.example` (api and web) and `docs/ENVIRONMENTS.md` updated in the same commit.

### 4.3 web
| File | Job |
|---|---|
| `src/contracts/*` | Regenerated only |
| `src/lib/env.ts` | §4.2 (John's file, own commit, told) |
| `src/lib/security.ts` | `buildCsp(nonce, dev, opts?: { meta?: boolean })`; `isMetaPath(pathname, locales)` |
| `src/proxy.ts` | Pass `meta: true` only for `/[locale]/p/[id]/integrations` |
| `src/lib/actions/whatsapp.ts` (`'use server'`) | `connectWhatsApp = defineAction({ input: waConnectRequest.extend({ projectId: z.uuid() }), action: (i) => ({ action: 'integration.manage', projectId: i.projectId }) }, …apiCall(waConnectResponse, …POST))` |
| `src/lib/data/whatsapp.ts` (`server-only`) | `getWaNumbers(projectId)` → `apiCall(waNumbersResponse, …)` |
| `src/app/[locale]/(app)/p/[projectId]/integrations/page.tsx` | **Temporary** (replaced by F14b): page guard via `canViewRoute('integrations', projectId)`, reads numbers, renders the card |
| `src/components/integrations/whatsapp-connect.tsx` (`'use client'`) | Loads the SDK, runs Embedded Signup, pairs code + session event, calls the action, shows mapped errors |
| `src/components/integrations/wa-number-list.tsx` | Numbers table (number, label, sync state + %, connected date) |
| `messages/en/integrations.json` | §8 |
| `src/lib/i18n/request.ts` | + `'integrations'` in both lists (John's file, own commit, told) |
| `src/lib/security.test.ts` | Meta CSP only on the integrations path; default CSP unchanged |

---

## 5. API surface

| Method + url | Access | can() | Audit | Body / query | Response |
|---|---|---|---|---|---|
| `GET /webhooks/meta` | public | — | (GET) | `hub.mode`, `hub.verify_token`, `hub.challenge` | `text/plain` challenge, or 403 |
| `POST /webhooks/meta` | public | — | `none` | raw buffer (≤ 5 MiB) | `{ ok: true }` 200; 401 bad signature |
| `GET /projects/:projectId/whatsapp/numbers` | session | `integration.manage` on `projectId` | (GET) | — | `waNumbersResponse` |
| `POST /projects/:projectId/whatsapp/connect` | session | `integration.manage` on `projectId` | `one` | `waConnectRequest` | `waConnectResponse` |

Client asking about another client's project → 404 (route guard, existing behaviour). `integration.manage` is ALL roles, so a client user connects its own numbers (PRD F3: "a SHARKX user or the client's own user").

### 5.1 Handshake (`GET /webhooks/meta`)
1. Meta not configured → 404.
2. Query schema: `hub.mode` = `'subscribe'`, `hub.verify_token` string ≤ 256, `hub.challenge` string ≤ 256 (`/^[\w-]+$/`). Anything else → 403 (`FORBIDDEN`).
3. `safeEqual(verify_token, META_WEBHOOK_VERIFY_TOKEN)` else 403.
4. Reply 200, `content-type: text/plain`, body = challenge. Nothing stored.

### 5.2 Receiver (`POST /webhooks/meta`) (gap 2)
Raw body, scoped: `routes/webhooks/meta.ts` is its own Fastify plugin (encapsulated, no skip-override). Inside it only:
```ts
scope.removeContentTypeParser('application/json');
scope.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 5 * 1024 * 1024 },
  (_req, body, done) => done(null, body));
```
Every other route keeps the normal JSON parser. `defineRoute` still registers the route (body schema `z.custom<Buffer>(Buffer.isBuffer)`), so the `onRoute` guard and logging stay.

Order (each step stops on failure):
1. Meta not configured → 404.
2. `verifyMetaSignature(raw, req.headers['x-hub-signature-256'], META_APP_SECRET)`: header must match `/^sha256=[0-9a-f]{64}$/`; expected = `hmacSha256(appSecret, raw)`; compare with `timingSafeEqual` on the 32-byte buffers. Fail → **401 `UNAUTHENTICATED`, nothing stored, nothing logged except `{ route, reason: 'bad_signature' }`**. The hash is over the exact bytes received, so Meta's escaped-unicode payloads verify without any re-serialisation.
3. `JSON.parse(raw)` → fail → 422, nothing stored (cannot happen with a genuine Meta body).
4. Minimal envelope check `{ object: z.string(), entry: z.array(z.unknown()) }` → fail → still store (the sender is authentic; F3b marks the row with an error) — Meta would otherwise retry for 7 days.
5. `storeWebhook('meta', raw, payload)` in `withSystem(null)`:
   `INSERT INTO webhook_events (provider, external_id, payload) VALUES ('meta', $ext, $json) ON CONFLICT (provider, external_id) DO NOTHING RETURNING id`; on conflict, `SELECT id, processed_at` of the existing row.
6. After commit: if new, or duplicate with `processed_at IS NULL` → `enqueue('webhook.process', { webhookEventId }, { singletonKey: webhookEventId })`. A duplicate that is already processed is not queued.
7. Reply 200 `{ ok: true }`.
   If the enqueue throws, reply 500: Meta retries, the retry hits the duplicate branch with `processed_at IS NULL`, and enqueues again. No event is lost and none is processed twice (singletonKey + F3b's `wa_message_id` unique).

**`external_id` derivation.** Meta's webhooks carry no delivery id (checked: the `account_update` reference defines none; messages have `messages[].id`, but statuses, history and account events do not share one key, and one POST may batch up to 1000 changes). So `external_id = "sha256:" + hex(sha256(raw body))`. A retry of the same delivery is the same bytes → one row. If Meta ever re-batches a retry differently, two rows can exist, and F3b's per-item keys (`wa_messages.wa_message_id` unique) still keep messages single. `provider = 'meta'` for both WhatsApp (`object: whatsapp_business_account`) and later Lead Ads (`object: page`, F5); `webhook.process` dispatches on `payload.object`. `project_id` stays NULL here; F3b fills it when routing.

Not done here: no parsing of changes, no project lookup, no `lastWebhookAt` (F14a).

---

## 6. Flows

### 6.1 F3.1 Connect, end to end
```
Browser (whatsapp-connect.tsx)                web Server Action          api POST …/whatsapp/connect                Meta Graph
1 load SDK (nonce) → FB.init
2 FB.login(config_id, code, extras) ─────────────── popup: business picks/creates portfolio, scans QR in WhatsApp Business app
3 callback: authResponse.code      ┐
4 message event WA_EMBEDDED_SIGNUP ┘ both received (≤ 60 s apart)
5 connectWhatsApp({projectId, code, event, messagingAccountIds, phoneNumberId, isOnBizApp}) ─→ defineAction: zod, session, can() ─→ apiCall
                                                                         6 route: can(integration.manage, projectId)
                                                                         7 exchangeCode(code) ─────────────────────→ GET/POST oauth/access_token
                                                                         8 debugToken(token) ──────────────────────→ GET debug_token
                                                                           every messagingAccountId ∈ granular_scopes targets? else reject
                                                                         9 listPhoneNumbers(each WABA) ────────────→ GET {waba}/phone_numbers
                                                                        10 subscribeApp(that WABA) ────────────────→ POST {waba}/subscribed_apps
                                                                        11 withSystem(projectId) tx: integration, token, numbers, audit, change_feed
                                                                        12 → { numbers }
13 UI: number appears with sync "Not started" (0 %)
```

**Browser (steps 1–4).** Embedded Signup **v5** (implementation page for the SDK calls; v5 page for `extras` and the session info):
```js
FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
FB.login(cb, {
  config_id: configId,
  response_type: 'code',
  override_default_response_type: true,
  extras: { setup: {}, version: 'v5' },   // one constant: ES_EXTRAS. WhatsApp Business app onboarding is on by default in v5
});
window.addEventListener('message', (e) => {
  if (!e.origin.endsWith('facebook.com')) return;            // Meta's own check; we tighten it to https://www.facebook.com and https://web.facebook.com
  const d = JSON.parse(e.data); if (d.type !== 'WA_EMBEDDED_SIGNUP') return;
  // d.event: FINISH | FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING | CANCEL | ERROR
});
```
- v5 facts (v5 page): `extras.version: "v5"` selects it; `sessionInfoVersion` and `featureType` are not needed (ignored); products still come from the Facebook Login for Business configuration; cancel and error events are unchanged from session info v3.
- v5 session info: `data.messaging_account_ids` (replaces `waba_id`), `data.phone_number_id`, `data.business_id`, `data.is_on_biz_app`, `data.primary_waac_ids` (empty for now, ignored). `event` is `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` when `is_on_biz_app` is true, `FINISH` when false.
- `FINISH` (a new Cloud API number, not the QR path) is refused in the browser with `reasons.qr_only` and again by the api (decision Q2).
- The browser values are hints only: the server checks the WABA ids against the token (step 8) and the phone id against the WABA's own number list (step 9).
- `CANCEL` (`data.current_step`) → back to the start, neutral text. `ERROR` (`data.error_code`, `error_message`) → §6.4 mapping. Neither calls the api.
- The code lives 5 minutes (implementation page). The component submits as soon as both halves arrive; a 60 s pairing timeout shows "Try again".
- One click = one flow: the button is disabled while the popup is open or the action runs.

**api (steps 6–12).** `connectWhatsApp(session, projectId, input)`:
1. Meta or `TOKEN_ENC_KEY` not configured → `INTEGRATION_ERROR { reason: 'not_configured' }`.
2. `input.event === 'FINISH'` or `isOnBizApp === false` → `INTEGRATION_ERROR { reason: 'qr_only' }` (decision Q2: F3a covers the QR path only). Checked before the code is exchanged.
3. `exchangeCode`: documented as `GET https://graph.facebook.com/<v>/oauth/access_token?client_id&client_secret&code` → `{ access_token, token_type: 'bearer' }` (Tech Provider onboarding page). We send the same parameters as a form-encoded POST to keep the app secret out of any URL (Graph accepts parameters in the body); if T6 shows POST refused, fall back to the documented GET and make sure the URL is never logged. Failure → `{ reason: 'code_expired' }`.
4. `debugToken`: `GET /debug_token?input_token=<business token>` with the app token (`<app_id>|<app_secret>`, Bearer). Check `is_valid`, `app_id === META_APP_ID`, and that every id in `input.messagingAccountIds` is in `granular_scopes[scope='whatsapp_business_management'].target_ids`. **The browser's account ids are untrusted**: without this check a user could attach someone else's WABA id to a valid code. Mismatch → `{ reason: 'waba_mismatch' }`. Store `expires_at` (Meta returns a unix time; the system-user business token normally has none, so we store NULL when it is 0 or absent; the doc does not say what 0 means, so we treat 0 as "no expiry" and F14a health catches an invalid token).
5. `listPhoneNumbers`: for each verified WABA, `GET /<waba_id>/phone_numbers?fields=id,display_phone_number,verified_name,is_on_biz_app,platform_type`. `input.phoneNumberId` must be in one of the lists with `is_on_biz_app = true` (Meta's Coexistence check expects `is_on_biz_app: true`, `platform_type: "CLOUD_API"`); that number's WABA is the one we keep. Not found → `{ reason: 'no_number' }`. Other numbers in the WABA are not connected by this run.
6. `subscribeApp`: `POST /<waba_id>/subscribed_apps` (the WABA from step 5), `Authorization: Bearer <business token>`, no body → `{ success: true }`. Idempotent; done before the DB transaction because it is harmless if the transaction then rejects (a number already linked to another client means the WABA is already subscribed for that client). Failure → `{ reason: 'subscribe_failed' }`.
7. **Skip** `POST /<phone_number_id>/register`: Meta's Coexistence page says the number is already registered.
8. Transaction, `withSystem(projectId)`:
   - upsert `integrations (project_id, 'whatsapp')`: `status 'connected'`, `mode 'live'`, `account_label = verified_name` of the first number, `note = null`.
   - upsert `integration_tokens (integration_id, account_ref = waba_id)`: `sealToken(ring, token, aad)`, `key_id`, `expires_at`.
   - per number: `SELECT … WHERE phone_number_id = $1` (visible only if this client's) → update `waba_id`, `label`, `onboarded_at = now()`, `sync_state 'none'`, `sync_pct 0`; else insert. `23505` on `phone_number_id` or `phone_e164` → roll back, `CONFLICT { reason: 'number_taken' }`.
   - `audit(tx, { actor: { kind: session.role === 'client' ? 'client' : 'user', id: session.userId }, projectId, action: 'integration.connected', entity: 'integration', entityId, meta: { platform: 'whatsapp', numberIds, reconnect } })`.
   - `emitChange(tx, 'health', projectId, integrationId)` (hub/bell refresh; clients receive `health`).
9. The token never leaves this function: not in the response, logs, audit, errors or job payloads.
10. History sync (`POST /<phone_number_id>/smb_app_data`, `sync_type: smb_app_state_sync` then `history`, once each, within 24 h) is **F3b**. F3a leaves `sync_state 'none'` and records `onboarded_at`.

### 6.2 F3.2 Webhook
§5.1 and §5.2.

### 6.3 Temporary connect button (gap 5)
- Lives at `web/src/app/[locale]/(app)/p/[projectId]/integrations/page.tsx` plus `src/components/integrations/*`. That path is F14b's, and F14b is mine since the ownership change, so **no John file is edited** except the two one-line edits in §2.5.
- The nav item `integrations` (roles ALL, `integration.manage`, per project) already exists in John's route table; the page applies the same guard (`canViewRoute`) and shows the not-found page otherwise.
- One card, brand skill: title "WhatsApp", short explanation, the **one** primary red button "Connect a WhatsApp number" (another number = same button again), numbers table with red header (number, label, sync, connected), the limit notice (§6.5) as a neutral info box, the "Awaiting access" state when `connect.ready` is false.
- F14b replaces the page with the hub card + generic wizard; the connect component becomes the `qr` step's body. `whatsapp-connect.tsx` is written so the wizard can mount it unchanged (props: `projectId`, `appId`, `configId`, `graphVersion`, `onConnected`).
- Polling: the qr step "polls status until connected or timed out" (F14b). Here there is nothing to poll: completion arrives through the SDK callback, and the action returns the numbers. `router.refresh()` after success.

### 6.4 Errors in plain words
Two sources:

**A. Embedded Signup `ERROR` event (browser).** `error_code` → `integrations.whatsapp.signupErrors.<code>`; unknown codes show Meta's own `error_message` (Meta writes these for end users) followed by "(code N)". Codes from Meta's errors page:
| Code | Our message (EN, plain) | Spec edge case |
|---|---|---|
| 4563015 | "Update the WhatsApp Business app to the latest version, then try again." | app below 2.24.17 |
| 3441077 | "This number can't be connected yet. Keep using it in the WhatsApp Business app for a few more days, then try again." | number active < 7 days (Meta's text: "isn't eligible yet") |
| 3441069 | "This number is on personal WhatsApp. Move it to the WhatsApp Business app first." | |
| 3441148, 3441130 | "This number isn't on the WhatsApp Business app, so it can't be connected with a QR code." | |
| 3441042 | "WhatsApp doesn't allow this connection for numbers from this country yet." | |
| 2388098, 3441110 | "SHARKX has reached Meta's limit for new WhatsApp connections this week. Try again in a few days." | unverified-business limit |
| 3441151 | "Too many QR codes were requested. Wait a few minutes and try again." | |
| 3441112, 3441113, 3441127 | "The QR code didn't work. Get a new code and scan it again." | |
| 3441093, 3441145 | "This number is still being disconnected from its previous connection. Try again later." | |
| 3441091, 3441079, 3441095, 2655093 | "This number is connected through another provider. Disconnect it there first." | |
| 3441107, 3441126, 2655111 | "WhatsApp connections aren't enabled yet for SHARKX. Contact SHARKX." | before Tech Provider / Advanced access |

**B. api `INTEGRATION_ERROR` / `CONFLICT` with `details.reason`** → `integrations.whatsapp.reasons.<reason>`:
`not_configured`, `qr_only`, `code_expired`, `waba_mismatch`, `no_number`, `subscribe_failed`, `graph_unavailable` (timeout/5xx), and `number_taken` (CONFLICT 409: "This number is already connected to another client in SHARKX. Disconnect it there first."). The generic `errors.<code>` stays the fallback. Logged per failure: `{ route, reason, graphCode, graphSubcode, fbtraceId }` only.

### 6.5 Unverified-business onboarding limit (surfaced, not hidden)
- Meta's errors page has 2388098 ("You can only create a limited number of WhatsApp Business Accounts before your business verification") and 3441110 (portfolio at its phone number limit). The "10 new customers per rolling 7 days, 200 after verification" figure comes from Infobip and Twilio partner docs, not a Meta page I could find (sources in §12): treat the number as unconfirmed.
- Surfacing: while `META_ONBOARDING_LIMITED=true`, `connect.limited` is true and the card shows an info box: "Until Meta finishes verifying SHARKX, WhatsApp allows only a few new connections per week (about 10). If a connection is refused for this reason, you'll see it here." Plus the mapped error in §6.4. We do not count connections ourselves (that needs a cross-client read and Meta's count includes connections made outside this app); see Q6.

---

## 7. Security design

### 7.1 Webhook and tokens
- Signature before anything; constant-time compare; no storage or queueing before it passes; the handshake token compared with `safeEqual`.
- Raw-body parser scoped to one plugin; 5 MiB limit there (history webhooks can be large); default 1 MiB elsewhere.
- `webhook_events.payload` holds phone numbers and message bodies (DB only, system-only grants; never logged). Retention (decision Q7): the daily `maintenance` job deletes rows with `processed_at < now() - 30 days` (unprocessed rows are kept, so nothing is lost before F3b handles it). `worker/jobs/maintenance.ts` + `tests/worker/maintenance.test.ts`; ARCHITECTURE §5 maintenance line updated in T11.
- Tokens: sealed with AAD bound to the row; `app_user` has no grant on `integration_tokens`; decrypted only in adapters (F3b sync, F14a health). `appsecret_proof` on every Graph call with a user/business token; "Require app secret" is on in the app settings (decision Q8), so a leaked business token alone cannot call Graph.
- Graph responses parsed with Zod (only the fields we use); unexpected shapes → `graph_unavailable`.
- `can()` in the action (UX) and the route (enforcement); 404 for a foreign project.

### 7.2 CSP for the Facebook JS SDK (gap 4)
Current CSP: `script-src 'self' 'nonce-…' 'strict-dynamic'`, `connect-src 'self'`, no `frame-src` (falls back to `default-src 'self'`). With `'strict-dynamic'`, host allowlists in `script-src` are ignored, so the SDK must be loaded by a nonce-carrying script: `<Script src="https://connect.facebook.net/en_US/sdk.js" nonce={nonce} strategy="afterInteractive" />` (nonce read from `x-nonce` in the server page and passed down). Scripts the SDK injects are then trusted by `'strict-dynamic'`.

Meta variant, **only** on `/[locale]/p/[id]/integrations` (least privilege; every other page keeps today's CSP):
```
script-src  'self' 'nonce-…' 'strict-dynamic' https://connect.facebook.net   (host kept for CSP2 browsers)
frame-src   https://www.facebook.com https://web.facebook.com https://staticxx.facebook.com
connect-src 'self' https://*.facebook.com https://graph.facebook.com
img-src     'self' data: blob: https://*.facebook.com https://*.fbcdn.net
```
- The signup itself runs in a popup (not restricted by our CSP). No `Cross-Origin-Opener-Policy` is set today; it must stay unset (or `same-origin-allow-popups`) on this page, or the popup loses `window.opener` and the flow hangs. Test asserts it.
- `X-Frame-Options: DENY` / `frame-ancestors 'none'` are about others framing us: unchanged.
- T8 verifies the exact hosts in the browser console (CSP violation reports) and trims the list to what is actually used.

---

## 8. i18n (English only; AR/FR at the D18 batch)
`messages/en/integrations.json`, namespace `integrations`:
- `whatsapp.title`, `whatsapp.intro`, `whatsapp.connect` ("Connect a WhatsApp number"), `whatsapp.connecting`, `whatsapp.connected` ("{number} is connected."), `whatsapp.cancelled`, `whatsapp.timeout`, `whatsapp.awaiting` ("WhatsApp connections are waiting for Meta approval."), `whatsapp.limitNotice`
- `whatsapp.table.{number,label,sync,connected,empty}`; `whatsapp.sync.{none,syncing,done,missed}` ("Not started", "Syncing {pct}%", "Done", "Reconnect needed")
- `whatsapp.signupErrors.<code>` (§6.4 A) and `whatsapp.signupErrors.unknown` ("{message} (code {code})")
- `whatsapp.reasons.<reason>` (§6.4 B)
Logical properties only (`ms-`, `ps-`, `text-start`); RTL checked with `dir="rtl"` on the page before push.

---

## 9. Test plan

### 9.1 Fixtures (`api/tests/fixtures/whatsapp/`)
- `webhooks/*.json`: `messages-text.json`, `messages-arabic.json` (non-ASCII, proves raw-byte hashing), `smb-message-echoes.json`, `history.json`, `account-update-partner-removed.json`, `batched-two-changes.json`. Built first from Meta's reference examples, **replaced by recordings** from production during T4/T10 (phone numbers, names and message text scrubbed to fake values before committing). Add `session-info-v5-biz-app.json` and `session-info-v5-finish.json` for the web component's parser test. Stored as raw bytes; read with `readFile` (Buffer), never re-serialised.
- Signatures: tests sign the raw bytes with a test secret (`test-app-secret`); no real secret in git. One vector file `signature-vector.json` `{ secret, bodyFile, header }` checks our HMAC against a precomputed header.
- `graph/*.json`: `oauth-token.json`, `debug-token.json`, `debug-token-other-waba.json`, `phone-numbers-coex.json`, `phone-numbers-empty.json`, `subscribed-apps.json`, `error-code-expired.json`, `error-500.json`.

### 9.2 Unit (no DB)
- crypto: round trip; tamper each of iv / ciphertext / tag / AAD / key id → `TokenOpenError`; old key opens, new seals use current; keyring rejects 31/33-byte keys, bad ids, duplicate ids.
- `verifyMetaSignature`: valid; one flipped byte in body; wrong secret; missing header; `sha1=`; upper-case hex; 63-char hash; re-serialised JSON fails while raw bytes pass (Arabic fixture).
- `externalIdOf`: stable for identical bytes, different for one changed byte.
- `toE164`: `"+1 555-012-3456"` → `+15550123456`; garbage → error.
- Graph client: Bearer header and `appsecret_proof` present; secret never in a URL; timeout → `graph_unavailable`; error body → `GraphError` fields.
- web: `buildCsp` meta variant only on the integrations path; default unchanged; signup error mapping (known code, unknown code).

### 9.3 Integration (Docker Postgres, `app.inject`)
- Handshake: right token → 200 + challenge as `text/plain`; wrong token, wrong mode, missing params → 403; Meta unset → 404.
- Receiver: bad signature → 401 **and** `webhook_events` count unchanged **and** no job; good → 200, one row (`provider 'meta'`, `external_id sha256:…`), one `webhook.process` job with that id.
- Idempotency: same body twice → one row, one job; second delivery after `processed_at` set → no job; second delivery with `processed_at` NULL → enqueue attempted with the same singletonKey (still one job).
- Enqueue failure (stub throws) → 500, row stored; redelivery → 200 + job.
- Non-JSON content type → 422, nothing stored; > 5 MiB → 413/422, nothing stored; other routes still parse JSON normally (regression on `/auth/login`).
- Connect (Graph stubbed): happy path → integration `connected`, token row sealed (opens with the AAD; `enc_value` does not contain the token), number row, exactly one audit row (route assertion), one `change_feed` health row; reconnect same number → update, `onboarded_at` moves, still one number; client user on own project → ok; client on another project → 404; `waba_mismatch`, `no_number`, `code_expired`, `subscribe_failed` → right reason, no rows; number linked to client B while connecting client A → 409 `number_taken`, nothing written for A, nothing about B in the response.
- Numbers list: staff any project; client own only; response has no WABA/phone-number ids.
- Structure: `tests/http/guard.test.ts` picks up the new routes (access, action, audit declared).

### 9.4 RLS (`tests/rls/`)
- Update the seed factories for `wa_numbers` (now needs `phone_number_id`, `waba_id`) and `integration_tokens` (`account_ref`).
- Existing matrix already covers `wa_numbers` (write) and `integration_tokens` (no grant to app_user). Add: client A cannot read client B's `wa_numbers`; staff `app_user` gets a privilege error on `integration_tokens`; `app_user` cannot read `webhook_events`; `withSystem(A)` cannot see B's numbers; the unique constraint still rejects A's insert of B's `phone_number_id`.

### 9.5 Manual checklist (T4 and T10, **production**, decision Q4)
Runs after F3a reaches production through the normal `master` → `main` release PR (never a direct push to `main`). Until then the inject tests with fixtures are the only gate. Rules for testing in production:
- Use one dedicated client named "SHARKX test" (created by the super admin); never a real client's project. Delete its numbers (and the client) after the run.
- Read rows only through the Railway Postgres console with `SELECT`s; no writes, no `db:migrate` from a laptop.
- Anything copied out of production (payloads for fixtures) is scrubbed first: phone numbers, names and message text replaced with fake values.
- The Meta app stays in dev mode until App Review, so only people with a role on the app can run the connect flow; real clients cannot reach it by accident.

Webhook path (Meta test number when it is arranged, else the dashboard "Test" button; works before Tech Provider status):
1. App Dashboard → WhatsApp → Configuration: callback `https://<production-api>/webhooks/meta`, verify token = production `META_WEBHOOK_VERIFY_TOKEN` → "Verify and save" succeeds (handshake 200).
2. Subscribe fields: `messages`, `account_update`, `history`, `smb_app_state_sync`, `smb_message_echoes`.
3. WhatsApp → API Setup: note the test WABA id and the temporary token; `POST /<test_waba>/subscribed_apps` with it (curl).
4. Send a WhatsApp message from a personal phone (added as a recipient in API Setup) to the test number → one `webhook_events` row, one queued job, 200 in the Meta webhook log. Send the "Test" button payload from the dashboard → row stored.
5. Tamper check: `curl` the same body with a wrong signature → 401, no row.
6. Copy two real payloads from `webhook_events` into fixtures (scrubbed).

Connect path (needs Tech Provider status and the real WhatsApp Business app number Alex arranges later; app role user in dev mode):
7. Phone with WhatsApp Business app ≥ 2.24.17, number active ≥ 7 days, eligible country (Q3).
8. Production `/en/p/<test client id>/integrations` as super admin → Connect → popup → choose portfolio → QR → scan in the app (Settings → Linked devices / the prompt Meta shows) → approve.
9. Number appears, sync "Not started"; `integrations.status = connected`; one token row (sealed); one audit row; `GET /<phone_number_id>?fields=is_on_biz_app,platform_type` shows `true` / `CLOUD_API`.
10. Repeat as a client user of that client → reconnect updates the same row.
11. Connect the same number on a second test client ("SHARKX test 2", deleted afterwards) → "already connected to another client".
12. Error copy: cancel the popup (neutral message); old app version or new number if available (else verify mapping with the unit test only).
13. Disconnect from the phone (Settings → Account → Business Platform → Disconnect) → `account_update` `PARTNER_REMOVED` row stored (processing is F3b/F3.8).
14. CSP: no violations in the console on the integrations page; other pages unchanged.
15. Clean up: disconnect the number in the app, delete the test clients' WhatsApp rows through the product (or leave them for F3b's run if the 24 h sync window is still open).

---

## 10. External prerequisites (Meta) and where the webhook is reached

### 10.1 Meta setup (Alex, in this order)
1. **Business portfolio**: SHARKX's (or ours acting for SHARKX). Business verification underway (ORDER: started D3).
2. **App** (type Business, already registered D3): add products **WhatsApp** and **Facebook Login for Business**. App settings → Basic: App Domains = production web host; copy App ID and App Secret → Railway production `api`, `worker` (`META_APP_ID`, `META_APP_SECRET`), `web` (`META_APP_ID`). App settings → Advanced: turn on **"Require app secret"** (decision Q8).
3. **Tech Provider**: WhatsApp → Quickstart → become a Tech Provider; complete access verification. Coexistence requires Solution Partner or Tech Provider status (Meta's Coexistence page).
4. **Facebook Login for Business → Settings**: Login with the JavaScript SDK = on; Allowed Domains for the JavaScript SDK = production web origin; Valid OAuth Redirect URIs = the same origin (HTTPS).
5. **Configuration**: Facebook Login for Business → Configurations → Create → login variation **Embedded Signup** → products **Cloud API** and **WhatsApp Business app user onboarding** → permissions `whatsapp_business_management`, `whatsapp_business_messaging` → copy the configuration id → `web` `META_ES_CONFIG_ID`. The version is not set here: our code sends `extras.version: "v5"` (products come from this configuration "as in v4", v5 page).
6. **Webhook**: WhatsApp → Configuration (callback + verify token + the five fields), §9.5 steps 1–2. Generate the verify token with `openssl rand -base64 32`.
7. **App Review**: Advanced access for `whatsapp_business_management` and `whatsapp_business_messaging` (screen recording per permission). Until then only people with a role on the app can complete the flow (dev mode). ORDER moved this submission to about D11.
8. **Keys**: `TOKEN_ENC_KEY` per environment (§4.1), different on staging and production, stored only in Railway. Staging gets its own key even though Meta testing happens in production.
9. **Business verification flag**: production `META_ONBOARDING_LIMITED=true` until verification and access verification are confirmed by Meta, then remove it.

### 10.2 Where the webhook is reached (decision Q4: no tunnel, test in production)
Meta requires a public HTTPS URL with a valid certificate (self-signed refused), and one callback URL per app.
- The callback points at the **production api** (`https://<production-api>/webhooks/meta`). Nothing is exposed from a laptop.
- Development of the receiver is fixture-first: signed fixtures through `app.inject` in Vitest cover handshake, signature, duplicates and queueing before any release.
- Staging keeps the route (Meta vars unset there → 404), so staging deploys never compete for Meta's single callback.
- Consequence: F3.2's "done" (Meta's "Verify and save") waits for the first release containing T3. If that release is far off, release T3 on its own through the usual `master` → `main` PR once `master` is green.

---

## 11. Build order (each a small commit, `node scripts/verify.mjs` before every push)

| Step | Commit | Acceptance to tick |
|---|---|---|
| — | `node scripts/track.js F3.2 --status now --pct 0 --note "webhook receiver started"` | |
| T0 | `contracts: whatsapp shapes, waSyncState, integration.connected audit action` (+ sync script; John told first) | both apps typecheck; web copy in sync |
| T1 | `F3a: AES-256-GCM token sealing with key ids` (lib/crypto, `getCryptoEnv`, env tests, `.env.example`) | round trip, tamper, rotation tests green |
| T2 | `F3a: Meta environment variables (api, worker)` | all-or-none rule; unset = feature off; env tests |
| T3 | `F3a: Meta webhook handshake and signed raw receiver` (routes/webhooks/meta.ts, modules/webhooks, fixtures) | handshake ✓; bad signature 401, nothing stored ✓; duplicate → one row ✓; job queued ✓ → `track.js F3.2 --pct 80` |
| T3b | `F3a: prune processed webhook events after 30 days` (worker/jobs/maintenance.ts + test) | processed row > 30 d deleted; unprocessed kept |
| T4 | after T3 reaches production (release PR): configure the production callback, §9.5 steps 1–6, then `F3a: recorded WhatsApp webhook fixtures` (scrubbed) | Meta "Verify and save" ✓; a delivered message stored ✓ → `track.js F3.2 --status done --pct 100`. If the release waits, F3.2 stays at 80 % and the rest goes on |
| — | `node scripts/track.js F3.1 --status now --pct 0 --note "embedded signup connect started"` | |
| T5 | `F3a: wa_numbers routing keys and per-WABA token rows` (schema + generated migration, after `git pull --rebase`; RLS seed factories) | migration test green; RLS suite green |
| T6 | `F3a: Graph client for code exchange, token check, numbers and subscription` | Graph unit tests; POST vs GET exchange settled |
| T7 | `F3a: WhatsApp connect and numbers api routes` (service + routes + app.ts) | §9.3 connect cases incl. `number_taken`, audit one row → `track.js F3.1 --pct 50` |
| T8 | `F3a: CSP allows the Facebook SDK on the integrations page only` (security.ts, proxy.ts, tests) | CSP tests; SDK loads with no console violations locally (`pnpm build && pnpm start`) |
| T9a | `F3a: Meta app id and signup config in web env` (John's file, told) | |
| T9b | `F3a: integrations message module` (John's request.ts, told) | |
| T9c | `F3a: temporary WhatsApp connect card` (action, data, page, components, strings; brand skill read first) | brand QA checklist; RTL; one red button; several numbers listed with sync % → `track.js F3.1 --pct 80` |
| T10 | §9.5 steps 7–15 in production, once Tech Provider status and the test phone are both ready | spec acceptance: analyst starts ES ✓, client scans QR ✓, several numbers ✓, sync % shown ✓ |
| T11 | `docs: F3a contracts, env and WhatsApp limits` (CONTRACTS change line + §6 routes, ARCHITECTURE §5 maintenance (webhook_events 30 d), §7 (ES **v5**, Coexistence facts), §8 key format, ENVIRONMENTS.md, F3a spec: v5 instead of v4 + no OAuth route) | code complete: `track.js F3.1 --pct 90 --note "code done; QR test waits for phone"`. After T10: `--status done --pct 100` |

T3–T4 (F3.2) go first: they need no Meta approval beyond the app, and the verified callback is a prerequisite for everything after. F3.1 cannot reach 100 % until the test phone exists (decision Q3); the code and fixture tests do not wait for it.

---

## 12. Risks and open questions

### Decisions (answered by Alex, 2026-11-25)
- **Q1 ES version → v5.** `extras: { setup: {}, version: 'v5' }`; session info v5 (`messaging_account_ids`, `phone_number_id`, `is_on_biz_app`); spec updated in T11.
- **Q2 `FINISH` → rejected** (`qr_only`), browser and api.
- **Q3 Test phone → arranged later.** T10 waits for it; everything else proceeds. Still to confirm then: app ≥ 2.24.17, number active ≥ 7 days, UAE/Morocco eligible for Coexistence (error 3441042 covers a refusal).
- **Q4 Tunnel → none; test in production** (§9.5 rules, §10.2).
- **Q5 `external_id` → body hash** (§5.2).
- **Q6 Limit notice → static flag** `META_ONBOARDING_LIMITED` + error mapping (§6.5).
- **Q7 Retention → yes:** processed `webhook_events` deleted after 30 days (T3b).
- **Q8 "Require app secret" → on** (§10.1 step 2).

### Still open (not blocking)
- Production release timing for T3 so Meta can verify the callback (§10.2): with the next normal release, or a release of its own?

### Risks
| Risk | Effect | Mitigation |
|---|---|---|
| Tech Provider status / Advanced access not granted by D9–D11 | QR connect can't be tested end to end; clients can't onboard | F3.2 and all connect logic verified with fixtures; T10 runs the day access lands; hub shows "Awaiting access" |
| No eligible phone ≥ 7 days old | T10 blocked a week or more; F3.1 stays at 90 % | Arranged later (Q3); start the 7-day clock as soon as the SIM exists |
| Testing in production | A mistake touches the live database | Dedicated test clients, SELECT-only console access, app in dev mode, scrubbed fixtures (§9.5) |
| v5 is one month old | Fewer partner reports of edge cases; the finish event shape could still shift | Session info parsed with Zod in the component; an unexpected shape shows `signupErrors.unknown` and is caught in T10 |
| 10-per-week onboarding cap before verification | Rollout to SHARKX's clients throttled | Surfaced in UI (§6.5); verification is already SHARKX's day-1 item |
| Meta docs inconsistent (GET with secret in query, `expires_at` meaning) | Wrong call shapes | Each call checked live in T10; fixtures recorded from real responses |
| Retries not byte-identical | Duplicate `webhook_events` rows | F3b per-item uniques (`wa_message_id`) keep messages single |
| History webhooks > 5 MiB | 413, Meta retries then drops | Watch production logs in T10; raise the scoped limit if needed |
| Jobs wait without a consumer until F3b (D10) | Queue grows in production after T3 ships | pg-boss keeps them; F3b drains them; unprocessed events are never pruned |
| F3b routing needs a cross-client `wa_numbers` read | F3b blocked on a policy | Noted in §3.2; F3b's migration adds it |
| Coexistence numbers drop after ~14 days without opening the app | Silent data gap | F3.8 health (`account_update` PARTNER_REMOVED / `PRIMARY_INACTIVITY`) |

### Sources (checked 2026-11-25)
- Embedded Signup implementation (SDK, `FB.login`, message events, 5-minute code): https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation
- Onboarding WhatsApp Business app users (Coexistence: 2.24.17, finish event, skip register, `smb_app_data`, 24 h, webhook fields, offboarding): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- Onboarding customers as a Tech Provider (code exchange, `subscribed_apps`, register): https://developers.facebook.com/docs/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider
- Versions (v5 latest, v4 fallback, v2/v3 deprecated 2026-10-15): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions/
- Version 5 (`extras.version`, session info v5, finish event rule, opt-out): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-5
- Version 4 (product configuration, which v5 keeps): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4
- Embedded Signup errors (codes in §6.4): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/errors
- Webhook endpoint (handshake, `X-Hub-Signature-256`, retries for 7 days, dedupe, batching up to 1000): https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint
- `account_update` webhook (no delivery id): https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_update
- `debug_token` (granular_scopes, target_ids): https://developers.facebook.com/docs/graph-api/reference/debug_token/
- Onboarding limit 10 / 7 days (partner docs, not Meta): https://www.infobip.com/docs/whatsapp/tech-provider-program/business-onboarding.md · https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/faq
- 7-day activity (partner docs, not Meta): https://docs.360dialog.com/partner/waba-management/whatsapp-coexistence/coexistence-onboarding
