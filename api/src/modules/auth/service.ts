import { eq } from 'drizzle-orm';
import type {
  ActiveSessionResponse,
  CodeSentResponse,
  Me,
  PendingSessionResponse,
} from '../../contracts/auth.ts';
import type { Locale } from '../../contracts/common.ts';
import { DUMMY_HASH, hashPassword, needsRehash, verifyPassword } from '../../lib/crypto/index.ts';
import { sendEmail } from '../../lib/email/index.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { hit, peek, rateKey, rules } from '../../lib/rate-limit/index.ts';
import { withSystem } from '../../lib/tenant/index.ts';
import { audit } from '../audit/index.ts';
import { actorOf, maskEmail } from './actor.ts';
import { users } from './schema.ts';
import { createSession, revokeAllSessions, revokeByToken, revokeSession } from './sessions.ts';
import {
  CODE_TTL_MS,
  checkCode,
  consumeToken,
  issueCode,
  issueToken,
  RESET_TTL_MS,
  revokeLiveTokens,
} from './tokens.ts';

// F1c S1/S2 (plan §6.1). Three rules shape this file:
//  - time is injected (`now`), never read from the database;
//  - failure bookkeeping (rate-limit hits, login_failed audits, code attempts) commits BEFORE the throw: the
//    transaction returns a verdict and the AppError is thrown after it;
//  - hashing happens outside transactions (32 MiB and ~100 ms each).

const toMe = (s: ResolvedSession, stage: 'active' | 'pending_2fa'): Me => ({
  userId: s.userId,
  role: s.role,
  projectIds: s.projectIds,
  locale: s.locale,
  stage,
  name: s.name,
  email: s.email,
});

export const getMe = (s: ResolvedSession): Me => toMe(s, s.stage);

async function sendCodeEmail(to: string, locale: Locale, code: string): Promise<void> {
  await sendEmail({
    to,
    template: 'code',
    locale,
    data: { code, expiresInMinutes: CODE_TTL_MS / 60_000 },
  });
}

export async function login(
  input: { email: string; password: string },
  ctx: { ip: string; forwardedSessionToken?: string },
  now: Date = new Date(),
): Promise<PendingSessionResponse> {
  const key = rateKey('login', input.email, ctx.ip);

  // 1. rate limit (peek, so a locked-out caller cannot extend their own lock) and user lookup, one short tx.
  const first = await withSystem(null, async (tx) => {
    const limit = await peek(tx, key, rules.login, now);
    if (!limit.allowed) {
      await audit(tx, {
        actor: { kind: 'system' },
        action: 'auth.login_failed',
        meta: { reason: 'rate_limited' },
      });
      return { limited: limit.retryAfterSec } as const;
    }
    const [user] = await tx.select().from(users).where(eq(users.email, input.email));
    return { user } as const;
  });
  if ('limited' in first) throw new AppError('RATE_LIMITED', { retryAfterSec: first.limited });
  const user = first.user;

  // 2. always verify against something, so an unknown email costs the same as a wrong password.
  const verified = await verifyPassword(input.password, user?.pwHash ?? DUMMY_HASH);
  const good = verified && user?.status === 'active' && user.pwHash !== null;

  if (!good || !user || !user.pwHash) {
    const reason = !user
      ? 'unknown_user'
      : user.status !== 'active'
        ? 'not_active'
        : 'bad_password';
    await withSystem(null, async (tx) => {
      await hit(tx, key, rules.login, now);
      await audit(tx, {
        actor: user ? actorOf({ userId: user.id, role: user.role }) : { kind: 'system' },
        action: 'auth.login_failed',
        entity: user ? 'user' : undefined,
        entityId: user?.id,
        meta: { reason },
      });
    });
    throw new AppError('UNAUTHENTICATED'); // one generic answer for every failure
  }

  const upgraded = needsRehash(user.pwHash)
    ? await hashPassword(input.password).catch(() => null)
    : null;

  // 3. success: one transaction creates the pending session and the code.
  const out = await withSystem(null, async (tx) => {
    const sendLimit = await hit(tx, rateKey('code_send', user.id), rules.codeSend, now);
    if (!sendLimit.allowed) return { limited: sendLimit.retryAfterSec } as const;

    if (upgraded) await tx.update(users).set({ pwHash: upgraded }).where(eq(users.id, user.id));
    if (ctx.forwardedSessionToken) await revokeByToken(tx, ctx.forwardedSessionToken);
    const session = await createSession(tx, user.id, 'pending_2fa', now);
    const { code } = await issueCode(tx, user.id, session.id, now);
    await audit(tx, {
      actor: actorOf({ userId: user.id, role: user.role }),
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      meta: { stage: 'pending_2fa' },
    });
    return { session, code } as const;
  });
  if ('limited' in out) throw new AppError('RATE_LIMITED', { retryAfterSec: out.limited });

  // 4. after commit; a failed send is a 502 and the person signs in again.
  await sendCodeEmail(user.email, user.locale, out.code);
  return {
    stage: 'pending_2fa',
    sessionToken: out.session.token,
    expiresAt: out.session.expiresAt.toISOString(),
    maskedEmail: maskEmail(user.email),
  };
}

