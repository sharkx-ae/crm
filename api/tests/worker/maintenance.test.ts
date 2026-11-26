import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getPool } from '../../src/db/index.ts';
import { errorLog } from '../../src/lib/errors/schema.ts';
import { rateLimits } from '../../src/lib/rate-limit/schema.ts';
import { withSystem } from '../../src/lib/tenant/index.ts';
import { changeFeed } from '../../src/lib/tenant/schema.ts';
import { authTokens, sessions } from '../../src/modules/auth/schema.ts';
import { webhookEvents } from '../../src/modules/webhooks/schema.ts';
import { prune } from '../../src/worker/jobs/maintenance.ts';
import { seedWorld } from '../helpers/db.ts';
import { seedUser } from '../helpers/http.ts';

afterAll(() => getPool().end());

const NOW = new Date('2026-11-22T03:00:00.000Z');
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const count = (rows: unknown[]) => rows.length;

describe('daily maintenance prune', () => {
  it('removes what is past its keep time and leaves the rest', async () => {
    const w = await seedWorld();
    const u = await seedUser();
    const tag = randomUUID();
    const oldKey = `old-${tag}`;
    const freshKey = `fresh-${tag}`;

    await withSystem(null, async (tx) => {
      await tx.insert(rateLimits).values([
        { key: oldKey, windowStart: ago(2), count: 1 },
        { key: freshKey, windowStart: ago(0.5), count: 1 },
      ]);
      await tx.insert(errorLog).values([
        { fingerprint: oldKey, message: 'old', createdAt: ago(91) },
        { fingerprint: freshKey, message: 'fresh', createdAt: ago(89) },
      ]);
      const mk = (hours: number) => ({
        userId: u.id,
        stage: 'active' as const,
        idleExpiresAt: new Date(NOW.getTime() + hours * 3_600_000),
        expiresAt: new Date(NOW.getTime() + hours * 3_600_000),
      });
      await tx.insert(sessions).values([
        { ...mk(-1), tokenHash: `old-${tag}` },
        { ...mk(5), tokenHash: `fresh-${tag}` },
      ]);
      await tx.insert(authTokens).values([
        { userId: u.id, kind: 'reset', tokenHash: `old-${tag}`, expiresAt: ago(8), usedAt: ago(8) },
        { userId: u.id, kind: 'invite', tokenHash: `fresh-${tag}`, expiresAt: ago(6) },
      ]);
      // webhook_events: processed over 30 days ago goes; processed recently or never processed stays (F3a)
      await tx.insert(webhookEvents).values([
        { provider: 'meta', externalId: `done-old-${tag}`, payload: {}, processedAt: ago(31) },
        { provider: 'meta', externalId: `done-new-${tag}`, payload: {}, processedAt: ago(29) },
        {
          provider: 'meta',
          externalId: `pending-old-${tag}`,
          payload: {},
          receivedAt: ago(40),
        },
      ]);
    });
    await withSystem(w.a.projectId, async (tx) => {
      await tx.insert(changeFeed).values([
        { projectId: w.a.projectId, kind: 'lead', refId: randomUUID(), at: ago(30) },
        { projectId: w.a.projectId, kind: 'lead', refId: randomUUID(), at: ago(1) },
      ]);
    });

    const result = await prune(NOW);
    expect(result.rateLimits).toBeGreaterThanOrEqual(1);
    expect(result.errorLog).toBeGreaterThanOrEqual(1);
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(result.authTokens).toBeGreaterThanOrEqual(1);
    expect(result.changeFeed).toBeGreaterThanOrEqual(1);
    expect(result.webhookEvents).toBeGreaterThanOrEqual(1);

    await withSystem(null, async (tx) => {
      expect(count(await tx.select().from(rateLimits).where(eq(rateLimits.key, oldKey)))).toBe(0);
      expect(count(await tx.select().from(rateLimits).where(eq(rateLimits.key, freshKey)))).toBe(1);
      expect(count(await tx.select().from(errorLog).where(eq(errorLog.fingerprint, oldKey)))).toBe(
        0,
      );
      expect(
        count(await tx.select().from(errorLog).where(eq(errorLog.fingerprint, freshKey))),
      ).toBe(1);
      expect(
        count(
          await tx
            .select()
            .from(sessions)
            .where(eq(sessions.tokenHash, `old-${tag}`)),
        ),
      ).toBe(0);
      expect(
        count(
          await tx
            .select()
            .from(sessions)
            .where(eq(sessions.tokenHash, `fresh-${tag}`)),
        ),
      ).toBe(1);
      expect(
        count(
          await tx
            .select()
            .from(authTokens)
            .where(eq(authTokens.tokenHash, `old-${tag}`)),
        ),
      ).toBe(0);
      expect(
        count(
          await tx
            .select()
            .from(authTokens)
            .where(eq(authTokens.tokenHash, `fresh-${tag}`)),
        ),
      ).toBe(1);
    });
    const kept = await withSystem(null, (tx) =>
      tx.select({ id: webhookEvents.externalId }).from(webhookEvents),
    );
    const ids = kept.map((r) => r.id);
    expect(ids).not.toContain(`done-old-${tag}`);
    expect(ids).toContain(`done-new-${tag}`);
    expect(ids).toContain(`pending-old-${tag}`); // never processed: kept, however old
    // the 30-day-old feed row is gone, the 1-day-old one stays (change_feed_prune policy, no project context)
    const left = await withSystem(w.a.projectId, (tx) => tx.select().from(changeFeed));
    expect(left.some((r) => r.at.getTime() === ago(30).getTime())).toBe(false);
    expect(left.some((r) => r.at.getTime() === ago(1).getTime())).toBe(true);
  });

  it('is safe to run twice', async () => {
    await prune(NOW);
    const again = await prune(NOW);
    expect(Object.values(again).every((n) => n === 0)).toBe(true);
  });
});
