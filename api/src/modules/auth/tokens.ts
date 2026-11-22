import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomCode, randomToken, safeEqual, sha256 } from '../../lib/crypto/index.ts';
import type { Tx } from '../../lib/tenant/index.ts';
import { authTokens } from './schema.ts';

// Invite, reset and emailed-code tokens (plan §6.4 token lifecycle). Only sha256 is stored. `used_at` is set for
// every terminal state except expiry (used, superseded, exhausted, revoked), which frees the partial unique index
// `auth_tokens_one_live`: one live token per user and kind. Time is always passed in, never read from the DB.
export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

type LinkKind = 'invite' | 'reset';

/** Two concurrent issues for the same user and kind queue up instead of tripping the unique index. */
const lockFor = (tx: Tx, userId: string, kind: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${kind}`}, 0))`);

/** Supersedes any live token of this kind and returns the new raw token (shown once, in the email). */
export async function issueToken(
  tx: Tx,
  userId: string,
  kind: LinkKind,
  ttlMs: number,
  now: Date,
): Promise<string> {
  await lockFor(tx, userId, kind);
  await tx
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), isNull(authTokens.usedAt)),
    );
  const raw = randomToken();
  await tx.insert(authTokens).values({
    userId,
    kind,
    tokenHash: sha256(raw),
    expiresAt: new Date(now.getTime() + ttlMs),
  });
  return raw;
}

/**
 * Looks up a live token and marks it used, all under a row lock, so two requests cannot both consume it.
 * Returns null for missing, used or expired: the caller answers 404 and never says which.
 */
export async function consumeToken(
  tx: Tx,
  raw: string,
  kind: LinkKind,
  now: Date,
): Promise<{ userId: string } | null> {
  const [row] = await tx
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, sha256(raw)), eq(authTokens.kind, kind)))
    .for('update');
  if (!row || row.usedAt || row.expiresAt.getTime() <= now.getTime()) return null;
  await tx.update(authTokens).set({ usedAt: now }).where(eq(authTokens.id, row.id));
  return { userId: row.userId };
}

/** Read without consuming: the accept screen shows who invited the person before they set a password. */
export async function peekToken(
  tx: Tx,
  raw: string,
  kind: LinkKind,
  now: Date,
): Promise<{ userId: string } | null> {
  const [row] = await tx
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, sha256(raw)), eq(authTokens.kind, kind)));
  if (!row || row.usedAt || row.expiresAt.getTime() <= now.getTime()) return null;
  return { userId: row.userId };
}

const codeHash = (sessionId: string, code: string) => sha256(`${sessionId}:${code}`);

/** A new code supersedes the user's previous one. Bound to the pending session it was issued for. */
export async function issueCode(
  tx: Tx,
  userId: string,
  sessionId: string,
  now: Date,
): Promise<{ code: string; expiresAt: Date }> {
  await lockFor(tx, userId, 'email_code');
  await tx
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.kind, 'email_code'),
        isNull(authTokens.usedAt),
      ),
    );
  const code = randomCode();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  await tx.insert(authTokens).values({
    userId,
    kind: 'email_code',
    tokenHash: codeHash(sessionId, code),
    sessionId,
    expiresAt,
  });
  return { code, expiresAt };
}

export type CodeCheck =
  | { ok: true }
  | { ok: false; reason: 'new_code' }
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'wrong'; attemptsLeft: number };

/**
 * Checks a code for this session under a row lock. A wrong code counts an attempt; the fifth kills the code.
 * The caller returns normally from its transaction on `ok: false`, so the counter commits, and only then throws.
 */
export async function checkCode(
  tx: Tx,
  sessionId: string,
  code: string,
  now: Date,
): Promise<CodeCheck> {
  const [row] = await tx
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.sessionId, sessionId),
        eq(authTokens.kind, 'email_code'),
        isNull(authTokens.usedAt),
      ),
    )
    .for('update');
  if (!row || row.attempts >= CODE_MAX_ATTEMPTS) return { ok: false, reason: 'new_code' };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };

  if (!safeEqual(row.tokenHash, codeHash(sessionId, code))) {
    const attempts = row.attempts + 1;
    await tx
      .update(authTokens)
      .set({ attempts, usedAt: attempts >= CODE_MAX_ATTEMPTS ? now : null })
      .where(eq(authTokens.id, row.id));
    return { ok: false, reason: 'wrong', attemptsLeft: Math.max(0, CODE_MAX_ATTEMPTS - attempts) };
  }
  await tx.update(authTokens).set({ usedAt: now }).where(eq(authTokens.id, row.id));
  return { ok: true };
}

/** Marks every live token of the user used (disable, password change). */
export async function revokeLiveTokens(tx: Tx, userId: string, now: Date): Promise<void> {
  await tx
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(eq(authTokens.userId, userId), isNull(authTokens.usedAt)));
}