export async function verifyCode(
  session: ResolvedSession,
  code: string,
  now: Date = new Date(),
): Promise<ActiveSessionResponse> {
  if (session.stage !== 'pending_2fa') throw new AppError('UNAUTHENTICATED');

  const out = await withSystem(null, async (tx) => {
    const check = await checkCode(tx, session.sessionId, code, now);
    if (!check.ok) return check; // the attempt counter commits with this return
    // The pending token dies here; the browser gets a new one.
    await revokeSession(tx, session.sessionId);
    const active = await createSession(tx, session.userId, 'active', now);
    await audit(tx, {
      actor: actorOf(session),
      action: 'auth.code_verified',
      entity: 'user',
      entityId: session.userId,
    });
    return { ok: true, active } as const;
  });

  if (!out.ok) {
    if (out.reason === 'wrong') {
      throw new AppError('VALIDATION', {
        details: {
          attemptsLeft: out.attemptsLeft,
          ...(out.attemptsLeft === 0 && { needNewCode: true }),
        },
      });
    }
    throw new AppError('VALIDATION', {
      details: out.reason === 'expired' ? { expired: true } : { needNewCode: true },
    });
  }
  return {
    stage: 'active',
    sessionToken: out.active.token,
    expiresAt: out.active.expiresAt.toISOString(),
    me: toMe(session, 'active'),
  };
}

export async function resendCode(
  session: ResolvedSession,
  now: Date = new Date(),
): Promise<CodeSentResponse> {
  if (session.stage !== 'pending_2fa') throw new AppError('UNAUTHENTICATED');

  const out = await withSystem(null, async (tx) => {
    const limit = await hit(tx, rateKey('code_send', session.userId), rules.codeSend, now);
    if (!limit.allowed) return { limited: limit.retryAfterSec } as const;
    return { issued: await issueCode(tx, session.userId, session.sessionId, now) } as const;
  });
  if ('limited' in out) throw new AppError('RATE_LIMITED', { retryAfterSec: out.limited });

  await sendCodeEmail(session.email, session.locale, out.issued.code);
  return { maskedEmail: maskEmail(session.email), expiresAt: out.issued.expiresAt.toISOString() };
}

export async function logout(session: ResolvedSession): Promise<void> {
  await withSystem(null, async (tx) => {
    await revokeSession(tx, session.sessionId);
    await audit(tx, {
      actor: actorOf(session),
      action: 'auth.logout',
      entity: 'user',
      entityId: session.userId,
    });
  });
}

/** The language switch (F2a). Writes through the system role: app_user has no UPDATE grant on users. */
export async function updateMe(session: ResolvedSession, input: { locale: Locale }): Promise<Me> {
  await withSystem(null, async (tx) => {
    await tx.update(users).set({ locale: input.locale }).where(eq(users.id, session.userId));
    await audit(tx, {
      actor: actorOf(session),
      action: 'user.locale_changed',
      entity: 'user',
      entityId: session.userId,
      meta: { locale: input.locale },
    });
  });
  return toMe({ ...session, locale: input.locale }, session.stage);
}

/**
 * S5 (plan §6.3). The answer is the same for every email: the limit counts every request, existing account or not,
 * so even a 429 says nothing about which accounts exist. Returns `deliver` for the route to run AFTER it has replied,
 * so response time does not reveal whether an email was sent. Unknown, invited and disabled users get no email.
 */
export async function requestReset(
  input: { email: string },
  o: { appUrl: string; now?: Date },
): Promise<{ deliver: (() => Promise<void>) | null }> {
  const now = o.now ?? new Date();
  const out = await withSystem(null, async (tx) => {
    const limit = await hit(tx, rateKey('reset', input.email), rules.reset, now);
    if (!limit.allowed) return { limited: limit.retryAfterSec } as const;

    const [user] = await tx.select().from(users).where(eq(users.email, input.email));
    if (!user || user.status !== 'active') return { user: null } as const;

    const token = await issueToken(tx, user.id, 'reset', RESET_TTL_MS, now);
    await audit(tx, {
      actor: actorOf({ userId: user.id, role: user.role }),
      action: 'auth.reset_requested',
      entity: 'user',
      entityId: user.id,
    });
    return { user, token } as const;
  });
  if ('limited' in out) throw new AppError('RATE_LIMITED', { retryAfterSec: out.limited });
  if (!out.user) return { deliver: null };

  const { user, token } = out;
  return {
    deliver: () =>
      sendEmail({
        to: user.email,
        template: 'reset',
        locale: user.locale,
        data: {
          link: `${o.appUrl.replace(/\/$/, '')}/${user.locale}/reset/${token}`,
          expiresInMinutes: RESET_TTL_MS / 60_000,
        },
      }),
  };
}

/** Single use. Success signs the person out everywhere and voids every other open link or code. */
export async function confirmReset(
  input: { token: string; password: string },
  now: Date = new Date(),
): Promise<void> {
  const pwHash = await hashPassword(input.password); // before the transaction

  await withSystem(null, async (tx) => {
    const consumed = await consumeToken(tx, input.token, 'reset', now);
    if (!consumed) throw new AppError('NOT_FOUND');
    const [user] = await tx.select().from(users).where(eq(users.id, consumed.userId));
    if (!user || user.status !== 'active') throw new AppError('NOT_FOUND');

    await tx.update(users).set({ pwHash }).where(eq(users.id, user.id));
    await revokeAllSessions(tx, user.id);
    await revokeLiveTokens(tx, user.id, now);
    await audit(tx, {
      actor: actorOf({ userId: user.id, role: user.role }),
      action: 'auth.password_changed',
      entity: 'user',
      entityId: user.id,
      meta: { via: 'reset' },
    });
  });
}
