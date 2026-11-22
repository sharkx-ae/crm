import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { seedUser } from '../../../tests/helpers/http.ts';
import { getPool } from '../../db/index.ts';
import { sha256 } from '../../lib/crypto/index.ts';
import { withSystem } from '../../lib/tenant/index.ts';
import { authTokens } from './schema.ts';
import { createSession } from './sessions.ts';
import {
  CODE_MAX_ATTEMPTS,
  CODE_TTL_MS,
  checkCode,
  consumeToken,
  INVITE_TTL_MS,
  issueCode,
  issueToken,
  peekToken,
} from './tokens.ts';

afterAll(() => getPool().end());

const T0 = new Date('2026-11-22T10:00:00.000Z');
const later = (ms: number) => new Date(T0.getTime() + ms);

const liveCount = (userId: string, kind: 'invite' | 'reset' | 'email_code') =>
  withSystem(null, async (tx) => {
    const rows = await tx
      .select({ id: authTokens.id })
      .from(authTokens)
      .where(
        and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), isNull(authTokens.usedAt)),
      );
    return rows.length;
  });

describe('link tokens (invite, reset)', () => {
  it('stores only the sha256 and consumes exactly once', async () => {
    const u = await seedUser();
    const raw = await withSystem(null, (tx) => issueToken(tx, u.id, 'reset', 3_600_000, T0));
    const [row] = await withSystem(null, (tx) =>
      tx.select().from(authTokens).where(eq(authTokens.userId, u.id)),
    );
    expect(row?.tokenHash).toBe(sha256(raw));
    expect(JSON.stringify(row)).not.toContain(raw);

    expect(await withSystem(null, (tx) => consumeToken(tx, raw, 'reset', later(1000)))).toEqual({
      userId: u.id,
    });
    expect(await withSystem(null, (tx) => consumeToken(tx, raw, 'reset', later(2000)))).toBeNull();
  });

  it('expires, and a token of one kind is useless for another', async () => {
    const u = await seedUser();
    const raw = await withSystem(null, (tx) => issueToken(tx, u.id, 'invite', INVITE_TTL_MS, T0));
    expect(await withSystem(null, (tx) => consumeToken(tx, raw, 'reset', later(1000)))).toBeNull();
    expect(
      await withSystem(null, (tx) => consumeToken(tx, raw, 'invite', later(INVITE_TTL_MS))),
    ).toBeNull();
    expect(
      await withSystem(null, (tx) => consumeToken(tx, raw, 'invite', later(INVITE_TTL_MS - 1))),
    ).toEqual({ userId: u.id });
  });

  it('a forged token matches nothing', async () => {
    expect(
      await withSystem(null, (tx) => consumeToken(tx, 'A'.repeat(43), 'invite', T0)),
    ).toBeNull();
  });

  it('a new token supersedes the previous live one', async () => {
    const u = await seedUser();
    const first = await withSystem(null, (tx) => issueToken(tx, u.id, 'invite', INVITE_TTL_MS, T0));
    const second = await withSystem(null, (tx) =>
      issueToken(tx, u.id, 'invite', INVITE_TTL_MS, later(1000)),
    );
    expect(
      await withSystem(null, (tx) => consumeToken(tx, first, 'invite', later(2000))),
    ).toBeNull();
    expect(await withSystem(null, (tx) => consumeToken(tx, second, 'invite', later(2000)))).toEqual(
      {
        userId: u.id,
      },
    );
  });

  it('peek reads without consuming', async () => {
    const u = await seedUser();
    const raw = await withSystem(null, (tx) => issueToken(tx, u.id, 'invite', INVITE_TTL_MS, T0));
    expect(await withSystem(null, (tx) => peekToken(tx, raw, 'invite', later(1)))).toEqual({
      userId: u.id,
    });
    expect(await withSystem(null, (tx) => consumeToken(tx, raw, 'invite', later(2)))).toEqual({
      userId: u.id,
    });
    expect(await withSystem(null, (tx) => peekToken(tx, raw, 'invite', later(3)))).toBeNull();
  });

  it('two concurrent issues leave exactly one live token and no error', async () => {
    const u = await seedUser();
    const raws = await Promise.all(
      Array.from({ length: 6 }, () =>
        withSystem(null, (tx) => issueToken(tx, u.id, 'reset', 3_600_000, T0)),
      ),
    );
    expect(await liveCount(u.id, 'reset')).toBe(1);
    const consumed = await Promise.all(
      raws.map((r) => withSystem(null, (tx) => consumeToken(tx, r, 'reset', later(1)))),
    );
    expect(consumed.filter(Boolean)).toHaveLength(1);
  });

  it('the database itself refuses a second live token of the same kind', async () => {
    const u = await seedUser();
    await withSystem(null, (tx) => issueToken(tx, u.id, 'reset', 3_600_000, T0));
    await withSystem(null, async (tx) => {
      await expect(
        tx.insert(authTokens).values({
          userId: u.id,
          kind: 'reset',
          tokenHash: sha256(randomUUID()),
          expiresAt: later(1000),
        }),
      ).rejects.toThrow();
    });
  });

  it('two parallel consumes of one token: exactly one wins', async () => {
    const u = await seedUser();
    const raw = await withSystem(null, (tx) => issueToken(tx, u.id, 'invite', INVITE_TTL_MS, T0));
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        withSystem(null, (tx) => consumeToken(tx, raw, 'invite', later(1))),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('emailed codes', () => {
  async function pending() {
    const u = await seedUser();
    const session = await withSystem(null, (tx) => createSession(tx, u.id, 'pending_2fa', T0));
    const { code } = await withSystem(null, (tx) => issueCode(tx, u.id, session.id, T0));
    return { u, session, code };
  }
  const check = (sessionId: string, code: string, now: Date) =>
    withSystem(null, (tx) => checkCode(tx, sessionId, code, now));
  const wrong = (code: string) => (code === '000000' ? '000001' : '000000');

  it('accepts the right code once', async () => {
    const { session, code } = await pending();
    expect(await check(session.id, code, later(1000))).toEqual({ ok: true });
    expect(await check(session.id, code, later(2000))).toEqual({ ok: false, reason: 'new_code' });
  });

  it('counts wrong attempts and kills the code on the fifth', async () => {
    const { session, code } = await pending();
    for (let i = 1; i < CODE_MAX_ATTEMPTS; i++) {
      expect(await check(session.id, wrong(code), later(i))).toEqual({
        ok: false,
        reason: 'wrong',
        attemptsLeft: CODE_MAX_ATTEMPTS - i,
      });
    }
    expect(await check(session.id, wrong(code), later(10))).toEqual({
      ok: false,
      reason: 'wrong',
      attemptsLeft: 0,
    });
    // even the right code is dead now
    expect(await check(session.id, code, later(20))).toEqual({ ok: false, reason: 'new_code' });
  });

  it('expires after 10 minutes without counting an attempt', async () => {
    const { session, code } = await pending();
    expect(await check(session.id, code, later(CODE_TTL_MS))).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(await check(session.id, code, later(CODE_TTL_MS - 1))).toEqual({ ok: true });
  });

  it('a new code supersedes the old one', async () => {
    const { u, session, code } = await pending();
    const next = await withSystem(null, (tx) => issueCode(tx, u.id, session.id, later(1000)));
    expect(await check(session.id, code, later(2000))).toMatchObject({ ok: false });
    expect(await check(session.id, next.code, later(3000))).toEqual({ ok: true });
  });

  it('a code from another session never matches', async () => {
    const a = await pending();
    const b = await pending();
    expect(await check(a.session.id, b.code, later(1))).toMatchObject({ ok: false });
    expect(await liveCount(a.u.id, 'email_code')).toBe(1);
  });

  it('is bound to the session: deleting the session removes the code', async () => {
    const { u, session } = await pending();
    await withSystem(null, async (tx) => {
      const { sessions } = await import('./schema.ts');
      await tx.delete(sessions).where(eq(sessions.id, session.id));
    });
    expect(await liveCount(u.id, 'email_code')).toBe(0);
  });
});
