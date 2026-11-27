import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSuperAdmin } from '../../../tests/helpers/db.ts';
import {
  asSession,
  buildTestApp,
  freshIp,
  internal,
  lastCode,
  lastLinkToken,
  type Mail,
  post,
  seedUser,
} from '../../../tests/helpers/http.ts';
import { getPool } from '../../db/index.ts';
import { sha256 } from '../../lib/crypto/index.ts';
import { setEmailTransport } from '../../lib/email/index.ts';
import { withSystem, withTenant } from '../../lib/tenant/index.ts';
import { prune } from '../../worker/jobs/maintenance.ts';
import { auditLog } from '../audit/schema.ts';
import {
  createDevice,
  DEVICE_MAX_AGE_MS,
  DEVICE_TTL_MS,
  MAX_DEVICES,
  useDevice,
} from './devices.ts';
import { trustedDevices } from './schema.ts';

// Spec F1c-remember-device: a trusted device skips the emailed code (never the password).
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

const DAY = 86_400_000;
const loginAs = (email: string, password: string, device?: string) =>
  post(
    app,
    '/auth/login',
    { email, password },
    internal({ 'x-client-ip': freshIp(), ...(device ? { 'x-device-token': device } : {}) }),
  );
const codes = (email: string) => mail.sent.filter((m) => m.template === 'code' && m.to === email);
const deviceRows = (userId: string) =>
  withSystem(null, (tx) =>
    tx.select().from(trustedDevices).where(eq(trustedDevices.userId, userId)),
  );

/** Password, then the code, optionally trusting the browser. Returns what the verify answered. */
async function signInWithCode(email: string, password: string, trustDevice: boolean) {
  const pending = (await loginAs(email, password)).json();
  const res = await post(
    app,
    '/auth/code/verify',
    { code: lastCode(mail, email), trustDevice },
    asSession(pending.sessionToken),
  );
  expect(res.statusCode).toBe(200);
  return res.json();
}

const auditCount = async (action: string, entityId: string) =>
  withTenant({ userId: await ensureSuperAdmin(), role: 'super_admin' }, async (tx) =>
    (await tx.select().from(auditLog).where(eq(auditLog.action, action))).filter(
      (r) => r.entityId === entityId,
    ),
  );

