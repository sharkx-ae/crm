import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSuperAdmin } from '../../../tests/helpers/db.ts';
import {
  asSession,
  buildTestApp,
  freshIp,
  internal,
  lastCode,
  type Mail,
  PASSWORD,
  post,
  seedUser,
  signIn,
} from '../../../tests/helpers/http.ts';
import { errorBody } from '../../contracts/index.ts';
import { getPool } from '../../db/index.ts';
import { setEmailTransport } from '../../lib/email/index.ts';
import { withSystem, withTenant } from '../../lib/tenant/index.ts';
import { auditLog } from '../audit/schema.ts';
import { users } from './schema.ts';

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

const login = (email: string, password: string, ip = freshIp()) =>
  post(app, '/auth/login', { email, password }, internal({ 'x-client-ip': ip }));
const verify = (token: string, code: string) =>
  post(app, '/auth/code/verify', { code }, asSession(token));
const get = (url: string, token: string) =>
  app.inject({ method: 'GET', url, headers: asSession(token) });
const wrongCode = (real: string) => (real === '000000' ? '111111' : '000000');
const auditRows = async (action: string, entityId?: string) =>
  withTenant({ userId: await ensureSuperAdmin(), role: 'super_admin' }, async (tx) => {
    const rows = await tx.select().from(auditLog).where(eq(auditLog.action, action));
    return entityId ? rows.filter((r) => r.entityId === entityId) : rows;
  });

describe('sign-in: password step, emailed code, active session', () => {
  it('login → code → active, and every step is audited once', async () => {
    const u = await seedUser();
    const res = await login(u.email, u.password);
    expect(res.statusCode).toBe(200);
    const pending = res.json();
    expect(pending).toMatchObject({ stage: 'pending_2fa' });
    expect(pending.maskedEmail).toMatch(/^u•••@test\.local$/);
    expect(pending.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(pending)).not.toContain(u.email);

    const code = lastCode(mail, u.email);
    const ok = await verify(pending.sessionToken, code);
    expect(ok.statusCode).toBe(200);
    const active = ok.json();
    expect(active).toMatchObject({
      stage: 'active',
      me: { userId: u.id, role: 'manager', projectIds: [], stage: 'active', email: u.email },
    });
    // rotation: the active token is a different one, and the pending one is dead
    expect(active.sessionToken).not.toBe(pending.sessionToken);
    expect((await get('/me', pending.sessionToken)).statusCode).toBe(401);
    expect((await get('/me', active.sessionToken)).json()).toMatchObject({
      stage: 'active',
      name: 'Test User',
    });

    expect((await auditRows('auth.login', u.id)).length).toBe(1);
    expect((await auditRows('auth.code_verified', u.id)).length).toBe(1);
  });

  it('the code email is sent once and carries only the code', async () => {
    const u = await seedUser();
    const before = mail.sent.length;
    await login(u.email, u.password);
    expect(mail.sent.length).toBe(before + 1);
    const m = mail.sent[mail.sent.length - 1];
    expect(m).toMatchObject({ to: u.email, template: 'code' });
    expect(m?.text).not.toContain(u.password);
  });

  it('email is case-insensitive', async () => {
    const u = await seedUser();
    const res = await login(u.email.toUpperCase(), u.password);
    expect(res.statusCode).toBe(200);
  });

  it('a client user signs in and carries its project', async () => {
    const { seedWorld } = await import('../../../tests/helpers/db.ts');
    const w = await seedWorld();
    const c = await seedUser({ role: 'client', projectId: w.a.projectId });
    const { me } = await signIn(app, mail, c.email);
    expect(me).toMatchObject({ role: 'client', projectIds: [w.a.projectId] });
  });

  it('a successful login does not leak the password hash anywhere', async () => {
    const u = await seedUser();
    const { token } = await signIn(app, mail, u.email);
    const res = await get('/me', token);
    expect(res.body).not.toMatch(/scrypt|pw_?hash|password/i);
  });

  it('logging in again revokes the old session the browser forwarded', async () => {
    const u = await seedUser();
    const { token: old } = await signIn(app, mail, u.email);
    const res = await post(
      app,
      '/auth/login',
      { email: u.email, password: u.password },
      asSession(old, { 'x-client-ip': freshIp() }),
    );
    expect(res.statusCode).toBe(200);
    expect((await get('/me', old)).statusCode).toBe(401);
  });
});

