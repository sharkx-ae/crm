import { and, eq, isNull, sql } from 'drizzle-orm';
import { email as emailSchema } from '../../contracts/common.ts';
import type { Tx } from '../../lib/tenant/index.ts';
import { contacts } from './schema.ts';

// One person per client (CONTRACTS §3). Match on the E.164 phone, else on the email; no phone and no email means a new
// contact with nothing to match. The caller holds the client's row lock (ingestLead), so lookups and inserts for one
// client never race; the unique (project_id, phone_e164) constraint stays the backstop.

export type ContactKeys = { e164?: string; email?: string; name?: string };

/**
 * Lower-cased and trimmed; empty or not a valid address (the contract's `email`) → undefined. Emails are stored this
 * way, so equality is enough to match, and every stored email passes the response contracts (F10a S3).
 */
export function normaliseEmail(raw: string | null | undefined): string | undefined {
  const v = (raw ?? '').trim().toLowerCase();
  return v && emailSchema.safeParse(v).success ? v : undefined;
}

export async function findOrCreateContact(
  tx: Tx,
  projectId: string,
  keys: ContactKeys,
): Promise<{ id: string; created: boolean }> {
  const match = keys.e164
    ? eq(contacts.phoneE164, keys.e164)
    : keys.email
      ? eq(contacts.email, keys.email)
      : null;

  if (match) {
    const [found] = await tx
      .select({
        id: contacts.id,
        name: contacts.name,
        email: contacts.email,
        phoneE164: contacts.phoneE164,
      })
      .from(contacts)
      .where(and(eq(contacts.projectId, projectId), match))
      .limit(1);
    if (found) {
      // Fill what was missing; never overwrite what the contact already has.
      const patch: Partial<typeof contacts.$inferInsert> = {};
      if (!found.name && keys.name) patch.name = keys.name;
      if (!found.email && keys.email) patch.email = keys.email;
      if (!found.phoneE164 && keys.e164) patch.phoneE164 = keys.e164;
      if (Object.keys(patch).length) {
        await tx.update(contacts).set(patch).where(eq(contacts.id, found.id));
      }
      return { id: found.id, created: false };
    }
  }

  const [row] = await tx
    .insert(contacts)
    .values({
      projectId,
      name: keys.name ?? null,
      phoneE164: keys.e164 ?? null,
      email: keys.email ?? null,
    })
    .onConflictDoNothing({ target: [contacts.projectId, contacts.phoneE164] })
    .returning({ id: contacts.id });
  if (row) return { id: row.id, created: true };

  // Lost a race on the phone constraint (another writer without the lock): use the row that won.
  const [winner] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.projectId, projectId),
        keys.e164 ? eq(contacts.phoneE164, keys.e164) : isNull(contacts.phoneE164),
      ),
    )
    .orderBy(sql`${contacts.createdAt} asc`)
    .limit(1);
  if (!winner) throw new Error('contact insert returned no row');
  return { id: winner.id, created: false };
}
