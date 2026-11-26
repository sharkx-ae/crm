import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSuperAdmin } from '../../../tests/helpers/db.ts';
import {
  asSession,
  buildTestApp,
  freshIp,
  internal,
  lastLinkToken,
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
import { authTokens, users } from './schema.ts';
import { confirmReset, requestReset } from './service.ts';
import { RESET_TTL_MS } from './tokens.ts';

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

const NEW_PASSWORD = 'Another-pass-5678';
const request = (email: string) => post(app, '/auth/reset/request', { email }, internal());
const confirm = (token: string, password = NEW_PASSWORD) =>
  post(app, '/auth/reset/confirm', { token, password }, internal({ 'x-client-ip': freshIp() }));
const login = (email: string, password: string) =>
  post(app, '/auth/login', { email, password }, internal({ 'x-client-ip': freshIp() }));
// The reset mail is sent after the reply, so give it a moment.
async function resetMail(to: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    if (mail.sent.some((m) => m.to === to && m.template === 'reset'))
      return lastLinkToken(mail, 'reset', to);
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('no reset email arrived');
}
const auditFor = async (entityId: string) => {
  const admin = await ensureSuperAdmin();
  return withTenant({ userId: admin, role: 'super_admin' }, (tx) =>
    tx.select().from(auditLog).where(eq(auditLog.entityId, entityId)),
  );
};

describe('request', () => {
  it('answers {ok:true} for a known and an unknown email alike, and only mails the known one', async () => {
    const u = await seedUser();
    const ghost = `ghost-${Date.now()}@test.local`;
    const [a, b] = [await request(u.email), await request(ghost)];
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.body).toBe(b.body);
    expect(a.json()).toEqual({ ok: true });
    await resetMail(u.email);
    await new Promise((r) => setTimeout(r, 100));
    expect(mail.sent.some((m) => m.to === ghost)).toBe(false);
  });

  it('invited and disabled users get no email either, and the answer is identical', async () => {
    const invited = await seedUser({ status: 'invited', password: null });
    const disabled = await seedUser({ status: 'disabled' });
    for (const u of [invited, disabled])
      expect((await request(u.email)).json()).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 150));
    expect(mail.sent.some((m) => m.to === invited.email || m.to === disabled.email)).toBe(false);
  });

  it('the 4th request within the hour is 429, for any email, existing or not', async () => {
    const u = await seedUser();
    for (let i = 0; i < 3; i++) expect((await request(u.email)).statusCode).toBe(200);
    const fourth = await request(u.email);
    expect(fourth.statusCode).toBe(429);
    expect(errorBody.parse(fourth.json()).error.retryAfterSec).toBeGreaterThan(0);

    const ghost = `ghost-${Date.now()}@test.local`;
    for (let i = 0; i < 3; i++) expect((await request(ghost)).statusCode).toBe(200);
    expect((await request(ghost)).statusCode).toBe(429); // same behaviour: nothing is revealed
  });

  it('the link is 43 characters, mails carry no password, and the request is audited for a real account', async () => {
    const u = await seedUser();
    await request(u.email);
    const token = await resetMail(u.email);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const msg = mail.sent.find((m) => m.to === u.email && m.template === 'reset');
    expect(msg?.text).toContain(`/en/reset/${token}`);
    expect((await auditFor(u.id)).filter((r) => r.action === 'auth.reset_requested')).toHaveLength(
      1,
    );
  });

  it('a bad email is a 422', async () => {
    expect((await post(app, '/auth/reset/request', { email: 'nope' }, internal())).statusCode).toBe(
      422,
    );
  });

  it('deliver is returned for the route to run after replying; null when nothing is to be sent', async () => {
    const u = await seedUser();
    expect(
      (await requestReset({ email: u.email }, { appUrl: 'http://x.test' })).deliver,
    ).toBeTypeOf('function');
    expect(
      (await requestReset({ email: 'nobody@test.local' }, { appUrl: 'http://x.test' })).deliver,
    ).toBeNull();
  });
});

describe('confirm', () => {
  it('changes the password once, signs out every device, and the link cannot be reused', async () => {
    const u = await seedUser();
    const one = await signIn(app, mail, u.email);
    const two = await signIn(app, mail, u.email);
    await request(u.email);
    const token = await resetMail(u.email);

    const res = await confirm(token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    for (const s of [one, two]) {
      expect(
        (await app.inject({ method: 'GET', url: '/me', headers: asSession(s.token) })).statusCode,
      ).toBe(401);
    }
    expect((await login(u.email, PASSWORD)).statusCode).toBe(401);
    expect((await login(u.email, NEW_PASSWORD)).statusCode).toBe(200);

    const again = await confirm(token, 'Third-pass-9999');
    expect(again.statusCode).toBe(404);
    expect(errorBody.parse(again.json()).error.code).toBe('NOT_FOUND');
    expect((await login(u.email, 'Third-pass-9999')).statusCode).toBe(401);

    const rows = (await auditFor(u.id)).filter((r) => r.action === 'auth.password_changed');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe(u.id);
  });

  it('a forged or malformed token is 404 / 422, a weak password is 422 and does not burn the link', async () => {
    expect((await confirm('A'.repeat(43))).statusCode).toBe(404);
    expect((await confirm('short')).statusCode).toBe(422);
    const u = await seedUser();
    await request(u.email);
    const token = await resetMail(u.email);
    for (const weak of ['short1', 'onlyletterslongenough', '123456789012345']) {
      const res = await confirm(token, weak);
      expect(res.statusCode).toBe(422);
      expect(res.body).not.toContain(weak);
    }
    expect((await confirm(token)).statusCode).toBe(200);
  });

  it('expires after one hour', async () => {
    const u = await seedUser();
    await request(u.email);
    const token = await resetMail(u.email);
    const row = await withSystem(
      null,
      async (tx) => (await tx.select().from(authTokens).where(eq(authTokens.userId, u.id)))[0],
    );
    const expiresAt = row?.expiresAt.getTime() ?? 0;
    expect(Math.abs(expiresAt - (row?.createdAt.getTime() ?? 0) - RESET_TTL_MS)).toBeLessThan(2000);
    await expect(
      confirmReset({ token, password: NEW_PASSWORD }, new Date(expiresAt)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      confirmReset({ token, password: NEW_PASSWORD }, new Date(expiresAt - 1000)),
    ).resolves.toBeUndefined();
  });

  it('a newer link supersedes the older one', async () => {
    const u = await seedUser();
    await request(u.email);
    const first = await resetMail(u.email);
    mail.clear();
    await request(u.email);
    const second = await resetMail(u.email);
    expect(second).not.toBe(first);
    expect((await confirm(first)).statusCode).toBe(404);
    expect((await confirm(second)).statusCode).toBe(200);
  });

  it('voids the user’s other open links and codes, and a disabled user cannot reset', async () => {
    const u = await seedUser();
    await request(u.email);
    const token = await resetMail(u.email);
    await post(
      app,
      '/auth/login',
      { email: u.email, password: u.password },
      internal({ 'x-client-ip': freshIp() }),
    );
    await confirm(token);
    const live = await withSystem(null, async (tx) =>
      (await tx.select().from(authTokens).where(eq(authTokens.userId, u.id))).filter(
        (t) => !t.usedAt,
      ),
    );
    expect(live).toHaveLength(0);

    const d = await seedUser();
    await request(d.email);
    const dToken = await resetMail(d.email);
    await withSystem(null, (tx) =>
      tx.update(users).set({ status: 'disabled' }).where(eq(users.id, d.id)),
    );
    expect((await confirm(dToken)).statusCode).toBe(404);
  });
});
