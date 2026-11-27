import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { getPool } from '../../src/db/index.ts';
import { openToken, parseKeyring } from '../../src/lib/crypto/index.ts';
import { memoryTransport, setEmailTransport } from '../../src/lib/email/index.ts';
import { setGraphFetch } from '../../src/modules/whatsapp/graph.ts';
import { rawClient, seedWorld, type World } from '../helpers/db.ts';
import { testEnv } from '../helpers/env.ts';
import { asSession, internal, seedUser, signIn, signInSuperAdmin } from '../helpers/http.ts';
import { graphFixture, metaTestEnv, TEST_APP_ID, TEST_ENC_KEY } from '../helpers/whatsapp.ts';

const mail = memoryTransport();
const raw = rawClient();
let app: FastifyInstance;
let off: FastifyInstance; // Meta not configured
let limited: FastifyInstance;
let w: World;
let staffToken: string;
let clientA: { token: string };
let clientB: { token: string };

beforeAll(async () => {
  await raw.connect();
  setEmailTransport(mail);
  app = await buildApp(metaTestEnv());
  off = await buildApp(testEnv());
  limited = await buildApp(metaTestEnv({ META_ONBOARDING_LIMITED: 'true' }));
  await Promise.all([app.ready(), off.ready(), limited.ready()]);
  w = await seedWorld();
  staffToken = (await signInSuperAdmin(app, mail)).token;
  const ua = await seedUser({ role: 'client', projectId: w.a.projectId });
  const ub = await seedUser({ role: 'client', projectId: w.b.projectId });
  clientA = { token: (await signIn(app, mail, ua.email)).token };
  clientB = { token: (await signIn(app, mail, ub.email)).token };
});
afterEach(() => setGraphFetch(undefined));
afterAll(async () => {
  await Promise.all([app.close(), off.close(), limited.close()]);
  await raw.end();
  setEmailTransport(undefined);
  await getPool().end();
});

// ---- the Graph stub -------------------------------------------------------------------------------------------------

type Scenario = {
  waba: string;
  pnid: string;
  display: string;
  name?: string;
  /** Override one step with a canned response. */
  step?: Partial<
    Record<'oauth' | 'debug' | 'numbers' | 'subscribe', { status: number; body: unknown }>
  >;
  expiresAt?: number;
};
const digits = (n: number) => String(Math.floor(10 ** (n - 1) + Math.random() * 9 * 10 ** (n - 1)));
/** A number nobody else uses, so tests do not collide on the global unique keys. */
const fresh = (): Scenario => ({
  waba: `2${digits(14)}`,
  pnid: `3${digits(14)}`,
  display: `+1 555 ${digits(3)} ${digits(4)}`,
});

const TOKEN = 'EAAFIXTUREbusinessTOKEN0123456789';
const calls: string[] = [];
function stubGraph(sc: Scenario) {
  calls.length = 0;
  setGraphFetch(async (url, init) => {
    const u = new URL(url);
    const key = `${init.method} ${u.pathname.replace(/\/v\d+\.0/, '').replace(sc.waba, ':waba')}`;
    calls.push(key);
    const reply = (s: { status: number; body: unknown }) =>
      new Response(JSON.stringify(s.body), { status: s.status });
    if (key === 'POST /oauth/access_token')
      return reply(sc.step?.oauth ?? { status: 200, body: graphFixture('oauth-token') });
    if (key === 'GET /debug_token') {
      const body = graphFixture<{ data: Record<string, unknown> }>('debug-token');
      const targets = [{ scope: 'whatsapp_business_management', target_ids: [sc.waba] }];
      return reply(
        sc.step?.debug ?? {
          status: 200,
          body: {
            data: {
              ...body.data,
              app_id: TEST_APP_ID,
              granular_scopes: targets,
              expires_at: sc.expiresAt ?? 0,
            },
          },
        },
      );
    }
    if (key === 'GET /:waba/phone_numbers') {
      const body = graphFixture<{ data: Record<string, unknown>[] }>('phone-numbers-coex');
      return reply(
        sc.step?.numbers ?? {
          status: 200,
          body: {
            data: [
              {
                ...body.data[0],
                id: sc.pnid,
                display_phone_number: sc.display,
                verified_name: sc.name ?? 'Test Business',
              },
            ],
          },
        },
      );
    }
    if (key === 'POST /:waba/subscribed_apps')
      return reply(sc.step?.subscribe ?? { status: 200, body: graphFixture('subscribed-apps') });
    return new Response('{}', { status: 404 });
  });
}

