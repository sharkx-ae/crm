import { and, isNotNull, lt } from 'drizzle-orm';
import { errorLog } from '../../lib/errors/schema.ts';
import { rateLimits } from '../../lib/rate-limit/schema.ts';
import { withSystem } from '../../lib/tenant/index.ts';
import { changeFeed } from '../../lib/tenant/schema.ts';
import { authTokens, sessions, trustedDevices } from '../../modules/auth/schema.ts';
import { webhookEvents } from '../../modules/webhooks/schema.ts';
import type { JobHandler } from '../run-job.ts';

const DAY = 86_400_000;

export type PruneResult = {
  rateLimits: number;
  authTokens: number;
  sessions: number;
  trustedDevices: number;
  errorLog: number;
  changeFeed: number;
  webhookEvents: number;
};

/**
 * Daily prune (plan §4.1): rate-limit windows older than a day, tokens expired for over a week, expired sessions and trusted devices,
 * error_log older than 90 days, change_feed older than 7 days (through the `change_feed_prune` policy, which only
 * applies with no project context), webhook_events processed over 30 days ago (F3a: the payloads hold phone numbers and
 * message text; an unprocessed row is never pruned, so nothing is lost before F3b handles it). `now` is injected so
 * tests move the clock.
 */
export async function prune(now: Date = new Date()): Promise<PruneResult> {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  return withSystem(null, async (tx) => {
    const del = async (rows: Promise<unknown[]>) => (await rows).length;
    return {
      rateLimits: await del(
        tx
          .delete(rateLimits)
          .where(lt(rateLimits.windowStart, ago(DAY)))
          .returning({ k: rateLimits.key }),
      ),
      authTokens: await del(
        tx
          .delete(authTokens)
          .where(lt(authTokens.expiresAt, ago(7 * DAY)))
          .returning({ id: authTokens.id }),
      ),
      sessions: await del(
        tx.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id }),
      ),
      trustedDevices: await del(
        tx
          .delete(trustedDevices)
          .where(lt(trustedDevices.expiresAt, now))
          .returning({ id: trustedDevices.id }),
      ),
      errorLog: await del(
        tx
          .delete(errorLog)
          .where(lt(errorLog.createdAt, ago(90 * DAY)))
          .returning({ id: errorLog.id }),
      ),
      // The policy compares with the database clock (7 days); the explicit bound keeps the result testable.
      changeFeed: await del(
        tx
          .delete(changeFeed)
          .where(lt(changeFeed.at, ago(7 * DAY)))
          .returning({ id: changeFeed.id }),
      ),
      webhookEvents: await del(
        tx
          .delete(webhookEvents)
          .where(
            and(isNotNull(webhookEvents.processedAt), lt(webhookEvents.processedAt, ago(30 * DAY))),
          )
          .returning({ id: webhookEvents.id }),
      ),
    };
  });
}

export const maintenance: JobHandler<'maintenance'> = async () => {
  await prune();
};
