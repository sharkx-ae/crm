import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectDenied, seedWorld, type World } from '../../../tests/helpers/db.ts';
import { getPool } from '../../db/index.ts';
import { getContext, runWithContext } from '../../lib/context/index.ts';
import { withSystem, withTenant } from '../../lib/tenant/index.ts';
import { audit } from './index.ts';

let w: World;
beforeAll(async () => {
  w = await seedWorld();
});
afterAll(() => getPool().end());

type Row = {
  actor_kind: string;
  actor_id: string | null;
  project_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  meta: Record<string, unknown>;
};

const rowsFor = (action: string) =>
  withTenant({ userId: w.superAdmin, role: 'super_admin' }, async (tx) => {
    const r = await tx.execute(
      sql`select actor_kind, actor_id, project_id, action, entity, entity_id, meta from audit_log where action = ${action}`,
    );
    return r.rows as Row[];
  });

describe('audit()', () => {
  it('writes one row per call and counts it', async () => {
    const entityId = randomUUID();
    const count = await runWithContext({ requestId: 'r', auditCount: 0 }, async () => {
      await withTenant({ userId: w.manager, role: 'manager' }, (tx) =>
        audit(tx, {
          actor: { kind: 'user', id: w.manager },
          action: 'user.invited',
          projectId: w.a.projectId,
          entity: 'user',
          entityId,
          meta: { role: 'client', reissued: false },
        }),
      );
      return getContext().auditCount;
    });
    expect(count).toBe(1);
    const rows = (await rowsFor('user.invited')).filter((r) => r.entity_id === entityId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_kind: 'user',
      actor_id: w.manager,
      project_id: w.a.projectId,
      entity: 'user',
      meta: { role: 'client', reissued: false },
    });
  });

  it('drops denied keys and masks sensitive values in meta', async () => {
    const entityId = randomUUID();
    await withSystem(null, (tx) =>
      audit(tx, {
        actor: { kind: 'system' },
        action: 'auth.login_failed',
        entity: 'user',
        entityId,
        meta: {
          reason: 'unknown_user',
          password: 'hunter2hunter2',
          phone: '+971501234567',
          email: 'a@b.co',
          note: 'tried a@b.co from +971501234567',
        },
      }),
    );
    const row = (await rowsFor('auth.login_failed')).find((r) => r.entity_id === entityId);
    expect(row?.actor_id).toBeNull();
    expect(row?.meta).toEqual({ reason: 'unknown_user', note: 'tried [email] from [phone]' });
  });

  it('caps oversized meta at 2 KB', async () => {
    const entityId = randomUUID();
    const big = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`field${i}`, 'v'.repeat(400)]),
    );
    await withSystem(null, (tx) =>
      audit(tx, { actor: { kind: 'system' }, action: 'user.invited', entityId, meta: big }),
    );
    const row = (await rowsFor('user.invited')).find((r) => r.entity_id === entityId);
    expect(row?.meta).toEqual({ truncated: true });
  });

  it('refuses a malformed action name', async () => {
    await withSystem(null, async (tx) => {
      await expect(
        audit(tx, { actor: { kind: 'system' }, action: 'Not An Action' }),
      ).rejects.toThrow();
    });
  });

  it('RLS refuses a spoofed actor_id from a web user', async () => {
    await withTenant({ userId: w.manager, role: 'manager' }, async (tx) => {
      await expectDenied(
        audit(tx, { actor: { kind: 'user', id: w.superAdmin }, action: 'user.invited' }),
      );
    });
    await withTenant({ userId: w.clientA, role: 'client' }, async (tx) => {
      await expectDenied(
        audit(tx, {
          actor: { kind: 'client', id: w.clientA },
          action: 'lead.marked',
          projectId: w.b.projectId,
        }),
      );
    });
  });

  it('the row rolls back with the mutation', async () => {
    const entityId = randomUUID();
    await withSystem(null, async (tx) => {
      await audit(tx, { actor: { kind: 'system' }, action: 'user.invited', entityId });
      throw new Error('mutation failed');
    }).catch(() => undefined);
    expect((await rowsFor('user.invited')).filter((r) => r.entity_id === entityId)).toHaveLength(0);
  });
});
