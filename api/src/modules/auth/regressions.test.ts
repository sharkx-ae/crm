import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, internal, PASSWORD, post, seedUser } from '../../../tests/helpers/http.ts';
import { getPool } from '../../db/index.ts';
import { setEmailTransport } from '../../lib/email/index.ts';
import { withSystem } from '../../lib/tenant/index.ts';
import { INVITE_TTL_MS, issueToken, RESET_TTL_MS } from './tokens.ts';

// Found by the F1 independent review (docs/specs/F1-test-report.md).

let app: FastifyInstance;
beforeAll(async () => {
  ({ app } = await buildTestApp());
});
afterAll(async () => {
  await app.close();
  setEmailTransport(undefined);
  await getPool().end();
});

describe('password length is judged after NFKC normalisation', () => {
  // 16 characters as typed (six "e" + combining acute, then "ab12"), 10 once normalised.
  const shrinks = `${String.fromCodePoint(0x65, 0x301).repeat(6)}ab12`;
  // 128 characters as typed, thousands once normalised (U+FDFA expands to 18 characters).
  const expands = `a1${String.fromCodePoint(0xfdfa).repeat(126)}`;

  it.each([
    ['shrinks below 12', shrinks],
    ['expands above 128', expands],
  ])(
    'accepting an invite with a password that %s is a 422, not a 500, and keeps the link',
    async (_n, pw) => {
      const u = await seedUser({ status: 'invited', password: null });
      const token = await withSystem(null, (tx) =>
        issueToken(tx, u.id, 'invite', INVITE_TTL_MS, new Date()),
      );
      const bad = await post(app, '/auth/invite/accept', { token, password: pw }, internal());
      expect(bad.statusCode).toBe(422);
      expect(bad.json().error.code).toBe('VALIDATION');
      const ok = await post(app, '/auth/invite/accept', { token, password: PASSWORD }, internal());
      expect(ok.statusCode).toBe(200);
    },
  );

  it.each([
    ['shrinks below 12', shrinks],
    ['expands above 128', expands],
  ])(
    'resetting with a password that %s is a 422, not a 500, and keeps the link',
    async (_n, pw) => {
      const u = await seedUser();
      const token = await withSystem(null, (tx) =>
        issueToken(tx, u.id, 'reset', RESET_TTL_MS, new Date()),
      );
      const bad = await post(app, '/auth/reset/confirm', { token, password: pw }, internal());
      expect(bad.statusCode).toBe(422);
      const ok = await post(
        app,
        '/auth/reset/confirm',
        { token, password: 'Another-pass-5678' },
        internal(),
      );
      expect(ok.statusCode).toBe(200);
    },
  );
});
