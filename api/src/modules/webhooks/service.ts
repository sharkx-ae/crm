import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { withSystem } from '../../lib/tenant/index.ts';
import { webhookEvents } from './schema.ts';

/**
 * Meta's webhooks carry no delivery id (plan F3a §5.2), so the key is the hash of the exact bytes: a retry of the same
 * delivery is the same bytes and lands on the same row. A retry that Meta re-batches differently makes a second row;
 * per-item keys downstream (`wa_messages.wa_message_id` unique) keep messages single.
 */
export const externalIdOf = (raw: Buffer): string =>
  `sha256:${createHash('sha256').update(raw).digest('hex')}`;

export type StoredWebhook = {
  id: string;
  /** True when this delivery was already stored (a Meta retry). */
  duplicate: boolean;
  /** True when a duplicate was already processed: nothing to queue. */
  processed: boolean;
};

/**
 * Postgres `jsonb` cannot hold U+0000 in a string: an insert fails (22P05) and Meta would retry the same signed body for
 * 7 days. The NUL is dropped from the stored copy (keys and values, nested); the dedupe key still hashes the raw bytes.
 */
export function withoutNul(value: unknown): unknown {
  if (typeof value === 'string')
    return value.includes('\u0000') ? value.replaceAll('\u0000', '') : value;
  if (Array.isArray(value)) return value.map(withoutNul);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [withoutNul(k) as string, withoutNul(v)]),
    );
  }
  return value;
}

/**
 * Stores the raw event BEFORE any processing (a verified sender only: call after the signature check). One row per
 * `(provider, external_id)`; the payload is the parsed JSON, kept in the database only (it holds phone numbers and
 * message text, so it is never logged). `project_id` stays null until F3b routes the event.
 */
export function storeWebhook(
  provider: string,
  raw: Buffer,
  payload: unknown,
): Promise<StoredWebhook> {
  const externalId = externalIdOf(raw);
  return withSystem(null, async (tx) => {
    const [inserted] = await tx
      .insert(webhookEvents)
      .values({ provider, externalId, payload: withoutNul(payload) })
      .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.externalId] })
      .returning({ id: webhookEvents.id });
    if (inserted) return { id: inserted.id, duplicate: false, processed: false };

    const [existing] = await tx
      .select({ id: webhookEvents.id, processedAt: webhookEvents.processedAt })
      .from(webhookEvents)
      .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.externalId, externalId)));
    if (!existing) throw new Error('webhook event vanished between insert and select'); // pruned in that instant
    return { id: existing.id, duplicate: true, processed: existing.processedAt !== null };
  });
}
