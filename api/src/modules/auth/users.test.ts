import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedWorld, type World } from '../../../tests/helpers/db.ts';
import {
  asSession,
  buildTestApp,
  freshIp,
  internal,
  lastCode,
  lastLinkToken,
  type Mail,
  PASSWORD,
  post,
  seedUser,
  signIn,
  signInSuperAdmin,
} from '../../../tests/helpers/http.ts';
import { errorBody } from '../../contracts/index.ts';
import { getPool } from '../../db/index.ts';
import { setEmailTransport } from '../../lib/email/index.ts';
import { withSystem, withTenant } from '../../lib/tenant/index.ts';
import { auditLog } from '../audit/schema.ts';
import { users } from './schema.ts';
import { INVITE_TTL_MS } from './tokens.ts';
import { acceptInvite, inviteUserTx } from './users.ts';

let app: FastifyInstance;
let mail: Mail;
let w: World;
let superToken: string;
let superId: string;
let managerToken: string;
let clientAToken: string;
const NEW_PASSWORD = 'Brand-new-pass-77';

beforeAll(async () => {
  ({ app, mail } = await buildTestApp());
  w = await seedWorld();
  const sa = await signInSuperAdmin(app, mail);
  superToken = sa.token;
  superId = sa.id;
  const manager = await seedUser({ role: 'manager' });
  managerToken = (await signIn(app, mail, manager.email)).token;
  const clientA = await seedUser({ role: 'client', projectId: w.a.projectId });
  clientAToken = (await signIn(app, mail, clientA.email)).token;
});
afterAll(async () => {
  await app.close();
  setEmailTransport(undefined);
  await getPool().end();
});

let n = 0;
const newEmail = () => `invitee-${Date.now()}-${n++}@test.local`;
const invite = (token: string, body: unknown) => post(app, '/users/invite', body, asSession(token));
const inviteManager = (token: string, email = newEmail()) =>
  invite(token, { kind: 'manager', email, name: 'New Manager' });
const inviteClient = (token: string, projectId: string, email = newEmail()) =>
  invite(token, { kind: 'client', email, name: 'New Client', projectId });
const accept = (token: string, password = NEW_PASSWORD) =>
  post(app, '/auth/invite/accept', { token, password }, internal({ 'x-client-ip': freshIp() }));
const status = (token: string, id: string, to: 'active' | 'disabled') =>
  post(app, `/users/${id}/status`, { status: to }, asSession(token));
const auditActions = async (entityId: string) =>
  withTenant({ userId: superId, role: 'super_admin' }, async (tx) =>
    (await tx.select().from(auditLog).where(eq(auditLog.entityId, entityId))).map((r) => r),
  );
const userRow = (id: string) =>
  withSystem(null, async (tx) => (await tx.select().from(users).where(eq(users.id, id)))[0]);

