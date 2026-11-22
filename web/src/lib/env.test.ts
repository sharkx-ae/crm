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

  it('lists every missing variable in one readable error', () => {
    expect(() => parseEnv(webSchema, {}, 'web')).toThrow(
      /APP_URL[\s\S]*API_URL[\s\S]*INTERNAL_API_TOKEN/,
    );
  });
});