const body = (sc: Scenario, over: Record<string, unknown> = {}) => ({
  code: 'the-code',
  event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
  messagingAccountIds: [sc.waba],
  phoneNumberId: sc.pnid,
  isOnBizApp: true,
  ...over,
});
const connect = (
  a: FastifyInstance,
  token: string,
  projectId: string,
  payload: unknown,
  headers: Record<string, string> = {},
) =>
  a.inject({
    method: 'POST',
    url: `/projects/${projectId}/whatsapp/connect`,
    payload: payload as object,
    headers: asSession(token, headers),
  });
const list = (a: FastifyInstance, token: string, projectId: string) =>
  a.inject({
    method: 'GET',
    url: `/projects/${projectId}/whatsapp/numbers`,
    headers: asSession(token),
  });

const n = async (sql: string, args: unknown[]) =>
  Number((await raw.query<{ n: string }>(sql, args)).rows[0]?.n);
const state = async (projectId: string) => ({
  integrations: await n(
    `select count(*) as n from integrations where project_id = $1 and platform = 'whatsapp'`,
    [projectId],
  ),
  tokens: await n('select count(*) as n from integration_tokens where project_id = $1', [
    projectId,
  ]),
  numbers: await n('select count(*) as n from wa_numbers where project_id = $1', [projectId]),
  audits: await n(
    `select count(*) as n from audit_log where project_id = $1 and action = 'integration.connected'`,
    [projectId],
  ),
  health: await n(
    `select count(*) as n from change_feed where project_id = $1 and kind = 'health'`,
    [projectId],
  ),
});