describe('invite → accept → code → signed in', () => {
  it('a super admin invites a manager who sets a password, passes the code and signs in', async () => {
    const email = newEmail();
    const res = await inviteManager(superToken, email);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      email,
      role: 'manager',
      status: 'invited',
      projectId: null,
    });
    expect(res.body).not.toMatch(/token|pw_?hash/i);

    const token = lastLinkToken(mail, 'invite', email);
    const msg = mail.sent.find((m) => m.to === email && m.template === 'invite');
    expect(msg?.text).toContain(`/en/accept-invite/${token}`);

    const info = await post(app, '/auth/invite/inspect', { token }, internal());
    expect(info.statusCode).toBe(200);
    expect(info.json()).toMatchObject({
      kind: 'manager',
      name: 'New Manager',
      inviterName: 'Super Admin',
      projectName: null,
    });
    expect(info.json().maskedEmail).toMatch(/^i•••@test\.local$/);

    const accepted = await accept(token);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ stage: 'pending_2fa' });
    const verified = await post(
      app,
      '/auth/code/verify',
      { code: lastCode(mail, email) },
      asSession(accepted.json().sessionToken),
    );
    expect(verified.statusCode).toBe(200);
    expect(verified.json().me).toMatchObject({ role: 'manager', projectIds: [], email });

    const [{ id }] = [res.json() as { id: string }];
    expect((await userRow(id))?.status).toBe('active');
    const actions = (await auditActions(id)).map((r) => r.action).sort();
    expect(actions).toEqual(['auth.code_verified', 'user.invite_accepted', 'user.invited']);
    // and the new manager can now sign in again with the password
    expect((await signIn(app, mail, email, NEW_PASSWORD)).me.role).toBe('manager');
  });

  it('a super admin and a manager invite client users, bound to the project by the invite', async () => {
    for (const token of [superToken, managerToken]) {
      const email = newEmail();
      const res = await inviteClient(token, w.a.projectId, email);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        role: 'client',
        status: 'invited',
        projectId: w.a.projectId,
      });
      const link = lastLinkToken(mail, 'invite', email);

      const info = await post(app, '/auth/invite/inspect', { token: link }, internal());
      expect(info.json()).toMatchObject({ kind: 'client' });
      expect(info.json().projectName).toBeTruthy();

      const accepted = await accept(link);
      const verified = await post(
        app,
        '/auth/code/verify',
        { code: lastCode(mail, email) },
        asSession(accepted.json().sessionToken),
      );
      expect(verified.json().me).toMatchObject({ role: 'client', projectIds: [w.a.projectId] });
    }
  });

  it('the invite link works once', async () => {
    const email = newEmail();
    await inviteManager(superToken, email);
    const token = lastLinkToken(mail, 'invite', email);
    expect((await accept(token)).statusCode).toBe(200);
    const again = await accept(token);
    expect(again.statusCode).toBe(404);
    expect(errorBody.parse(again.json()).error.code).toBe('NOT_FOUND');
    expect((await post(app, '/auth/invite/inspect', { token }, internal())).statusCode).toBe(404);
  });

  it('an expired link is 404; one second before expiry still works', async () => {
    const email = newEmail();
    await inviteManager(superToken, email);
    const token = lastLinkToken(mail, 'invite', email);
    const issued = await withSystem(null, async (tx) => {
      const { authTokens } = await import('./schema.ts');
      const u = (await tx.select().from(users).where(eq(users.email, email)))[0];
      return (
        await tx
          .select()
          .from(authTokens)
          .where(eq(authTokens.userId, u?.id ?? ''))
      )[0];
    });
    const expiresAt = issued?.expiresAt.getTime() ?? 0;
    expect(Math.abs(expiresAt - (issued?.createdAt.getTime() ?? 0) - INVITE_TTL_MS)).toBeLessThan(
      2000,
    );
    await expect(
      acceptInvite({ token, password: NEW_PASSWORD }, new Date(expiresAt)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      acceptInvite({ token, password: NEW_PASSWORD }, new Date(expiresAt - 1000)),
    ).resolves.toMatchObject({ stage: 'pending_2fa' });
  });

  it('a forged token is 404 and a weak password is 422 without consuming the invite', async () => {
    expect((await accept('A'.repeat(43))).statusCode).toBe(404);
    const email = newEmail();
    await inviteManager(superToken, email);
    const token = lastLinkToken(mail, 'invite', email);
    for (const weak of ['short1', 'allletterslongenough', '1234567890123']) {
      const res = await accept(token, weak);
      expect(res.statusCode).toBe(422);
      expect(res.body).not.toContain(weak);
    }
    expect((await accept(token)).statusCode).toBe(200);
  });

  it('inviting an email that is still invited, with the same role and project, reissues the link', async () => {
    const email = newEmail();
    await inviteClient(superToken, w.a.projectId, email);
    const first = lastLinkToken(mail, 'invite', email);
    const res = await inviteClient(managerToken, w.a.projectId, email);
    expect(res.statusCode).toBe(200);
    const second = lastLinkToken(mail, 'invite', email);
    expect(second).not.toBe(first);
    expect((await accept(first)).statusCode).toBe(404);
    expect((await accept(second)).statusCode).toBe(200);
    const id = (res.json() as { id: string }).id;
    const invited = (await auditActions(id)).filter((r) => r.action === 'user.invited');
    expect(invited.map((r) => (r.meta as { reissued: boolean }).reissued).sort()).toEqual([
      false,
      true,
    ]);
  });
});

