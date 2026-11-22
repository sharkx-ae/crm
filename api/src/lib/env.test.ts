import { describe, expect, it } from 'vitest';
import { apiSchema, parseEnv, testSchema, workerSchema } from './env.ts';

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
