import { type ApiEnv, apiSchema, getTestDbUrl, parseEnv } from '../../src/lib/env.ts';

export const INTERNAL_TOKEN = 'test-internal-token-0123456789abcdef-test';

// vitest.config.ts sets DATABASE_URL to TEST_DATABASE_URL, so the app's pool uses the test database.
export function testEnv(extra: Record<string, string> = {}): ApiEnv {
  return parseEnv(
    apiSchema,
    {
      NODE_ENV: 'test',
      DATABASE_URL: getTestDbUrl(),
      APP_URL: 'http://localhost:3000',
      LOG_LEVEL: 'error',
      INTERNAL_API_TOKEN: INTERNAL_TOKEN,
      ...extra,
    },
    'api',
  );
}