describe('who may invite', () => {
  it('a manager cannot invite a manager (403)', async () => {
    const res = await inviteManager(managerToken);
    expect(res.statusCode).toBe(403);
    expect(errorBody.parse(res.json()).error.code).toBe('FORBIDDEN');
  });

  it('a client user cannot invite anyone: 403 in its own project, 404 for another client project', async () => {
    expect((await inviteClient(clientAToken, w.a.projectId)).statusCode).toBe(403);
    expect((await inviteClient(clientAToken, w.b.projectId)).statusCode).toBe(404);
    expect((await inviteManager(clientAToken)).statusCode).toBe(403);
  });

  it('a pending session cannot invite', async () => {
    const u = await seedUser();
    const login = await post(
      app,
      '/auth/login',
      { email: u.email, password: u.password },
      internal({ 'x-client-ip': freshIp() }),
    );
    const res = await inviteManager(login.json().sessionToken);
    expect(res.statusCode).toBe(401);
    expect(errorBody.parse(res.json()).error.details).toEqual({ stage: 'pending_2fa' });
  });

  it('inviting into a project that does not exist is 404', async () => {
    const res = await inviteClient(superToken, '99999999-9999-4999-8999-999999999999');
    expect(res.statusCode).toBe(404);
  });

  it('an email that already has an account is refused with 409', async () => {
    const active = await seedUser();
    const disabled = await seedUser({ status: 'disabled' });
    for (const email of [active.email, disabled.email]) {
      const res = await inviteManager(superToken, email);
      expect(res.statusCode).toBe(409);
      expect(errorBody.parse(res.json()).error.code).toBe('CONFLICT');
    }
    // another role or another project for an open invite is also refused: the role is fixed by the invite
    const email = newEmail();
    await inviteManager(superToken, email);
    expect((await inviteClient(superToken, w.a.projectId, email)).statusCode).toBe(409);
    const clientEmail = newEmail();
    await inviteClient(superToken, w.a.projectId, clientEmail);
    expect((await inviteClient(superToken, w.b.projectId, clientEmail)).statusCode).toBe(409);
    expect((await inviteManager(superToken, clientEmail)).statusCode).toBe(409);
  });

  it('a bad body is 422', async () => {
    expect(
      (await invite(superToken, { kind: 'client', email: newEmail(), name: 'x' })).statusCode,
    ).toBe(422);
    expect(
      (await invite(superToken, { kind: 'boss', email: newEmail(), name: 'x' })).statusCode,
    ).toBe(422);
  });

  it('a role is never settable from the request', async () => {
    const email = newEmail();
    const res = await invite(superToken, {
      kind: 'manager',
      role: 'super_admin',
      email,
      name: 'Sneaky',
    });
    expect(res.json().role).toBe('manager');
  });
});

