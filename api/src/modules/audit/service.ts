import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { type AuditPage, type AuditQuery, auditAction } from '../../contracts/audit.ts';
import type { actorKind } from '../../contracts/common.ts';
import { getContext } from '../../lib/context/index.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { redactRecord } from '../../lib/log/redact.ts';
import { type Tx, withTenant } from '../../lib/tenant/index.ts';
import { users } from '../auth/schema.ts';
import { projects } from '../projects/schema.ts';
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

// ---- read side for the viewer (F1e, John) ----------------------------------------------------------------------

/** `at` with microseconds as text: a JS Date keeps milliseconds, and a cursor cut to them would skip rows. */
const atText = sql<string>`to_char(${auditLog.at} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const CURSOR = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const encodeCursor = (at: string, id: string) =>
  Buffer.from(JSON.stringify([at, id])).toString('base64url');

function decodeCursor(raw: string): { at: string; id: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
      const [at, id] = parsed as [string, string];
      if (CURSOR.test(at) && UUID.test(id)) return { at, id };
    }
  } catch {
    // falls through to the same error
  }
  throw new AppError('VALIDATION', { details: { issues: [{ path: 'cursor', code: 'invalid' }] } });
}

/**
 * One page of the audit log, newest first (keyset on (at desc, id desc), so paging stays stable while new rows
 * arrive). Only the super admin reads: the route checks `audit.read`, and the database policy does as well.
 */
export async function listAudit(session: ResolvedSession, q: AuditQuery): Promise<AuditPage> {
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;

  const rows = await withTenant({ userId: session.userId, role: session.role }, (tx) =>
    tx
      .select({
        id: auditLog.id,
        at: auditLog.at,
        atText,
        actorKind: auditLog.actorKind,
        actorId: auditLog.actorId,
        actorName: users.name,
        actorRole: users.role,
        projectId: auditLog.projectId,
        projectName: projects.name,
        action: auditLog.action,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        meta: auditLog.meta,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .leftJoin(projects, eq(projects.id, auditLog.projectId))
      .where(
        and(
          q.userId ? eq(auditLog.actorId, q.userId) : undefined,
          q.action ? eq(auditLog.action, q.action) : undefined,
          q.projectId ? eq(auditLog.projectId, q.projectId) : undefined,
          q.from ? gte(auditLog.at, new Date(q.from)) : undefined,
          q.to ? lte(auditLog.at, new Date(q.to)) : undefined,
          cursor
            ? or(
                sql`${auditLog.at} < ${cursor.at}::timestamptz`,
                and(
                  sql`${auditLog.at} = ${cursor.at}::timestamptz`,
                  sql`${auditLog.id} < ${cursor.id}::uuid`,
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(q.limit + 1),
  );

  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    entries: page.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      actorKind: r.actorKind,
      actorId: r.actorId,
      actorName: r.actorName,
      actorRole: r.actorRole,
      projectId: r.projectId,
      projectName: r.projectName,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      meta: r.meta,
    })),
    nextCursor: rows.length > q.limit && last ? encodeCursor(last.atText, last.id) : null,
  };
}