describe('trusting a device at the code step', () => {
  it('ticked: the verify answer carries a device token; only its hash is stored', async () => {
    const u = await seedUser();
    const active = await signInWithCode(u.email, u.password, true);
    expect(active.deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Date(active.deviceExpiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
    const rows = await deviceRows(u.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(sha256(active.deviceToken));
    expect(JSON.stringify(rows)).not.toContain(active.deviceToken);
    const verified = await auditCount('auth.code_verified', u.id);
    expect(JSON.stringify(verified.map((r) => r.meta))).toContain('"trustedDevice":true');
  });

  it('not ticked (or absent): no token and no device row', async () => {
    const u = await seedUser();
    const active = await signInWithCode(u.email, u.password, false);
    expect(active.deviceToken).toBeUndefined();
    expect(await deviceRows(u.id)).toHaveLength(0);
  });
});

describe('signing in on a trusted device', () => {
  it('password only: an active session straight away, no code email, audited as a trusted sign-in', async () => {
    const u = await seedUser();
    const { deviceToken } = await signInWithCode(u.email, u.password, true);
    const before = codes(u.email).length;

    const res = await loginAs(u.email, u.password, deviceToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ stage: 'active', me: { userId: u.id, stage: 'active' } });
    expect(body.deviceToken).toBeUndefined(); // the token does not change; only its expiry slides
    expect(new Date(body.deviceExpiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
    expect(codes(u.email).length).toBe(before);

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: asSession(body.sessionToken),
    });
    expect(me.statusCode).toBe(200);
    const audits = await auditCount('auth.login', u.id);
    expect(audits.some((a) => JSON.stringify(a.meta).includes('trusted_device'))).toBe(true);
  });

  it('the password is still required: a wrong one fails even with a valid device', async () => {
    const u = await seedUser();
    const { deviceToken } = await signInWithCode(u.email, u.password, true);
    expect((await loginAs(u.email, 'Wrong-pass-12345', deviceToken)).statusCode).toBe(401);
  });

  it('another person’s device token and made-up ones fall back to the code step', async () => {
    const a = await seedUser();
    const b = await seedUser();
    const { deviceToken } = await signInWithCode(a.email, a.password, true);
    // three tries: the code-send limit is 3 per 10 minutes per person
    for (const token of [deviceToken, 'x'.repeat(43), 'not a token']) {
      const res = await loginAs(b.email, b.password, token);
      expect(res.statusCode).toBe(200);
      expect(res.json().stage).toBe('pending_2fa');
    }
  });

  it('an expired device, and one older than 90 days, fall back to the code step', async () => {
    const u = await seedUser();
    const { deviceToken } = await signInWithCode(u.email, u.password, true);
    const hash = sha256(deviceToken);

    await withSystem(null, (tx) =>
      tx
        .update(trustedDevices)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(trustedDevices.tokenHash, hash)),
    );
    expect((await loginAs(u.email, u.password, deviceToken)).json().stage).toBe('pending_2fa');

    await withSystem(null, (tx) =>
      tx
        .update(trustedDevices)
        .set({
          expiresAt: new Date(Date.now() + 10 * DAY),
          createdAt: new Date(Date.now() - 91 * DAY),
        })
        .where(eq(trustedDevices.tokenHash, hash)),
    );
    expect((await loginAs(u.email, u.password, deviceToken)).json().stage).toBe('pending_2fa');
  });

  it('a disabled person is not signed in by a device', async () => {
    const u = await seedUser();
    const { deviceToken } = await signInWithCode(u.email, u.password, true);
    await withSystem(null, async (tx) => {
      const { users } = await import('./schema.ts');
      await tx.update(users).set({ status: 'disabled' }).where(eq(users.id, u.id));
    });
    expect((await loginAs(u.email, u.password, deviceToken)).statusCode).toBe(401);
  });
});

describe('revocation and limits', () => {
  it('a password reset removes every trusted device, so the next sign-in asks for the code', async () => {
    const u = await seedUser();
    const { deviceToken } = await signInWithCode(u.email, u.password, true);
    expect(await deviceRows(u.id)).toHaveLength(1);

    await post(app, '/auth/reset/request', { email: u.email }, internal());
    for (
      let i = 0;
      i < 50 && !mail.sent.some((m) => m.to === u.email && m.template === 'reset');
      i++
    )
      await new Promise((r) => setTimeout(r, 20));
    const confirmed = await post(
      app,
      '/auth/reset/confirm',
      { token: lastLinkToken(mail, 'reset', u.email), password: 'Another-pass-5678' },
      internal({ 'x-client-ip': freshIp() }),
    );
    expect(confirmed.statusCode).toBe(200);

    expect(await deviceRows(u.id)).toHaveLength(0);
    const changed = await auditCount('auth.password_changed', u.id);
    expect(JSON.stringify(changed.map((r) => r.meta))).toContain('"devicesRevoked":1');
    const res = await loginAs(u.email, 'Another-pass-5678', deviceToken);
    expect(res.json().stage).toBe('pending_2fa');
  });

  it('keeps at most ten devices per person, the newest', async () => {
    const u = await seedUser();
    const t0 = new Date('2026-11-01T10:00:00.000Z');
    const tokens: string[] = [];
    for (let i = 0; i < MAX_DEVICES + 2; i++) {
      const d = await withSystem(null, (tx) =>
        createDevice(tx, u.id, new Date(t0.getTime() + i * 1000)),
      );
      tokens.push(d.token);
    }
    expect(await deviceRows(u.id)).toHaveLength(MAX_DEVICES);
    const now = new Date(t0.getTime() + DAY);
    const alive = await Promise.all(
      tokens.map((t) => withSystem(null, (tx) => useDevice(tx, u.id, t, now))),
    );
    expect(alive.slice(0, 2)).toEqual([null, null]);
    expect(alive.slice(2).every(Boolean)).toBe(true);
  });

  it('the expiry slides 30 days from each use but never past 90 days from creation', async () => {
    const u = await seedUser();
    const t0 = new Date('2026-11-01T10:00:00.000Z');
    const d = await withSystem(null, (tx) => createDevice(tx, u.id, t0));
    expect(d.expiresAt.getTime()).toBe(t0.getTime() + DEVICE_TTL_MS);

    const day20 = new Date(t0.getTime() + 20 * DAY); // expires on day 50 after this use
    const slid = await withSystem(null, (tx) => useDevice(tx, u.id, d.token, day20));
    expect(slid?.expiresAt.getTime()).toBe(day20.getTime() + DEVICE_TTL_MS);

    const day49 = new Date(t0.getTime() + 49 * DAY);
    const slidAgain = await withSystem(null, (tx) => useDevice(tx, u.id, d.token, day49));
    expect(slidAgain?.expiresAt.getTime()).toBe(day49.getTime() + DEVICE_TTL_MS);

    const day78 = new Date(t0.getTime() + 78 * DAY);
    const capped = await withSystem(null, (tx) => useDevice(tx, u.id, d.token, day78));
    expect(capped?.expiresAt.getTime()).toBe(t0.getTime() + DEVICE_MAX_AGE_MS);

    const day91 = new Date(t0.getTime() + 91 * DAY);
    expect(await withSystem(null, (tx) => useDevice(tx, u.id, d.token, day91))).toBeNull();
  });

  it('the daily prune deletes expired devices and keeps live ones', async () => {
    const u = await seedUser();
    const now = new Date();
    const old = await withSystem(null, (tx) =>
      createDevice(tx, u.id, new Date(now.getTime() - 40 * DAY)),
    );
    const live = await withSystem(null, (tx) => createDevice(tx, u.id, now));
    const result = await prune(now);
    expect(result.trustedDevices).toBeGreaterThanOrEqual(1);
    const hashes = (await deviceRows(u.id)).map((r) => r.tokenHash);
    expect(hashes).toEqual([sha256(live.token)]);
    expect(hashes).not.toContain(sha256(old.token));
  });
});