describe('sign-in: nothing about a failure is revealed', () => {
  it('unknown email, wrong password, invited and disabled users all get the identical 401', async () => {
    const real = await seedUser();
    const invited = await seedUser({ status: 'invited', password: null });
    const disabled = await seedUser({ status: 'disabled' });
    const responses = await Promise.all([
      login('nobody@test.local', 'whatever-12345'),
      login(real.email, 'wrong-password-12'),
      login(invited.email, PASSWORD),
      login(disabled.email, disabled.password),
    ]);
    for (const r of responses) expect(r.statusCode).toBe(401);
    const bodies = new Set(responses.map((r) => r.body));
    expect(bodies.size).toBe(1);
    expect(errorBody.parse(responses[0]?.json())).toEqual({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('failures are audited without the email, and with the actor only when the user exists', async () => {
    const u = await seedUser();
    await login(u.email, 'wrong-password-12');
    await login('ghost@test.local', 'wrong-password-12');
    const rows = await auditRows('auth.login_failed');
    const mine = rows.find((r) => r.entityId === u.id);
    expect(mine).toMatchObject({ actorId: u.id, meta: { reason: 'bad_password' } });
    const ghost = rows.find((r) => (r.meta as { reason?: string }).reason === 'unknown_user');
    expect(ghost?.actorId).toBeNull();
    expect(JSON.stringify(rows)).not.toContain('ghost@');
    expect(JSON.stringify(rows)).not.toContain(u.email);
  });

  it('the 6th attempt in the window is 429 with retryAfterSec, even with the right password', async () => {
    const u = await seedUser();
    const ip = freshIp();
    for (let i = 0; i < 5; i++) {
      expect((await login(u.email, 'wrong-password-12', ip)).statusCode).toBe(401);
    }
    const locked = await login(u.email, u.password, ip);
    expect(locked.statusCode).toBe(429);
    const body = errorBody.parse(locked.json());
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retryAfterSec).toBeGreaterThan(0);
    // the account bucket does not reset when the forwarded address changes
    expect((await login(u.email, u.password, freshIp())).statusCode).toBe(429);
    expect(
      (await auditRows('auth.login_failed')).some(
        (r) => (r.meta as { reason?: string }).reason === 'rate_limited',
      ),
    ).toBe(true);
  });

  it('a bad internal token is a 404, never a login attempt', async () => {
    const u = await seedUser();
    const res = await post(
      app,
      '/auth/login',
      { email: u.email, password: u.password },
      {
        'x-internal-token': 'wrong',
      },
    );
    expect(res.statusCode).toBe(404);
  });

  it('a malformed body is a 422 that does not echo the values', async () => {
    const res = await post(app, '/auth/login', {
      email: 'not-an-email',
      password: 'secret-value-1',
    });
    expect(res.statusCode).toBe(422);
    expect(res.body).not.toContain('secret-value-1');
    expect(res.body).not.toContain('not-an-email');
  });
});

describe('emailed code', () => {
  async function pending() {
    const u = await seedUser();
    const res = await login(u.email, u.password);
    return { u, token: res.json().sessionToken as string, code: lastCode(mail, u.email) };
  }

  it('a wrong code reports the attempts left; the fifth kills it; even the right code is then refused', async () => {
    const { token, code } = await pending();
    const left: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await verify(token, wrongCode(code));
      expect(res.statusCode).toBe(422);
      left.push(errorBody.parse(res.json()).error.details?.attemptsLeft);
    }
    expect(left).toEqual([4, 3, 2, 1, 0]);
    const late = await verify(token, code);
    expect(late.statusCode).toBe(422);
    expect(errorBody.parse(late.json()).error.details).toEqual({ needNewCode: true });
  });

  it('a new code after the old one died works', async () => {
    const { u, token, code } = await pending();
    for (let i = 0; i < 5; i++) await verify(token, wrongCode(code));
    const sent = await post(app, '/auth/code/send', {}, asSession(token));
    expect(sent.statusCode).toBe(200);
    expect(sent.json().maskedEmail).toMatch(/•••/);
    const fresh = lastCode(mail, u.email);
    expect((await verify(token, fresh)).statusCode).toBe(200);
  });

  it('a new code supersedes the previous one', async () => {
    const { u, token, code } = await pending();
    await post(app, '/auth/code/send', {}, asSession(token));
    const next = lastCode(mail, u.email);
    if (next !== code) expect((await verify(token, code)).statusCode).toBe(422);
    expect((await verify(token, next)).statusCode).toBe(200);
  });

  it('a code from another session does not work', async () => {
    const a = await pending();
    const b = await pending();
    const res = await verify(a.token, b.code === a.code ? wrongCode(a.code) : b.code);
    expect(res.statusCode).toBe(422);
  });

  it('is single use: the pending session is gone after success', async () => {
    const { token, code } = await pending();
    expect((await verify(token, code)).statusCode).toBe(200);
    expect((await verify(token, code)).statusCode).toBe(401);
  });

  it('the 4th send in 10 minutes is 429 (login counts as the first)', async () => {
    const { token } = await pending(); // 1 (login)
    expect((await post(app, '/auth/code/send', {}, asSession(token))).statusCode).toBe(200); // 2
    expect((await post(app, '/auth/code/send', {}, asSession(token))).statusCode).toBe(200); // 3
    const fourth = await post(app, '/auth/code/send', {}, asSession(token));
    expect(fourth.statusCode).toBe(429);
    expect(errorBody.parse(fourth.json()).error.retryAfterSec).toBeGreaterThan(0);
  });

  it('a malformed code is a 422 before anything is counted', async () => {
    const { token, code } = await pending();
    expect((await verify(token, '12ab')).statusCode).toBe(422);
    expect((await verify(token, code)).statusCode).toBe(200);
  });

  it('an unknown pending token is 401', async () => {
    expect((await verify('A'.repeat(43), '123456')).statusCode).toBe(401);
  });
});

describe('pending sessions reach nothing but the code step, /me and logout', () => {
  it('PATCH /me with a pending session is 401 with the stage', async () => {
    const u = await seedUser();
    const { sessionToken } = (await login(u.email, u.password)).json();
    const res = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: asSession(sessionToken),
      payload: { locale: 'ar' },
    });
    expect(res.statusCode).toBe(401);
    expect(errorBody.parse(res.json()).error.details).toEqual({ stage: 'pending_2fa' });
  });

  it('GET /me works while pending, so /code can show the masked email', async () => {
    const u = await seedUser();
    const { sessionToken } = (await login(u.email, u.password)).json();
    expect((await get('/me', sessionToken)).json()).toMatchObject({ stage: 'pending_2fa' });
  });

  it('logout from the code step ends the pending session', async () => {
    const u = await seedUser();
    const { sessionToken } = (await login(u.email, u.password)).json();
    expect((await post(app, '/auth/logout', {}, asSession(sessionToken))).statusCode).toBe(200);
    expect((await get('/me', sessionToken)).statusCode).toBe(401);
  });
});

