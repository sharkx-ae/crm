import { describe, expect, it } from 'vitest';
import { parseEnv, webSchema } from './env.ts';

describe('web env', () => {
  it('accepts a valid local env', () => {
    const env = parseEnv(
      webSchema,
      {
        APP_URL: 'http://localhost:3000',
        API_URL: 'http://localhost:4000',
        INTERNAL_API_TOKEN: 'x'.repeat(32),
      },
      'web',
    );
    expect(env.APP_ENV).toBe('local');
  });

  it('Meta settings are optional, default the Graph version, and come as a pair (F3a)', () => {
    const base = {
      APP_URL: 'http://localhost:3000',
      API_URL: 'http://localhost:4000',
      INTERNAL_API_TOKEN: 'x'.repeat(32),
    };
    const off = parseEnv(webSchema, base, 'web');
    expect(off.META_APP_ID).toBeUndefined();
    expect(off.META_GRAPH_VERSION).toBe('v27.0');
    const on = parseEnv(
      webSchema,
      { ...base, META_APP_ID: '123', META_ES_CONFIG_ID: '456', META_GRAPH_VERSION: 'v28.0' },
      'web',
    );
    expect(on).toMatchObject({ META_APP_ID: '123', META_ES_CONFIG_ID: '456' });
    expect(() => parseEnv(webSchema, { ...base, META_APP_ID: '123' }, 'web')).toThrow(
      /META_ES_CONFIG_ID: required when META_APP_ID is set/,
    );
    expect(() => parseEnv(webSchema, { ...base, META_ES_CONFIG_ID: '456' }, 'web')).toThrow(
      /META_APP_ID: required when META_ES_CONFIG_ID is set/,
    );
    expect(() =>
      parseEnv(webSchema, { ...base, META_APP_ID: 'abc', META_ES_CONFIG_ID: '1' }, 'web'),
    ).toThrow(/META_APP_ID/);
    expect(() => parseEnv(webSchema, { ...base, META_GRAPH_VERSION: '27' }, 'web')).toThrow(
      /META_GRAPH_VERSION/,
    );
  });

  it('lists every missing variable in one readable error', () => {
    expect(() => parseEnv(webSchema, {}, 'web')).toThrow(
      /APP_URL[\s\S]*API_URL[\s\S]*INTERNAL_API_TOKEN/,
    );
  });
});
