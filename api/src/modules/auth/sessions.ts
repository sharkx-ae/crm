import { and, eq, gt } from 'drizzle-orm';
import { opaqueToken } from '../../contracts/common.ts';
import { randomToken, sha256 } from '../../lib/crypto/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { type Tx, withSystem } from '../../lib/tenant/index.ts';
import { projectMembers } from '../../lib/tenant/schema.ts';
import { sessions, users } from './schema.ts';

export type { ResolvedSession };

// Plan §6.4. Opaque 256-bit token (sha256 stored). Pending: 15 min, then a NEW token at code verify: idle 12 h,
// absolute 7 d. Every time is passed in, so tests can move the clock.
export const PENDING_MS = 15 * 60 * 1000;
export const IDLE_MS = 12 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
export const SLIDE_AFTER_MS = 5 * 60 * 1000;

export async function createSession(
  tx: Tx,
  userId: string,
  stage: 'pending_2fa' | 'active',
  now: Date,
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + (stage === 'active' ? ABSOLUTE_MS : PENDING_MS));
  const idleExpiresAt = new Date(now.getTime() + (stage === 'active' ? IDLE_MS : PENDING_MS));
  const [row] = await tx
    .insert(sessions)
    .values({ tokenHash: sha256(token), userId, stage, idleExpiresAt, expiresAt })
    .returning({ id: sessions.id });
  if (!row) throw new Error('session insert returned no row');
  return { id: row.id, token, expiresAt };
}

/**
 * Raw token → session, or null. Disabled and not-yet-accepted users fail here even if session deletion lagged.
 * An active session slides its idle expiry at most once every 5 minutes, never past the absolute one.
 */
export async function resolveSession(
  raw: string,
  now: Date = new Date(),
): Promise<ResolvedSession | null> {
  if (!opaqueToken.safeParse(raw).success) return null;
  return withSystem(null, async (tx) => {
    const [row] = await tx
      .select({
        sessionId: sessions.id,
        stage: sessions.stage,
        idleExpiresAt: sessions.idleExpiresAt,
        expiresAt: sessions.expiresAt,
        userId: users.id,
        role: users.role,
        locale: users.locale,
        name: users.name,
        email: users.email,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, sha256(raw)),
          gt(sessions.expiresAt, now),
          gt(sessions.idleExpiresAt, now),
          eq(users.status, 'active'),
        ),
      );
    if (!row) return null;

    const members = await tx
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, row.userId));

    if (
      row.stage === 'active' &&
      row.idleExpiresAt.getTime() < now.getTime() + IDLE_MS - SLIDE_AFTER_MS
    ) {
      const idle = Math.min(now.getTime() + IDLE_MS, row.expiresAt.getTime());
      await tx
        .update(sessions)
        .set({ idleExpiresAt: new Date(idle) })
        .where(eq(sessions.id, row.sessionId));
    }

    return {
      userId: row.userId,
      role: row.role,
      projectIds: members.map((m) => m.projectId),
      locale: row.locale,
      stage: row.stage,
      sessionId: row.sessionId,
      name: row.name,
      email: row.email,
    };
  });
}

export async function revokeSession(tx: Tx, sessionId: string): Promise<void> {
  await tx.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Password change, reset, disable. Cascades to the user's pending emailed codes. */
export async function revokeAllSessions(tx: Tx, userId: string): Promise<void> {
  await tx.delete(sessions).where(eq(sessions.userId, userId));
}

/** Deletes the session a raw token points at, if any (login replaces a forwarded old session). */
export async function revokeByToken(tx: Tx, raw: string): Promise<void> {
  if (!opaqueToken.safeParse(raw).success) return;
  await tx.delete(sessions).where(eq(sessions.tokenHash, sha256(raw)));
}
