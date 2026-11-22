import { lt } from 'drizzle-orm';
import { errorLog } from '../../lib/errors/schema.ts';
import { rateLimits } from '../../lib/rate-limit/schema.ts';
import { withSystem } from '../../lib/tenant/index.ts';
import { changeFeed } from '../../lib/tenant/schema.ts';
import { authTokens, sessions } from '../../modules/auth/schema.ts';
import type { JobHandler } from '../run-job.ts';

const DAY = 86_400_000;

export type PruneResult = {
  rateLimits: number;
  authTokens: number;
  sessions: number;
  errorLog: number;
  changeFeed: number;
};

/**
 * Daily prune (plan §4.1): rate-limit windows older than a day, tokens expired for over a week, expired sessions,
 * error_log older than 90 days, change_feed older than 7 days (through the `change_feed_prune` policy, which only
 * applies with no project context). `now` is injected so tests move the clock.
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
    };
  });
}

export const maintenance: JobHandler<'maintenance'> = async () => {
  await prune();
};