describe('POST /projects/:projectId/whatsapp/connect', () => {
  it('connects a number: integration, sealed token, number, one audit row, one health change', async () => {
    const sc = fresh();
    stubGraph(sc);
    const before = await state(w.a.projectId);
    const res = await connect(app, staffToken, w.a.projectId, body(sc));
    expect(res.statusCode, res.body).toBe(200);

    const { numbers } = res.json();
    expect(numbers).toHaveLength(1);
    expect(numbers[0]).toMatchObject({
      phoneE164: `+${sc.display.replace(/\D/g, '')}`,
      label: 'Test Business',
      syncState: 'none',
      syncPct: 0,
    });
    expect(calls).toEqual([
      'POST /oauth/access_token',
      'GET /debug_token',
      'GET /:waba/phone_numbers',
      'POST /:waba/subscribed_apps',
    ]);

    // nothing sensitive in the response
    for (const secret of [TOKEN, sc.waba, sc.pnid, 'the-code']) {
      expect(res.body).not.toContain(secret);
    }
    expect(Object.keys(numbers[0]).sort()).toEqual(
      ['id', 'label', 'onboardedAt', 'phoneE164', 'syncPct', 'syncState'].sort(),
    );

    const after = await state(w.a.projectId);
    expect(after.integrations).toBe(1);
    expect(after.tokens).toBe(before.tokens + 1);
    expect(after.numbers).toBe(before.numbers + 1);
    expect(after.audits).toBe(before.audits + 1);
    expect(after.health).toBe(before.health + 1);

    const integration = (
      await raw.query(
        `select id, status, mode, account_label, note from integrations where project_id = $1 and platform = 'whatsapp'`,
        [w.a.projectId],
      )
    ).rows[0];
    expect(integration).toMatchObject({
      status: 'connected',
      mode: 'live',
      account_label: 'Test Business',
      note: null,
    });

    // the token is sealed with the key id and the row-bound AAD; the value is not in the ciphertext
    const tok = (
      await raw.query(
        'select enc_value, key_id, expires_at from integration_tokens where integration_id = $1 and account_ref = $2',
        [integration?.id, sc.waba],
      )
    ).rows[0];
    expect(tok.enc_value).not.toContain('EAAFIXTURE');
    expect(tok.key_id).toBe('t1');
    expect(tok.expires_at).toBeNull(); // expires_at 0 = no expiry
    const ring = parseKeyring(TEST_ENC_KEY);
    expect(
      openToken(
        ring,
        { encValue: tok.enc_value, keyId: tok.key_id },
        `integration_tokens:${w.a.projectId}:${integration?.id}:${sc.waba}`,
      ),
    ).toBe(TOKEN);

    // the audit row: real actor, no Meta ids, no phone numbers
    const audit = (
      await raw.query(
        `select actor_kind, actor_id, entity, entity_id, meta from audit_log
         where project_id = $1 and action = 'integration.connected' order by at desc limit 1`,
        [w.a.projectId],
      )
    ).rows[0];
    expect(audit).toMatchObject({
      actor_kind: 'user',
      actor_id: w.superAdmin,
      entity: 'integration',
      entity_id: integration?.id,
    });
    expect(audit.meta).toEqual({
      platform: 'whatsapp',
      numberIds: [numbers[0].id],
      reconnect: false,
    });
    const meta = JSON.stringify(audit.meta);
    for (const nope of [sc.waba, sc.pnid, TOKEN, '+1555']) expect(meta).not.toContain(nope);
  });

  it('reconnecting the same number updates it: one number, onboarded_at moves, reconnect is recorded', async () => {
    const sc = fresh();
    stubGraph(sc);
    const first = await connect(app, staffToken, w.a.projectId, body(sc));
    expect(first.statusCode).toBe(200);
    const firstAt = new Date(first.json().numbers[0].onboardedAt).getTime();
    await raw.query(
      `update wa_numbers set sync_state = 'done', sync_pct = 100, label = 'Front desk' where id = $1`,
      [first.json().numbers[0].id],
    );
    const numbersBefore = (await state(w.a.projectId)).numbers;
    const tokensBefore = (await state(w.a.projectId)).tokens;
    await new Promise((r) => setTimeout(r, 15));

    stubGraph(sc);
    const second = await connect(app, staffToken, w.a.projectId, body(sc));
    expect(second.statusCode, second.body).toBe(200);
    const num = second.json().numbers[0];
    expect(num.id).toBe(first.json().numbers[0].id);
    expect(new Date(num.onboardedAt).getTime()).toBeGreaterThan(firstAt);
    expect(num).toMatchObject({ syncState: 'none', syncPct: 0, label: 'Front desk' }); // sync restarts, a set label stays

    const after = await state(w.a.projectId);
    expect(after.numbers).toBe(numbersBefore);
    expect(after.tokens).toBe(tokensBefore); // the same WABA keeps one token row
    const last = (
      await raw.query(
        `select meta from audit_log where project_id = $1 and action = 'integration.connected' order by at desc limit 1`,
        [w.a.projectId],
      )
    ).rows[0];
    expect(last.meta.reconnect).toBe(true);
  });

  it("a client user connects its own project's number, as a client actor", async () => {
    const sc = fresh();
    stubGraph(sc);
    const res = await connect(app, clientA.token, w.a.projectId, body(sc));
    expect(res.statusCode, res.body).toBe(200);
    const actor = (
      await raw.query(
        `select actor_kind from audit_log where project_id = $1 and action = 'integration.connected' order by at desc limit 1`,
        [w.a.projectId],
      )
    ).rows[0];
    expect(actor.actor_kind).toBe('client');
  });

  it("a client user on another client's project gets 404 and nothing happens", async () => {
    const sc = fresh();
    stubGraph(sc);
    const before = await state(w.b.projectId);
    const res = await connect(app, clientA.token, w.b.projectId, body(sc));
    expect(res.statusCode).toBe(404);
    expect(calls).toEqual([]); // no Graph call for a foreign project
    expect(await state(w.b.projectId)).toEqual(before);
  });

  it('the same client re-onboards the same phone number under a new WABA and phone_number_id: it updates its own row', async () => {
    const sc = fresh();
    stubGraph(sc);
    const first = await connect(app, staffToken, w.a.projectId, body(sc));
    expect(first.statusCode, first.body).toBe(200);
    const id = first.json().numbers[0].id;
    await raw.query(`update wa_numbers set label = 'Front desk' where id = $1`, [id]);
    const before = await state(w.a.projectId);

    const again = { ...fresh(), display: sc.display }; // same number, Meta issued new ids
    stubGraph(again);
    const second = await connect(app, staffToken, w.a.projectId, body(again));
    expect(second.statusCode, second.body).toBe(200); // not "number_taken": it is this client's own number
    expect(second.json().numbers[0]).toMatchObject({ id, label: 'Front desk', syncState: 'none' });

    const row = (
      await raw.query('select phone_number_id, waba_id from wa_numbers where id = $1', [id])
    ).rows[0];
    expect(row).toEqual({ phone_number_id: again.pnid, waba_id: again.waba });
    const after = await state(w.a.projectId);
    expect(after.numbers).toBe(before.numbers); // updated, not duplicated
    expect(after.tokens).toBe(before.tokens + 1); // the new WABA has its own token row
    const last = (
      await raw.query(
        `select meta from audit_log where project_id = $1 and action = 'integration.connected' order by at desc limit 1`,
        [w.a.projectId],
      )
    ).rows[0];
    expect(last.meta.reconnect).toBe(true);
  });

  it('several numbers per client: a second connect adds a second number', async () => {
    const one = fresh();
    const two = fresh();
    stubGraph(one);
    await connect(app, staffToken, w.a.projectId, body(one));
    const before = (await state(w.a.projectId)).numbers;
    stubGraph(two);
    expect((await connect(app, staffToken, w.a.projectId, body(two))).statusCode).toBe(200);
    expect((await state(w.a.projectId)).numbers).toBe(before + 1);
  });

  describe('failures write nothing and say why in plain codes', () => {
    const cases: [string, (sc: Scenario) => Scenario, number, string, string[]][] = [
      [
        'code_expired',
        (sc) => ({
          ...sc,
          step: { oauth: { status: 400, body: graphFixture('error-code-expired') } },
        }),
        502,
        'INTEGRATION_ERROR',
        ['POST /oauth/access_token'],
      ],
      [
        'waba_mismatch',
        (sc) => ({
          ...sc,
          step: { debug: { status: 200, body: graphFixture('debug-token-other-waba') } },
        }),
        502,
        'INTEGRATION_ERROR',
        ['POST /oauth/access_token', 'GET /debug_token'],
      ],
      [
        'no_number',
        (sc) => ({
          ...sc,
          step: { numbers: { status: 200, body: graphFixture('phone-numbers-empty') } },
        }),
        502,
        'INTEGRATION_ERROR',
        ['POST /oauth/access_token', 'GET /debug_token', 'GET /:waba/phone_numbers'],
      ],
      [
        'subscribe_failed',
        (sc) => ({
          ...sc,
          step: { subscribe: { status: 400, body: graphFixture('error-code-expired') } },
        }),
        502,
        'INTEGRATION_ERROR',
        [
          'POST /oauth/access_token',
          'GET /debug_token',
          'GET /:waba/phone_numbers',
          'POST /:waba/subscribed_apps',
        ],
      ],
      [
        'graph_unavailable',
        (sc) => ({ ...sc, step: { oauth: { status: 500, body: graphFixture('error-500') } } }),
        502,
        'INTEGRATION_ERROR',
        ['POST /oauth/access_token'],
      ],
    ];
    for (const [reason, make, status, code, expectedCalls] of cases) {
      it(reason, async () => {
        const sc = make(fresh());
        stubGraph(sc);
        const before = await state(w.a.projectId);
        const res = await connect(app, staffToken, w.a.projectId, body(sc));
        expect(res.statusCode, res.body).toBe(status);
        expect(res.json()).toEqual({ error: { code, details: { reason } } });
        expect(calls).toEqual(expectedCalls);
        expect(await state(w.a.projectId)).toEqual(before);
      });
    }

    it('a valid token whose WABA list lacks the browser-supplied account id is waba_mismatch', async () => {
      const sc = fresh();
      stubGraph(sc);
      const res = await connect(
        app,
        staffToken,
        w.a.projectId,
        body(sc, { messagingAccountIds: ['999'] }),
      );
      expect(res.json().error.details.reason).toBe('waba_mismatch');
    });

    it('a token that is not valid, or that belongs to another Meta app, is waba_mismatch and writes nothing', async () => {
      for (const patch of [{ is_valid: false }, { app_id: '999' }]) {
        const sc = fresh();
        const base = graphFixture<{ data: Record<string, unknown> }>('debug-token');
        stubGraph({
          ...sc,
          step: {
            debug: {
              status: 200,
              body: {
                data: {
                  ...base.data,
                  app_id: TEST_APP_ID,
                  is_valid: true,
                  granular_scopes: [
                    { scope: 'whatsapp_business_management', target_ids: [sc.waba] },
                  ],
                  ...patch,
                },
              },
            },
          },
        });
        const before = await state(w.a.projectId);
        const res = await connect(app, staffToken, w.a.projectId, body(sc));
        expect(res.statusCode, JSON.stringify(patch)).toBe(502);
        expect(res.json().error.details.reason, JSON.stringify(patch)).toBe('waba_mismatch');
        expect(calls).toEqual(['POST /oauth/access_token', 'GET /debug_token']); // never reaches the numbers
        expect(await state(w.a.projectId)).toEqual(before);
      }
    });

    it('a phone id that is not one of the WABA numbers is no_number', async () => {
      const sc = fresh();
      stubGraph(sc);
      const res = await connect(
        app,
        staffToken,
        w.a.projectId,
        body(sc, { phoneNumberId: '1234' }),
      );
      expect(res.json().error.details.reason).toBe('no_number');
    });

    it('a number not on the WhatsApp Business app is no_number', async () => {
      const sc = fresh();
      const nums = graphFixture<{ data: Record<string, unknown>[] }>('phone-numbers-coex');
      stubGraph({
        ...sc,
        step: {
          numbers: {
            status: 200,
            body: {
              data: [
                {
                  ...nums.data[0],
                  id: sc.pnid,
                  display_phone_number: sc.display,
                  is_on_biz_app: false,
                },
              ],
            },
          },
        },
      });
      const res = await connect(app, staffToken, w.a.projectId, body(sc));
      expect(res.json().error.details.reason).toBe('no_number');
    });

    it('the FINISH event (a new Cloud API number) is qr_only, before the code is exchanged', async () => {
      const sc = fresh();
      stubGraph(sc);
      for (const over of [{ event: 'FINISH' }, { isOnBizApp: false }]) {
        const res = await connect(app, staffToken, w.a.projectId, body(sc, over));
        expect(res.statusCode).toBe(502);
        expect(res.json().error.details.reason).toBe('qr_only');
      }
      expect(calls).toEqual([]);
    });

    it('Meta not configured is not_configured, with no Graph call', async () => {
      const sc = fresh();
      stubGraph(sc);
      const staffOff = (await signInSuperAdmin(off, mail)).token;
      const res = await connect(off, staffOff, w.a.projectId, body(sc));
      expect(res.statusCode).toBe(502);
      expect(res.json().error.details.reason).toBe('not_configured');
      expect(calls).toEqual([]);
    });
  });

  describe('a number that belongs to another client', () => {
    it('is 409 number_taken, writes nothing for the second client and reveals nothing about the first', async () => {
      const sc = fresh();
      stubGraph(sc);
      const onB = await connect(app, staffToken, w.b.projectId, body(sc));
      expect(onB.statusCode, onB.body).toBe(200);

      stubGraph(sc);
      const before = await state(w.a.projectId);
      const res = await connect(app, staffToken, w.a.projectId, body(sc));
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({
        error: { code: 'CONFLICT', details: { reason: 'number_taken' } },
      });
      expect(res.body).not.toContain(w.b.projectId);
      expect(res.body).not.toContain(onB.json().numbers[0].id);
      const after = await state(w.a.projectId);
      expect(after).toEqual(before); // the rolled-back transaction left nothing, not even the integration upsert
    });

    it('also when only the phone number matches (a different phone_number_id)', async () => {
      const sc = fresh();
      stubGraph(sc);
      expect((await connect(app, staffToken, w.b.projectId, body(sc))).statusCode).toBe(200);
      const other = { ...fresh(), display: sc.display };
      stubGraph(other);
      const res = await connect(app, staffToken, w.a.projectId, body(other));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.details.reason).toBe('number_taken');
    });
  });

  describe('input and access', () => {
    it('refuses malformed bodies with 422 and makes no Graph call', async () => {
      const sc = fresh();
      stubGraph(sc);
      for (const bad of [
        {},
        body(sc, { code: '' }),
        body(sc, { code: 'x'.repeat(2049) }),
        body(sc, { event: 'CANCEL' }),
        body(sc, { messagingAccountIds: [] }),
        body(sc, { messagingAccountIds: ['abc'] }),
        body(sc, { messagingAccountIds: Array.from({ length: 11 }, (_, i) => String(i + 1)) }),
        body(sc, { phoneNumberId: 'not-digits' }),
        body(sc, { isOnBizApp: 'yes' }),
      ]) {
        const res = await connect(app, staffToken, w.a.projectId, bad);
        expect(res.statusCode, JSON.stringify(bad)).toBe(422);
      }
      expect(calls).toEqual([]);
    });

    it('a bad project id is 422; no session is 401; no internal token is 404', async () => {
      const sc = fresh();
      expect((await connect(app, staffToken, 'not-a-uuid', body(sc))).statusCode).toBe(422);
      const noSession = await app.inject({
        method: 'POST',
        url: `/projects/${w.a.projectId}/whatsapp/connect`,
        payload: body(sc),
        headers: internal(),
      });
      expect(noSession.statusCode).toBe(401);
      const noToken = await app.inject({
        method: 'POST',
        url: `/projects/${w.a.projectId}/whatsapp/connect`,
        payload: body(sc),
      });
      expect(noToken.statusCode).toBe(404);
    });

    it('a project id that does not exist is 404 for staff, with no Graph call and nothing written', async () => {
      const sc = fresh();
      stubGraph(sc);
      const ghost = randomUUID();
      expect((await connect(app, staffToken, ghost, body(sc))).statusCode).toBe(404);
      expect((await list(app, staffToken, ghost)).statusCode).toBe(404);
      expect(calls).toEqual([]);
      expect(await n('select count(*) as n from wa_numbers where project_id = $1', [ghost])).toBe(
        0,
      );
    });
  });
});