describe('logout and /me', () => {
  it('logout revokes the session everywhere it was used, and is audited once', async () => {
    const u = await seedUser();
    const { token } = await signIn(app, mail, u.email);
    const res = await post(app, '/auth/logout', {}, asSession(token));
    expect(res.json()).toEqual({ ok: true });
    expect((await get('/me', token)).statusCode).toBe(401);
    expect((await auditRows('auth.logout', u.id)).length).toBe(1);
  });

  it('PATCH /me changes the language and is audited once', async () => {
    const u = await seedUser();
    const { token } = await signIn(app, mail, u.email);
    const res = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: asSession(token),
      payload: { locale: 'fr' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().locale).toBe('fr');
    const [row] = await withSystem(null, (tx) => tx.select().from(users).where(eq(users.id, u.id)));
    expect(row?.locale).toBe('fr');
    expect((await auditRows('user.locale_changed', u.id)).length).toBe(1);
    const bad = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: asSession(token),
      payload: { locale: 'xx' },
    });
    expect(bad.statusCode).toBe(422);
  });

  it('a disabled user is signed out at once', async () => {
    const u = await seedUser();
    const { token } = await signIn(app, mail, u.email);
    await withSystem(null, (tx) =>
      tx.update(users).set({ status: 'disabled' }).where(eq(users.id, u.id)),
    );
    expect((await get('/me', token)).statusCode).toBe(401);
  });

  it('no session header is 401, and the response is never cached', async () => {
    const res = await app.inject({ method: 'GET', url: '/me', headers: internal() });
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('the rate-limit rows hold no email or address', async () => {
    const u = await seedUser();
    await login(u.email, 'wrong-password-12', '203.0.113.77');
    const { rateLimits } = await import('../../lib/rate-limit/schema.ts');
    const rows = await withSystem(null, (tx) => tx.select().from(rateLimits));
    const text = JSON.stringify(rows);
    expect(text).not.toContain(u.email);
    expect(text).not.toContain('203.0.113.77');
    expect(and).toBeDefined();
  });
});