describe('inviteUserTx (for F2b createProject)', () => {
  it('sends nothing when the caller transaction rolls back, and sends after commit through deliver()', async () => {
    const session = {
      userId: superId,
      role: 'super_admin' as const,
      projectIds: [],
      locale: 'en' as const,
      stage: 'active' as const,
      sessionId: '44444444-4444-4444-8444-444444444444',
      name: 'Super Admin',
      email: 'super-admin@test.local',
    };
    const before = mail.sent.length;
    const rolledBackEmail = newEmail();
    await withSystem(w.a.projectId, async (tx) => {
      await inviteUserTx(
        tx,
        session,
        { kind: 'client', email: rolledBackEmail, name: 'X', projectId: w.a.projectId },
        { appUrl: 'http://localhost:3000' },
      );
      throw new Error('createProject failed');
    }).catch(() => undefined);
    expect(mail.sent.length).toBe(before);
    expect(
      await withSystem(
        null,
        async (tx) =>
          (await tx.select().from(users).where(eq(users.email, rolledBackEmail))).length,
      ),
    ).toBe(0);

    const email = newEmail();
    const { user, deliver } = await withSystem(w.a.projectId, (tx) =>
      inviteUserTx(
        tx,
        session,
        { kind: 'client', email, name: 'Y', projectId: w.a.projectId },
        { appUrl: 'http://localhost:3000' },
      ),
    );
    expect(mail.sent.length).toBe(before);
    await deliver();
    expect(mail.sent.length).toBe(before + 1);
    expect(user).toMatchObject({ email, role: 'client', status: 'invited' });
  });

  it('refuses a caller who may not invite', async () => {
    const session = {
      userId: w.manager,
      role: 'manager' as const,
      projectIds: [],
      locale: 'en' as const,
      stage: 'active' as const,
      sessionId: '44444444-4444-4444-8444-444444444444',
      name: 'M',
      email: 'm@test.local',
    };
    await withSystem(null, async (tx) => {
      await expect(
        inviteUserTx(
          tx,
          session,
          { kind: 'manager', email: newEmail(), name: 'No' },
          { appUrl: 'http://localhost:3000' },
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});

describe('disabling and enabling', () => {
  async function activeClient() {
    const c = await seedUser({ role: 'client', projectId: w.a.projectId });
    const { token } = await signIn(app, mail, c.email);
    return { c, token };
  }

  it('a manager disables a client user and the next request is refused at once; audited once', async () => {
    const { c, token } = await activeClient();
    expect(
      (await app.inject({ method: 'GET', url: '/me', headers: asSession(token) })).statusCode,
    ).toBe(200);
    const res = await status(managerToken, c.id, 'disabled');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'disabled', projectId: w.a.projectId });
    expect(
      (await app.inject({ method: 'GET', url: '/me', headers: asSession(token) })).statusCode,
    ).toBe(401);
    // and they cannot sign in again
    expect(
      (
        await post(
          app,
          '/auth/login',
          { email: c.email, password: c.password },
          internal({ 'x-client-ip': freshIp() }),
        )
      ).statusCode,
    ).toBe(401);
    const rows = (await auditActions(c.id)).filter((r) => r.action === 'user.status_changed');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectId: w.a.projectId,
      meta: { from: 'active', to: 'disabled' },
    });
  });

  it('disabling revokes every session and a live invite', async () => {
    const email = newEmail();
    const invited = await inviteClient(superToken, w.a.projectId, email);
    const link = lastLinkToken(mail, 'invite', email);
    await status(superToken, (invited.json() as { id: string }).id, 'disabled');
    expect((await accept(link)).statusCode).toBe(404);
  });

  it('enabling returns the person to active, or to invited when they never set a password', async () => {
    const { c } = await activeClient();
    await status(superToken, c.id, 'disabled');
    expect((await status(superToken, c.id, 'active')).json().status).toBe('active');
    expect((await signIn(app, mail, c.email)).me.userId).toBe(c.id);

    const email = newEmail();
    const invited = (await inviteClient(superToken, w.a.projectId, email)).json() as { id: string };
    await status(superToken, invited.id, 'disabled');
    expect((await status(superToken, invited.id, 'active')).json().status).toBe('invited');
    // re-inviting sends a fresh link
    expect((await inviteClient(superToken, w.a.projectId, email)).statusCode).toBe(200);
    expect((await accept(lastLinkToken(mail, 'invite', email))).statusCode).toBe(200);
  });

  it('a manager cannot disable a manager (403); nobody disables themselves or the super admin (409)', async () => {
    const other = await seedUser({ role: 'manager' });
    expect((await status(managerToken, other.id, 'disabled')).statusCode).toBe(403);
    expect((await status(superToken, superId, 'disabled')).statusCode).toBe(409);
    expect((await status(superToken, other.id, 'disabled')).statusCode).toBe(200);
  });

  it('a client user cannot change anyone (403), a missing user is 404, a no-op transition is 409', async () => {
    const { c } = await activeClient();
    expect((await status(clientAToken, c.id, 'disabled')).statusCode).toBe(403);
    expect(
      (await status(superToken, '99999999-9999-4999-8999-999999999999', 'disabled')).statusCode,
    ).toBe(404);
    expect((await status(superToken, c.id, 'active')).statusCode).toBe(409);
    await status(superToken, c.id, 'disabled');
    expect((await status(superToken, c.id, 'disabled')).statusCode).toBe(409);
  });
});

describe('listing', () => {
  it('a super admin lists managers; a manager cannot', async () => {
    const m = await seedUser({ role: 'manager' });
    const ok = await app.inject({
      method: 'GET',
      url: '/users?kind=manager',
      headers: asSession(superToken),
    });
    expect(ok.statusCode).toBe(200);
    const list = ok.json().users as { id: string; role: string }[];
    expect(list.map((u) => u.id)).toContain(m.id);
    expect(list.every((u) => u.role === 'manager')).toBe(true);
    expect(ok.body).not.toMatch(/pw_?hash|scrypt/i);
    const denied = await app.inject({
      method: 'GET',
      url: '/users?kind=manager',
      headers: asSession(managerToken),
    });
    expect(denied.statusCode).toBe(403);
  });

  it('staff list the client users of one project, and only that project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/users?kind=client&projectId=${w.a.projectId}`,
      headers: asSession(managerToken),
    });
    expect(res.statusCode).toBe(200);
    const list = res.json().users as { projectId: string; role: string; id: string }[];
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((u) => u.projectId === w.a.projectId && u.role === 'client')).toBe(true);
    expect(list.map((u) => u.id)).not.toContain(w.clientB);
  });

  it('a client user cannot list: 403 for its own project, 404 for another', async () => {
    const own = await app.inject({
      method: 'GET',
      url: `/users?kind=client&projectId=${w.a.projectId}`,
      headers: asSession(clientAToken),
    });
    const other = await app.inject({
      method: 'GET',
      url: `/users?kind=client&projectId=${w.b.projectId}`,
      headers: asSession(clientAToken),
    });
    expect(own.statusCode).toBe(403);
    expect(other.statusCode).toBe(404);
  });

  it('a bad query is 422 and no session is 401', async () => {
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/users?kind=client',
          headers: asSession(superToken),
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (await app.inject({ method: 'GET', url: '/users?kind=manager', headers: internal() }))
        .statusCode,
    ).toBe(401);
  });
});

describe('the demo password', () => {
  it('uses the shared test password helper', () => {
    expect(PASSWORD.length).toBeGreaterThanOrEqual(12);
  });
});
