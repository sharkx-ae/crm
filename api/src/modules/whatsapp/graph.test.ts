import { afterEach, describe, expect, it } from 'vitest';
import { graphFixture } from '../../../tests/helpers/whatsapp.ts';
import {
  appSecretProof,
  debugToken,
  exchangeCode,
  GRAPH_TIMEOUT_MS,
  type GraphConfig,
  GraphError,
  listPhoneNumbers,
  setGraphFetch,
  setGraphTimeout,
  subscribeApp,
} from './graph.ts';

const cfg: GraphConfig = {
  appId: '1234567890',
  appSecret: 'test-app-secret',
  graphVersion: 'v27.0',
};
const TOKEN = 'EAAFIXTUREbusinessTOKEN0123456789';

type Seen = { url: string; init: RequestInit };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function stub(res: () => Response | Promise<Response>) {
  const seen: Seen[] = [];
  setGraphFetch(async (url, init) => {
    seen.push({ url, init });
    return res();
  });
  return seen;
}
afterEach(() => {
  setGraphFetch(undefined);
  setGraphTimeout(undefined);
});

const headerOf = (s: Seen, name: string) =>
  (s.init.headers as Record<string, string> | undefined)?.[name];

describe('exchangeCode', () => {
  it('POSTs the code form-encoded: the app secret is in the body, never in the URL', async () => {
    const seen = stub(() => json(graphFixture('oauth-token')));
    const out = await exchangeCode(cfg, 'the-code');
    expect(out.accessToken).toBe('EAAFIXTUREbusinessTOKEN0123456789');
    const [s] = seen;
    expect(s?.url).toBe('https://graph.facebook.com/v27.0/oauth/access_token');
    expect(s?.url).not.toContain(cfg.appSecret);
    expect(s?.init.method).toBe('POST');
    const body = new URLSearchParams(String(s?.init.body));
    expect(body.get('code')).toBe('the-code');
    expect(body.get('client_id')).toBe(cfg.appId);
    expect(body.get('client_secret')).toBe(cfg.appSecret);
  });

  it('an expired code is a rejected GraphError carrying only status, code, subcode and trace id', async () => {
    stub(() => json(graphFixture('error-code-expired'), 400));
    const err = await exchangeCode(cfg, 'old').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GraphError);
    expect(err).toMatchObject({
      kind: 'rejected',
      status: 400,
      code: 100,
      subcode: 36007,
      fbtraceId: 'AFIXTURETRACE1',
    });
    const text = JSON.stringify([(err as Error).message, (err as Error).stack]);
    expect(text).not.toContain(cfg.appSecret);
    expect(text).not.toContain('old');
    expect(text).not.toContain('expired'); // Meta's own message is not carried either
  });
});

describe('debugToken', () => {
  it('sends the app token as Bearer and returns the WABA ids granted for management', async () => {
    const seen = stub(() => json(graphFixture('debug-token')));
    const info = await debugToken(cfg, TOKEN);
    expect(info).toEqual({
      isValid: true,
      appId: '1234567890',
      expiresAt: null, // expires_at 0 = no expiry
      wabaIds: ['100000000000001'],
    });
    const [s] = seen;
    expect(headerOf(s as Seen, 'authorization')).toBe(`Bearer ${cfg.appId}|${cfg.appSecret}`);
    expect(s?.url).not.toContain(cfg.appSecret);
    expect(new URL(s?.url as string).searchParams.get('input_token')).toBe(TOKEN);
  });

  it('keeps a real expiry as a Date, and ignores ids that are not numeric', async () => {
    stub(() =>
      json({
        data: {
          app_id: '1',
          is_valid: true,
          expires_at: 1_900_000_000,
          granular_scopes: [
            { scope: 'whatsapp_business_management', target_ids: ['100', 'not-numeric'] },
            { scope: 'whatsapp_business_messaging', target_ids: ['999'] },
          ],
        },
      }),
    );
    const info = await debugToken(cfg, TOKEN);
    expect(info.expiresAt?.getTime()).toBe(1_900_000_000_000);
    expect(info.wabaIds).toEqual(['100']);
  });

  it('a token for another WABA lists that WABA, not ours', async () => {
    stub(() => json(graphFixture('debug-token-other-waba')));
    expect((await debugToken(cfg, TOKEN)).wabaIds).toEqual(['100000000000999']);
  });
});

