import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../../db/index.ts';
import { sha256 } from '../crypto/index.ts';
import { rateLimits } from './schema.ts';

// Postgres fixed window (F1 plan §7). Run inside a withSystem() transaction: rate_limits is system-only.
// Fixed windows allow up to twice the limit across a boundary; accepted for the MVP.
export type Rule = { limit: number; windowSec: number };

export const rules = {
  /** Counted on failures, and checked before the password is verified. Key: email + ip. */
  login: { limit: 5, windowSec: 15 * 60 },
  /** Every code issued: login, invite accept, resend. Key: user. */
  codeSend: { limit: 3, windowSec: 10 * 60 },
  /** Every reset request, whether the account exists or not. Key: email. */
  reset: { limit: 3, windowSec: 60 * 60 },
  /** Alert emails: one per fingerprint per hour. */
  alert: { limit: 1, windowSec: 60 * 60 },
} as const satisfies Record<string, Rule>;

export type RateResult = {
  /** For `hit`: this hit was within the limit. For `peek`: one more hit would be. */
  allowed: boolean;
  count: number;
  retryAfterSec: number;
};

/** Keys are hashes of their parts, so the table never holds an email or an address. */
export function rateKey(kind: string, ...parts: string[]): string {
  return `${kind}:${sha256(parts.join('\u0000'))}`;
}

function windowOf(rule: Rule, now: Date): { start: Date; retryAfterSec: number } {
  const size = rule.windowSec * 1000;
  const startMs = Math.floor(now.getTime() / size) * size;
  return {
    start: new Date(startMs),
    retryAfterSec: Math.max(1, Math.ceil((startMs + size - now.getTime()) / 1000)),
  };
}

/** Reads the current count without counting. */
export async function peek(
  tx: Tx,
  key: string,
  rule: Rule,
  now: Date = new Date(),
): Promise<RateResult> {
  const { start, retryAfterSec } = windowOf(rule, now);
  const [row] = await tx
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, start)));
  const count = row?.count ?? 0;
  return { allowed: count < rule.limit, count, retryAfterSec };
}

/** Gives one counted event back (a reserved login attempt that turned out to be right). Never below zero. */
export async function release(
  tx: Tx,
  key: string,
  rule: Rule,
  now: Date = new Date(),
): Promise<void> {
  const { start } = windowOf(rule, now);
  await tx
    .update(rateLimits)
    .set({ count: sql`greatest(${rateLimits.count} - 1, 0)` })
    .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, start)));
}

/** Counts one event; atomic, so parallel hits are each counted exactly once. */
export async function hit(
  tx: Tx,
  key: string,
  rule: Rule,
  now: Date = new Date(),
): Promise<RateResult> {
  const { start, retryAfterSec } = windowOf(rule, now);
  const [row] = await tx
    .insert(rateLimits)
    .values({ key, windowStart: start, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  const count = row?.count ?? 1;
  return { allowed: count <= rule.limit, count, retryAfterSec };
}
