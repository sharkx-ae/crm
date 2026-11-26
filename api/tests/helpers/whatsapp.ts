import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { testEnv } from './env.ts';

// Fixtures are read as raw bytes and never re-serialised: the webhook signature is over the exact bytes.
const root = join(import.meta.dirname, '..', 'fixtures', 'whatsapp');
export const webhookFixture = (name: string): Buffer =>
  readFileSync(join(root, 'webhooks', `${name}.json`));
export const graphFixture = <T = unknown>(name: string): T =>
  JSON.parse(readFileSync(join(root, 'graph', `${name}.json`), 'utf8')) as T;
export const signatureVector = (): { secret: string; bodyFile: string; header: string } =>
  JSON.parse(readFileSync(join(root, 'signature-vector.json'), 'utf8'));

export const TEST_APP_SECRET = 'test-app-secret';
export const TEST_APP_ID = '1234567890';
export const TEST_VERIFY_TOKEN = 'test-verify-token-0123456789abcdef-test';
export const TEST_ENC_KEY = `t1:${Buffer.alloc(32, 3).toString('base64')}`;

/** The header Meta would send for these bytes. */
export const sign = (raw: Buffer | string, secret: string = TEST_APP_SECRET): string =>
  `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

/** An api env with Meta configured (the test app secret, verify token and a token key). */
export const metaTestEnv = (extra: Record<string, string> = {}) =>
  testEnv({
    META_APP_ID: TEST_APP_ID,
    META_APP_SECRET: TEST_APP_SECRET,
    META_WEBHOOK_VERIFY_TOKEN: TEST_VERIFY_TOKEN,
    TOKEN_ENC_KEY: TEST_ENC_KEY,
    ...extra,
  });

/** A body Meta never sent: different bytes every call, so no row from an earlier run collides. */
export const freshBody = (): Buffer =>
  Buffer.from(
    JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1',
          changes: [{ field: 'messages', value: { nonce: randomBytes(8).toString('hex') } }],
        },
      ],
    }),
  );