describe('listPhoneNumbers', () => {
  it('asks for the fields it needs with Bearer and appsecret_proof', async () => {
    const seen = stub(() => json(graphFixture('phone-numbers-coex')));
    const nums = await listPhoneNumbers(cfg, TOKEN, '100000000000001');
    expect(nums).toEqual([
      {
        id: '110000000000001',
        displayPhoneNumber: '+1 555-010-0001',
        verifiedName: 'Test Business',
        isOnBizApp: true,
        platformType: 'CLOUD_API',
      },
    ]);
    const [s] = seen;
    const u = new URL(s?.url as string);
    expect(u.pathname).toBe('/v27.0/100000000000001/phone_numbers');
    expect(u.searchParams.get('fields')).toContain('is_on_biz_app');
    expect(u.searchParams.get('appsecret_proof')).toBe(appSecretProof(cfg, TOKEN));
    expect(headerOf(s as Seen, 'authorization')).toBe(`Bearer ${TOKEN}`);
    // the proof is derived from the secret; the secret and the token itself are not in the URL
    expect(s?.url).not.toContain(cfg.appSecret);
    expect(s?.url).not.toContain(TOKEN);
  });

  it('an empty WABA is an empty list', async () => {
    stub(() => json(graphFixture('phone-numbers-empty')));
    expect(await listPhoneNumbers(cfg, TOKEN, '1')).toEqual([]);
  });

  it('a number without is_on_biz_app is treated as not on the app', async () => {
    stub(() => json({ data: [{ id: '1', display_phone_number: '+1 555' }] }));
    expect((await listPhoneNumbers(cfg, TOKEN, '1'))[0]?.isOnBizApp).toBe(false);
  });
});

describe('subscribeApp', () => {
  it('POSTs to subscribed_apps with Bearer and appsecret_proof', async () => {
    const seen = stub(() => json(graphFixture('subscribed-apps')));
    await expect(subscribeApp(cfg, TOKEN, '100000000000001')).resolves.toBeUndefined();
    const [s] = seen;
    expect(s?.init.method).toBe('POST');
    const u = new URL(s?.url as string);
    expect(u.pathname).toBe('/v27.0/100000000000001/subscribed_apps');
    expect(u.searchParams.get('appsecret_proof')).toBe(appSecretProof(cfg, TOKEN));
    expect(headerOf(s as Seen, 'authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('success false is a failure', async () => {
    stub(() => json({ success: false }));
    await expect(subscribeApp(cfg, TOKEN, '1')).rejects.toMatchObject({ kind: 'rejected' });
  });
});

describe('failures', () => {
  it('a timeout is unavailable and says nothing else', async () => {
    expect(GRAPH_TIMEOUT_MS).toBe(10_000);
    setGraphTimeout(25);
    setGraphFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new Error(`aborted https://x/?secret=${cfg.appSecret}`)),
          );
        }),
    );
    const err = await listPhoneNumbers(cfg, TOKEN, '1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GraphError);
    expect(err).toMatchObject({ kind: 'unavailable', status: null });
    expect(JSON.stringify([(err as Error).message, (err as Error).cause])).not.toContain(
      cfg.appSecret,
    );
  });

  it('a network failure is unavailable', async () => {
    setGraphFetch(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(exchangeCode(cfg, 'c')).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('a 5xx is unavailable and keeps the trace id', async () => {
    stub(() => json(graphFixture('error-500'), 500));
    await expect(listPhoneNumbers(cfg, TOKEN, '1')).rejects.toMatchObject({
      kind: 'unavailable',
      status: 500,
      code: 2,
      fbtraceId: 'AFIXTURETRACE2',
    });
  });

  it('a 4xx without a Graph error body is still a rejected error', async () => {
    stub(() => new Response('<html>nope</html>', { status: 403 }));
    await expect(subscribeApp(cfg, TOKEN, '1')).rejects.toMatchObject({
      kind: 'rejected',
      status: 403,
      code: null,
    });
  });

  it('an unexpected 200 shape is unavailable, never trusted', async () => {
    stub(() => json({ nothing: 'we know' }));
    await expect(exchangeCode(cfg, 'c')).rejects.toMatchObject({ kind: 'unavailable' });
    stub(() => json({ data: [{ id: 5 }] }));
    await expect(listPhoneNumbers(cfg, TOKEN, '1')).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

describe('appSecretProof', () => {
  it('is the hex HMAC-SHA256 of the token keyed with the app secret', () => {
    expect(appSecretProof(cfg, TOKEN)).toMatch(/^[0-9a-f]{64}$/);
    expect(appSecretProof(cfg, TOKEN)).not.toBe(appSecretProof(cfg, `${TOKEN}x`));
    expect(appSecretProof({ ...cfg, appSecret: 'other' }, TOKEN)).not.toBe(
      appSecretProof(cfg, TOKEN),
    );
  });
});
