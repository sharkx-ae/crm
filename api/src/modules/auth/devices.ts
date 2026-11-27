import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { opaqueToken } from '../../contracts/common.ts';
import { randomToken, sha256 } from '../../lib/crypto/index.ts';
import type { Tx } from '../../lib/tenant/index.ts';
import { trustedDevices } from './schema.ts';

// Trust this device (spec F1c-remember-device). The password is always required; a valid device only replaces the
// emailed code. 30 days from the last use (sliding), never more than 90 days from creation, at most 10 per person.
export const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DEVICE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_DEVICES = 10;

export type Device = { token: string; expiresAt: Date };

/** A new trusted device for this user. The raw token is returned once; beyond ten, the oldest are removed. */
export async function createDevice(tx: Tx, userId: string, now: Date): Promise<Device> {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + DEVICE_TTL_MS);
  await tx
    .insert(trustedDevices)
    .values({ tokenHash: sha256(token), userId, lastUsedAt: now, expiresAt, createdAt: now });
  const all = await tx
    .select({ id: trustedDevices.id })
    .from(trustedDevices)
    .where(eq(trustedDevices.userId, userId))
    .orderBy(asc(trustedDevices.createdAt), asc(trustedDevices.id));
  const extra = all.slice(0, Math.max(0, all.length - MAX_DEVICES)).map((d) => d.id);
  if (extra.length > 0) await tx.delete(trustedDevices).where(inArray(trustedDevices.id, extra));
  return { token, expiresAt };
}

/**
 * Is this cookie token a live trusted device of THIS user? If so its expiry slides (never past 90 days from creation)
 * and the new expiry is returned. Anything else (unknown, expired, too old, another user's) is null, never an error.
 */
export async function useDevice(
  tx: Tx,
  userId: string,
  raw: string | undefined,
  now: Date,
): Promise<{ expiresAt: Date } | null> {
  if (!raw || !opaqueToken.safeParse(raw).success) return null;
  const [row] = await tx
    .select()
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.tokenHash, sha256(raw)),
        eq(trustedDevices.userId, userId),
        gt(trustedDevices.expiresAt, now),
      ),
    );
  if (!row) return null;
  const hardStop = row.createdAt.getTime() + DEVICE_MAX_AGE_MS;
  if (hardStop <= now.getTime()) return null;
  const expiresAt = new Date(Math.min(now.getTime() + DEVICE_TTL_MS, hardStop));
  await tx
    .update(trustedDevices)
    .set({ lastUsedAt: now, expiresAt })
    .where(eq(trustedDevices.id, row.id));
  return { expiresAt };
}

/**
 * Password change, reset, disable: the person is not trusted anywhere any more. Returns how many were removed; the
 * caller records the count in the meta of its own audit row (a route writes exactly one audit row).
 */
export async function revokeAllDevices(tx: Tx, userId: string): Promise<number> {
  const rows = await tx
    .delete(trustedDevices)
    .where(eq(trustedDevices.userId, userId))
    .returning({ id: trustedDevices.id });
  return rows.length;
}
