import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { seedUser } from '../../../tests/helpers/http.ts';
import { getPool } from '../../db/index.ts';
import { withSystem } from '../../lib/tenant/index.ts';
import { sessions, users } from './schema.ts';
import {
  ABSOLUTE_MS,
  createSession,
  IDLE_MS,
  PENDING_MS,
  resolveSession,
  revokeAllSessions,
  revokeSession,
} from './sessions.ts';

afterAll(() => getPool().end());

const T0 = new Date('2026-11-22T10:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const make = async (
  stage: 'pending_2fa' | 'active',
  user?: Awaited<ReturnType<typeof seedUser>>,
) => {
  const u = user ?? (await seedUser());
  const s = await withSystem(null, (tx) => createSession(tx, u.id, stage, T0));
  return { u, s };
};
const row = (id: string) =>
  withSystem(null, async (tx) => {
    const [r] = await tx.select().from(sessions).where(eq(sessions.id, id));
    return r;
  });

describe('sessions', () => {
  it('resolves an active session to the contract shape, with no secrets', async () => {
    const { u, s } = await make('active');
    const resolved = await resolveSession(s.token, at(MIN));
    expect(resolved).toMatchObject({
      userId: u.id,
      role: 'manager',
      projectIds: [],
      locale: 'en',
      stage: 'active',
      sessionId: s.id,
      email: u.email,
    });
    expect(JSON.stringify(resolved)).not.toMatch(/hash|password/i);
  });

  it('a client resolves with its project', async () => {
    const { seedWorld } = await import('../../../tests/helpers/db.ts');
    const w = await seedWorld();
    const { s } = await make('active', { id: w.clientA, email: '', password: '', name: '' });
    expect((await resolveSession(s.token, at(MIN)))?.projectIds).toEqual([w.a.projectId]);
  });

  it('an unknown or malformed token resolves to nothing', async () => {
    expect(await resolveSession('A'.repeat(43), at(0))).toBeNull();
    expect(await resolveSession('nope', at(0))).toBeNull();
    expect(await resolveSession('', at(0))).toBeNull();
  });

  it('a pending session lives 15 minutes and does not slide', async () => {
    const { s } = await make('pending_2fa');
    expect((await resolveSession(s.token, at(PENDING_MS - 1)))?.stage).toBe('pending_2fa');
    expect(await resolveSession(s.token, at(PENDING_MS))).toBeNull();
    expect((await row(s.id))?.idleExpiresAt.getTime()).toBe(T0.getTime() + PENDING_MS);
  });

  it('an active session expires after 12 hours idle', async () => {
    const { s } = await make('active');
    expect(await resolveSession(s.token, at(IDLE_MS - 1))).not.toBeNull();
    const idle = await make('active');
    expect(await resolveSession(idle.s.token, at(IDLE_MS))).toBeNull();
  });

  it('slides the idle expiry at most once every 5 minutes', async () => {
    const { s } = await make('active');
    const idle0 = (await row(s.id))?.idleExpiresAt.getTime();
    expect(idle0).toBe(T0.getTime() + IDLE_MS);

    await resolveSession(s.token, at(4 * MIN)); // inside the 5-minute window: no write
    expect((await row(s.id))?.idleExpiresAt.getTime()).toBe(idle0);

    await resolveSession(s.token, at(6 * MIN)); // past it: slides
    expect((await row(s.id))?.idleExpiresAt.getTime()).toBe(T0.getTime() + 6 * MIN + IDLE_MS);
  });

  it('never slides past the absolute 7 days', async () => {
    const { s } = await make('active');
    // a request every 6 hours keeps it alive for the whole week
    for (let h = 6; h <= 6 * 24 + 18; h += 6) {
      expect(await resolveSession(s.token, at(h * HOUR))).not.toBeNull();
    }
    await resolveSession(s.token, at(6 * DAY + 20 * HOUR));
    expect((await row(s.id))?.idleExpiresAt.getTime()).toBe(T0.getTime() + ABSOLUTE_MS);
    expect(await resolveSession(s.token, at(ABSOLUTE_MS))).toBeNull();
  });

  it('a disabled or not-yet-accepted user fails even though the session row is still there', async () => {
    const { u, s } = await make('active');
    for (const status of ['disabled', 'invited'] as const) {
      await withSystem(null, (tx) => tx.update(users).set({ status }).where(eq(users.id, u.id)));
      expect(await resolveSession(s.token, at(MIN))).toBeNull();
    }
    await withSystem(null, (tx) =>
      tx.update(users).set({ status: 'active' }).where(eq(users.id, u.id)),
    );
    expect(await resolveSession(s.token, at(MIN))).not.toBeNull();
  });

  it('revoke removes one session; revoke-all removes every session of the user', async () => {
    const u = await seedUser();
    const a = await withSystem(null, (tx) => createSession(tx, u.id, 'active', T0));
    const b = await withSystem(null, (tx) => createSession(tx, u.id, 'active', T0));
    const other = await make('active');
    await withSystem(null, (tx) => revokeSession(tx, a.id));
    expect(await resolveSession(a.token, at(1))).toBeNull();
    expect(await resolveSession(b.token, at(1))).not.toBeNull();
    await withSystem(null, (tx) => revokeAllSessions(tx, u.id));
    expect(await resolveSession(b.token, at(1))).toBeNull();
    expect(await resolveSession(other.s.token, at(1))).not.toBeNull();
  });

  it('tokens are unique and only their hash is stored', async () => {
    const { s } = await make('active');
    expect((await row(s.id))?.tokenHash).not.toBe(s.token);
    expect(JSON.stringify(await row(s.id))).not.toContain(s.token);
  });
});
