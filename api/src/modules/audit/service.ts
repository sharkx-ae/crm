import type { z } from 'zod';
import { auditAction } from '../../contracts/audit.ts';
import type { actorKind } from '../../contracts/common.ts';
import { getContext } from '../../lib/context/index.ts';
import { redactRecord } from '../../lib/log/redact.ts';
import type { Tx } from '../../lib/tenant/index.ts';
import { auditLog } from './schema.ts';

/** Who did it: a staff user, a client user, or the system (worker, webhooks). Built by auth's `actorOf(session)`. */
export type Actor = { kind: z.infer<typeof actorKind>; id?: string };

export type AuditEntryInput = {
  actor: Actor;
  /** `<noun>.<verb>`, e.g. `user.invited` (contracts/audit.ts `knownAuditActions`). */
  action: string;
  projectId?: string | null;
  entity?: string;
  entityId?: string;
  /** Redacted and capped: no bodies, tokens, codes, full phones or emails. */
  meta?: Record<string, unknown>;
};

const META_CAP_BYTES = 2048;

/**
 * Writes one audit row inside the mutation's own transaction, so either both commit or neither does.
 * Row-level security refuses a web user writing in someone else's name or in another project.
 */
export async function audit(tx: Tx, entry: AuditEntryInput): Promise<void> {
  const action = auditAction.parse(entry.action);
  let meta = redactRecord(entry.meta ?? {});
  if (Buffer.byteLength(JSON.stringify(meta)) > META_CAP_BYTES) meta = { truncated: true };

  await tx.insert(auditLog).values({
    actorKind: entry.actor.kind,
    actorId: entry.actor.id ?? null,
    projectId: entry.projectId ?? null,
    action,
    entity: entry.entity ?? null,
    entityId: entry.entityId ?? null,
    meta,
  });
  getContext().auditCount += 1;
}