describe('GET /projects/:projectId/whatsapp/numbers', () => {
  it('staff see any project; the list has no WABA or phone-number ids and no token data', async () => {
    const sc = fresh();
    stubGraph(sc);
    await connect(app, staffToken, w.a.projectId, body(sc));
    const res = await list(app, staffToken, w.a.projectId);
    expect(res.statusCode).toBe(200);
    const { numbers, connect: c } = res.json();
    expect(numbers.length).toBeGreaterThan(0);
    expect(c).toEqual({ ready: true, limited: false });
    for (const secret of [sc.waba, sc.pnid, TOKEN, 'wabaId', 'phoneNumberId', 'enc']) {
      expect(res.body).not.toContain(secret);
    }
    for (const row of numbers) {
      expect(Object.keys(row).sort()).toEqual(
        ['id', 'label', 'onboardedAt', 'phoneE164', 'syncPct', 'syncState'].sort(),
      );
    }
  });

  it('a client sees its own numbers only, and 404 for another client', async () => {
    const sc = fresh();
    stubGraph(sc);
    await connect(app, staffToken, w.b.projectId, body(sc));
    const own = await list(app, clientA.token, w.a.projectId);
    expect(own.statusCode).toBe(200);
    const mine = await list(app, clientB.token, w.b.projectId);
    expect(
      mine
        .json()
        .numbers.some(
          (x: { phoneE164: string }) => x.phoneE164 === `+${sc.display.replace(/\D/g, '')}`,
        ),
    ).toBe(true);
    expect(
      own
        .json()
        .numbers.some(
          (x: { phoneE164: string }) => x.phoneE164 === `+${sc.display.replace(/\D/g, '')}`,
        ),
    ).toBe(false);
    expect((await list(app, clientA.token, w.b.projectId)).statusCode).toBe(404);
  });

  it('says whether connecting is ready and whether the unverified-business notice applies', async () => {
    const staffOff = (await signInSuperAdmin(off, mail)).token;
    expect((await list(off, staffOff, w.a.projectId)).json().connect).toEqual({
      ready: false,
      limited: false,
    });
    const staffLimited = (await signInSuperAdmin(limited, mail)).token;
    expect((await list(limited, staffLimited, w.a.projectId)).json().connect).toEqual({
      ready: true,
      limited: true,
    });
  });
});
