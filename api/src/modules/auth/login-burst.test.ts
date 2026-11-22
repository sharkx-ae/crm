import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  freshIp,
  internal,
  type Mail,
  post,
  seedUser,
} from '../../../tests/helpers/http.ts';
import { getPool } from '../../db/index.ts';
import { setEmailTransport } from '../../lib/email/index.ts';

// Found by the F1 independent review (docs/specs/F1-test-report.md).

let app: FastifyInstance;
let mail: Mail;
beforeAll(async () => {
  ({ app, mail } = await buildTestApp());
});
afterAll(async () => {
  await app.close();
  setEmailTransport(undefined);
  await getPool().end();
});

const login = (email: string, password: string, ip: string) =>
  post(app, '/auth/login', { email, password }, internal({ 'x-client-ip': ip }));

describe('login lockout holds under a parallel burst', () => {
  it('twelve simultaneous wrong passwords let at most five through as 401', async () => {
    const u = await seedUser();
    const ip = freshIp();
    const res = await Promise.all(
      Array.from({ length: 12 }, () => login(u.email, 'Wrong-pass-12345', ip)),
    );
    const codes = res.map((r) => r.statusCode);
    expect(codes.filter((c) => c === 401)).toHaveLength(5);
    expect(codes.filter((c) => c === 429)).toHaveLength(7);
    // the right password is refused too while the window is locked
    expect((await login(u.email, u.password, ip)).statusCode).toBe(429);
  });

  it('a correct sign-in does not use up one of the five tries', async () => {
    const u = await seedUser();
    const ip = freshIp();
    for (let i = 0; i < 4; i++)
      expect((await login(u.email, 'Wrong-pass-12345', ip)).statusCode).toBe(401);
    expect((await login(u.email, u.password, ip)).statusCode).toBe(200);
    expect(mail.sent.some((m) => m.to === u.email && m.template === 'code')).toBe(true);
    // four failures were counted, the success was given back: the fifth failure is still a 401, the sixth locks
    expect((await login(u.email, 'Wrong-pass-12345', ip)).statusCode).toBe(401);
    expect((await login(u.email, 'Wrong-pass-12345', ip)).statusCode).toBe(429);
  });
});
