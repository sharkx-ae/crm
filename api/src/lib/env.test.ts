import { describe, expect, it } from 'vitest';
import { apiSchema, metaEnvOf, parseEnv, testSchema, workerSchema } from './env.ts';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5433/sharkx',
  APP_URL: 'http://localhost:3000',
  INTERNAL_API_TOKEN: 'x'.repeat(32),
};

describe('api env', () => {
  it('accepts a valid local api env with defaults', () => {
    const env = parseEnv(apiSchema, base, 'api');
    expect(env.APP_ENV).toBe('local');
    expect(env.PORT).toBe(4000);
  });

  it('lists every missing variable in one readable error', () => {
    expect(() => parseEnv(apiSchema, {}, 'api')).toThrow(/DATABASE_URL[\s\S]*APP_URL/);
  });

  it('requires email settings outside local', () => {
    expect(() => parseEnv(workerSchema, { ...base, APP_ENV: 'staging' }, 'worker')).toThrow(
      /RESEND_API_KEY[\s\S]*EMAIL_FROM[\s\S]*ALERT_EMAIL/,
    );
  });

  it('refuses a test database not named *_test', () => {
    expect(() =>
      parseEnv(testSchema, { TEST_DATABASE_URL: 'postgres://u:p@localhost/sharkx' }, 'test'),
    ).toThrow(/_test/);
  });
});

const KEY = `k1:${Buffer.alloc(32, 7).toString('base64')}`;
const meta = {
  META_APP_ID: '1234567890',
  META_APP_SECRET: 'a'.repeat(32),
  META_WEBHOOK_VERIFY_TOKEN: 'v'.repeat(32),
};
const email = { RESEND_API_KEY: 'x', EMAIL_FROM: 'SharkX <a@b.co>', ALERT_EMAIL: 'a@b.co' };

describe('Meta and token key env (F3a)', () => {
  it('is off by default: no Meta variables is valid, even on production', () => {
    const env = parseEnv(apiSchema, base, 'api');
    expect(env.META_APP_ID).toBeUndefined();
    expect(env.META_GRAPH_VERSION).toBe('v27.0');
    expect(env.META_ONBOARDING_LIMITED).toBe(false);
    const prod = { ...base, ...email, APP_ENV: 'production', TOKEN_ENC_KEY: KEY };
    expect(() => parseEnv(apiSchema, prod, 'api')).not.toThrow();
  });

  it('api Meta group is all-or-none', () => {
    expect(() =>
      parseEnv(apiSchema, { ...base, ...meta, TOKEN_ENC_KEY: KEY }, 'api'),
    ).not.toThrow();
    for (const drop of Object.keys(meta)) {
      const partial = Object.fromEntries(Object.entries(meta).filter(([k]) => k !== drop));
      expect(
        () => parseEnv(apiSchema, { ...base, ...partial, TOKEN_ENC_KEY: KEY }, 'api'),
        drop,
      ).toThrow(new RegExp(`${drop}: required when`));
    }
  });

  it('worker needs the app id and secret together, not the verify token', () => {
    const { META_WEBHOOK_VERIFY_TOKEN: _t, ...pair } = meta;
    expect(() =>
      parseEnv(workerSchema, { ...base, ...pair, TOKEN_ENC_KEY: KEY }, 'worker'),
    ).not.toThrow();
    expect(() =>
      parseEnv(workerSchema, { ...base, META_APP_ID: pair.META_APP_ID }, 'worker'),
    ).toThrow(/META_APP_SECRET: required when/);
  });

  it('checks the formats', () => {
    const ok = { ...base, ...meta, TOKEN_ENC_KEY: KEY };
    expect(() => parseEnv(apiSchema, { ...ok, META_APP_ID: 'abc' }, 'api')).toThrow(/META_APP_ID/);
    expect(() => parseEnv(apiSchema, { ...ok, META_WEBHOOK_VERIFY_TOKEN: 'short' }, 'api')).toThrow(
      /META_WEBHOOK_VERIFY_TOKEN/,
    );
    expect(() => parseEnv(apiSchema, { ...ok, META_GRAPH_VERSION: '27' }, 'api')).toThrow(
      /META_GRAPH_VERSION/,
    );
    expect(
      parseEnv(apiSchema, { ...ok, META_GRAPH_VERSION: 'v28.0' }, 'api').META_GRAPH_VERSION,
    ).toBe('v28.0');
    expect(
      parseEnv(apiSchema, { ...ok, META_ONBOARDING_LIMITED: 'true' }, 'api')
        .META_ONBOARDING_LIMITED,
    ).toBe(true);
    expect(() => parseEnv(apiSchema, { ...ok, META_ONBOARDING_LIMITED: 'yes' }, 'api')).toThrow(
      /META_ONBOARDING_LIMITED/,
    );
  });

  it('TOKEN_ENC_KEY is required when Meta is configured and outside local', () => {
    expect(() => parseEnv(apiSchema, { ...base, ...meta }, 'api')).toThrow(
      /TOKEN_ENC_KEY: required when META_APP_SECRET is set/,
    );
    expect(() => parseEnv(apiSchema, { ...base, ...email, APP_ENV: 'staging' }, 'api')).toThrow(
      /TOKEN_ENC_KEY: required when APP_ENV=staging/,
    );
    expect(() =>
      parseEnv(workerSchema, { ...base, ...email, APP_ENV: 'production' }, 'worker'),
    ).toThrow(/TOKEN_ENC_KEY/);
  });

  it('TOKEN_ENC_KEY must be a valid keyring, and the error never shows the key', () => {
    const bad = `k1:${Buffer.alloc(31, 9).toString('base64')}`;
    try {
      parseEnv(apiSchema, { ...base, TOKEN_ENC_KEY: bad }, 'api');
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/TOKEN_ENC_KEY: key must be 32 bytes/);
      expect((e as Error).message).not.toContain(bad.split(':')[1]);
    }
    expect(() =>
      parseEnv(apiSchema, { ...base, TOKEN_ENC_KEY: KEY, TOKEN_ENC_KEYS_OLD: KEY }, 'api'),
    ).toThrow(/unique/);
    const old = `k0:${Buffer.alloc(32, 1).toString('base64')}`;
    expect(() =>
      parseEnv(apiSchema, { ...base, TOKEN_ENC_KEY: KEY, TOKEN_ENC_KEYS_OLD: old }, 'api'),
    ).not.toThrow();
  });

  it('metaEnvOf is null unless the app id and secret are present', () => {
    const base2 = { META_GRAPH_VERSION: 'v27.0' };
    expect(metaEnvOf(base2)).toBeNull();
    expect(
      metaEnvOf({ ...base2, META_APP_ID: '1', META_APP_SECRET: 's'.repeat(16) }),
    ).toMatchObject({ appId: '1', graphVersion: 'v27.0', limited: false });
  });
});
