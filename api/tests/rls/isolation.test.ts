import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb, getPool } from '../../src/db/index.ts';
import * as s from '../../src/db/schema/index.ts';
import { type Tx, withSystem, withTenant } from '../../src/lib/tenant/index.ts';
import { CLIENT_ACCESS } from '../helpers/access.ts';
import { expectDenied, type SeededProject, seedWorld, type World } from '../helpers/db.ts';

let w: World;
beforeAll(async () => {
  w = await seedWorld();
});
afterAll(() => getPool().end());

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
type Table = keyof typeof CLIENT_ACCESS;
type Op = 'select' | 'insert' | 'update' | 'delete';
type Target = 'a' | 'b';

const as = (userId: string, role: 'super_admin' | 'manager' | 'client'): Run => {
  return (fn) => withTenant({ userId, role }, fn);
};
// A role switch with nothing set: the state a pooled connection would be in without context.
const bare = (role: 'app_user' | 'app_system'): Run => {
  return (fn) =>
    getDb().transaction(async (tx) => {
      await tx.execute(sql.raw(`set local role ${role}`));
      return fn(tx);
    });
};

type Actor = {
  run: Run;
  /** Whether `op` on `table` is allowed against project `target`. */
  allowed: (table: Table, op: Op, target: Target) => boolean;
  /** The app_user role has no privilege on integration_tokens at all: every statement is a privilege error. */
  noGrant?: (table: Table) => boolean;
};

const staff = (run: Run): Actor => ({
  run,
  allowed: () => true,
  noGrant: (t) => t === 'integration_tokens',
});
const client = (userId: () => string, own: Target): Actor => ({
  run: (fn) => as(userId(), 'client')(fn),
  allowed: (t, op, target) => {
    if (target !== own) return false;
    const access = CLIENT_ACCESS[t];
    if (op === 'select') return access !== 'none';
    if (op === 'delete') return false;
    return access === 'write';
  },
  noGrant: (t) => t === 'integration_tokens',
});
const system = (project: () => string | null): Actor => ({
  run: (fn) => withSystem(project(), fn),
  allowed: (t, op, target) => {
    if (op === 'select' && t === 'projects') return true; // projects_list: cron loops
    const p = project();
    return p !== null && p === (target === 'a' ? w.a.projectId : w.b.projectId);
  },
});
const nobody = (run: Run, appUser: boolean): Actor => ({
  run,
  allowed: () => false,
  noGrant: appUser ? (t) => t === 'integration_tokens' : undefined,
});

const actorNames = [
  'superAdmin',
  'manager',
  'clientA',
  'clientB',
  'systemA',
  'systemB',
  'systemNull',
  'stranger',
  'noContextUser',
  'noContextSystem',
] as const;

function actorOf(name: (typeof actorNames)[number]): Actor {
  switch (name) {
    case 'superAdmin':
      return staff(as(w.superAdmin, 'super_admin'));
    case 'manager':
      return staff(as(w.manager, 'manager'));
    case 'clientA':
      return client(() => w.clientA, 'a');
    case 'clientB':
      return client(() => w.clientB, 'b');
    case 'systemA':
      return system(() => w.a.projectId);
    case 'systemB':
      return system(() => w.b.projectId);
    case 'systemNull':
      return system(() => null);
    case 'stranger': // a client with no membership
      return nobody(as(randomUUID(), 'client'), true);
    case 'noContextUser':
      return nobody(bare('app_user'), true);
    case 'noContextSystem': // like system(null): nothing but the projects list
      return system(() => null);
  }
}

const target = (t: Target): SeededProject => (t === 'a' ? w.a : w.b);
const keyOf = (t: Table) => (t === 'projects' ? 'id' : 'project_id');

// One valid row for the given project; ON CONFLICT DO NOTHING so a unique key never masks a policy result
// (the INSERT policy is checked before conflict handling).
const inserts: Record<Table, (tx: Tx, p: SeededProject) => Promise<unknown>> = {
  projects: (tx, p) =>
    tx
      .insert(s.projects)
      .values({ id: p.projectId, name: `x-${randomUUID()}` })
      .onConflictDoNothing(),
  pipeline_stages: (tx, p) =>
    tx
      .insert(s.pipelineStages)
      .values({
        projectId: p.projectId,
        name: 'x',
        position: 1000 + Math.floor(Math.random() * 1e6),
      })
      .onConflictDoNothing(),
  contacts: (tx, p) =>
    tx
      .insert(s.contacts)
      .values({
        projectId: p.projectId,
        name: 'x',
        phoneE164: `+9715${Math.floor(1e7 + Math.random() * 9e7)}`,
      })
      .onConflictDoNothing(),
  leads: (tx, p) =>
    tx
      .insert(s.leads)
      .values({ projectId: p.projectId, contactId: p.contactId, source: 'website' })
      .onConflictDoNothing(),
  lead_events: (tx, p) =>
    tx
      .insert(s.leadEvents)
      .values({ projectId: p.projectId, leadId: p.leadId, kind: 'x', actorKind: 'system' })
      .onConflictDoNothing(),
  lead_forms: (tx, p) =>
    tx
      .insert(s.leadForms)
      .values({
        projectId: p.projectId,
        integrationId: p.integrationId,
        externalFormId: randomUUID(),
        name: 'x',
      })
      .onConflictDoNothing(),
  notes: (tx, p) =>
    tx
      .insert(s.notes)
      .values({ projectId: p.projectId, leadId: p.leadId, text: 'x' })
      .onConflictDoNothing(),
  tasks: (tx, p) =>
    tx
      .insert(s.tasks)
      .values({ projectId: p.projectId, leadId: p.leadId, title: 'x' })
      .onConflictDoNothing(),
  qualification_settings: (tx, p) =>
    tx.insert(s.qualificationSettings).values({ projectId: p.projectId }).onConflictDoNothing(),
  automation_rules: (tx, p) =>
    tx
      .insert(s.automationRules)
      .values({ projectId: p.projectId, trigger: 'lead.created' })
      .onConflictDoNothing(),
  integrations: (tx, p) =>
    tx
      .insert(s.integrations)
      .values({ projectId: p.projectId, platform: 'google' })
      .onConflictDoNothing(),
  integration_tokens: (tx, p) =>
    tx
      .insert(s.integrationTokens)
      .values({ projectId: p.projectId, integrationId: p.integrationId, encValue: 'x', keyId: 'k' })
      .onConflictDoNothing(),
  wa_numbers: (tx, p) =>
    tx
      .insert(s.waNumbers)
      .values({
        projectId: p.projectId,
        phoneE164: `+9714${Math.floor(1e7 + Math.random() * 9e7)}`,
      })
      .onConflictDoNothing(),
  wa_conversations: (tx, p) =>
    tx
      .insert(s.waConversations)
      .values({ projectId: p.projectId, numberId: p.numberId, contactId: p.contactId })
      .onConflictDoNothing(),
  wa_messages: (tx, p) =>
    tx
      .insert(s.waMessages)
      .values({
        projectId: p.projectId,
        conversationId: p.conversationId,
        waMessageId: randomUUID(),
        direction: 'in',
        origin: 'customer',
        ts: new Date(),
      })
      .onConflictDoNothing(),
  conversion_mappings: (tx, p) =>
    tx
      .insert(s.conversionMappings)
      .values({ projectId: p.projectId, status: 'sql' })
      .onConflictDoNothing(),
  conversion_events: (tx, p) =>
    tx
      .insert(s.conversionEvents)
      .values({
        projectId: p.projectId,
        leadId: p.leadId,
        status: 'sql',
        statusSeq: 2,
        platform: 'google',
      })
      .onConflictDoNothing(),
  change_feed: (tx, p) =>
    tx.insert(s.changeFeed).values({ projectId: p.projectId, kind: 'lead', refId: randomUUID() }),
  notifications: (tx, p) =>
    tx
      .insert(s.notifications)
      .values({ projectId: p.projectId, userId: p.clientId, kind: 'new_lead' })
      .onConflictDoNothing(),
};

class Rollback extends Error {
  value: unknown;
  constructor(value: unknown) {
    super('rollback');
    this.value = value;
  }
}
/** Runs `fn` as the actor and rolls the transaction back, so cases never see each other's writes. */
async function dry<T>(run: Run, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    await run(async (tx) => {
      throw new Rollback(await fn(tx));
    });
  } catch (e) {
    if (e instanceof Rollback) return e.value as T;
    throw e;
  }
  throw new Error('unreachable');
}

const countOf = (tx: Tx, t: Table, id: string) =>
  tx
    .execute(
      sql`select count(*)::int as n from ${sql.identifier(t)} where ${sql.identifier(keyOf(t))} = ${id}`,
    )
    .then((r) => Number((r.rows[0] as { n: number }).n));
const updateCount = (tx: Tx, t: Table, id: string) =>
  tx
    .execute(
      sql`with u as (update ${sql.identifier(t)} set ${sql.identifier(keyOf(t))} = ${sql.identifier(keyOf(t))}
                     where ${sql.identifier(keyOf(t))} = ${id} returning 1)
          select count(*)::int as n from u`,
    )
    .then((r) => Number((r.rows[0] as { n: number }).n));
const deleteCount = (tx: Tx, t: Table, id: string) =>
  tx
    .execute(
      sql`with d as (delete from ${sql.identifier(t)} where ${sql.identifier(keyOf(t))} = ${id} returning 1)
          select count(*)::int as n from d`,
    )
    .then((r) => Number((r.rows[0] as { n: number }).n));

async function check(actor: Actor, t: Table, op: Op, tg: Target): Promise<void> {
  const p = target(tg);
  const label = `${t} ${op} on project ${tg.toUpperCase()}`;
  const ok = actor.allowed(t, op, tg);

  if (actor.noGrant?.(t)) {
    const stmt =
      op === 'select'
        ? dry(actor.run, (tx) => countOf(tx, t, p.projectId))
        : op === 'insert'
          ? dry(actor.run, (tx) => inserts[t](tx, p))
          : op === 'update'
            ? dry(actor.run, (tx) => updateCount(tx, t, p.projectId))
            : dry(actor.run, (tx) => deleteCount(tx, t, p.projectId));
    await expectDenied(stmt);
    return;
  }

  if (op === 'insert') {
    const run = dry(actor.run, (tx) => inserts[t](tx, p));
    if (ok) await expect(run, label).resolves.not.toThrow();
    else await expectDenied(run);
    return;
  }
  const n = await dry(actor.run, (tx) =>
    op === 'select'
      ? countOf(tx, t, p.projectId)
      : op === 'update'
        ? updateCount(tx, t, p.projectId)
        : deleteCount(tx, t, p.projectId),
  );
  if (ok) expect(n, label).toBeGreaterThan(0);
  else expect(n, label).toBe(0);
}

describe('role × table × operation matrix (the 19 registered tables)', () => {
  const tables = Object.keys(CLIENT_ACCESS) as Table[];
  describe.each(actorNames)('%s', (name) => {
    it.each(tables)('%s', async (t) => {
      const actor = actorOf(name);
      for (const tg of ['a', 'b'] as const) {
        for (const op of ['select', 'insert', 'update', 'delete'] as const) {
          await check(actor, t, op, tg);
        }
      }
    });
  });
});

describe('what a client never sees', () => {
  const STAFF_ONLY = [
    'notes',
    'tasks',
    'lead_events',
    'automation_rules',
    'conversion_mappings',
    'conversion_events',
    'pipeline_stages',
  ] as const;

  it.each(STAFF_ONLY)('client A reads zero %s rows of its own project', async (t) => {
    await withTenant({ userId: w.clientA, role: 'client' }, async (tx) => {
      expect(await countOf(tx, t, w.a.projectId)).toBe(0);
    });
  });

  it('staff see the same tables', async () => {
    await withTenant({ userId: w.manager, role: 'manager' }, async (tx) => {
      for (const t of STAFF_ONLY) expect(await countOf(tx, t, w.a.projectId), t).toBeGreaterThan(0);
    });
  });

  it('change_feed: a client never sees task rows', async () => {
    const kinds = async (userId: string, role: 'client' | 'manager') =>
      withTenant({ userId, role }, async (tx) => {
        const r = await tx.execute(
          sql`select distinct kind from change_feed where project_id = ${w.a.projectId}`,
        );
        return (r.rows as { kind: string }[]).map((x) => x.kind).sort();
      });
    expect(await kinds(w.clientA, 'client')).toEqual(['lead']);
    expect(await kinds(w.manager, 'manager')).toEqual(['lead', 'task']);
  });

  it('notifications: a client sees only its own', async () => {
    await withTenant({ userId: w.clientA, role: 'client' }, async (tx) => {
      const rows = await tx.select().from(s.notifications);
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([w.clientA]));
    });
    await withTenant({ userId: w.manager, role: 'manager' }, async (tx) => {
      const rows = await tx.select().from(s.notifications);
      expect(new Set(rows.map((r) => r.userId)).size).toBeGreaterThan(1);
    });
  });

  it('a client cannot write a notification for someone else, or mark a staff notification read', async () => {
    await withTenant({ userId: w.clientA, role: 'client' }, async (tx) => {
      await expectDenied(
        tx
          .insert(s.notifications)
          .values({ projectId: w.a.projectId, userId: w.manager, kind: 'new_lead' }),
      );
    });
    const n = await dry(as(w.clientA, 'client'), (tx) =>
      tx
        .execute(
          sql`with u as (update notifications set read_at = now() where user_id = ${w.manager} returning 1) select count(*)::int as n from u`,
        )
        .then((r) => Number((r.rows[0] as { n: number }).n)),
    );
    expect(n).toBe(0);
  });
});

describe('project_members', () => {
  it('a client sees only its own membership', async () => {
    const rows = await withTenant({ userId: w.clientA, role: 'client' }, (tx) =>
      tx.select().from(s.projectMembers),
    );
    expect(rows.map((r) => r.userId)).toEqual([w.clientA]);
  });

  it('a client cannot add itself anywhere', async () => {
    await withTenant({ userId: w.clientA, role: 'client' }, async (tx) => {
      await expectDenied(
        tx.insert(s.projectMembers).values({ projectId: w.b.projectId, userId: w.clientA }),
      );
    });
  });

  it('system(null) reads every membership (session resolution); system(A) writes only to A', async () => {
    const all = await withSystem(null, (tx) => tx.select().from(s.projectMembers));
    expect(all.map((r) => r.userId)).toEqual(expect.arrayContaining([w.clientA, w.clientB]));
    await withSystem(w.a.projectId, async (tx) => {
      await expectDenied(
        tx.insert(s.projectMembers).values({ projectId: w.b.projectId, userId: randomUUID() }),
      );
    });
  });

  it('a user belongs to one client only', async () => {
    await withSystem(w.b.projectId, async (tx) => {
      await expect(
        tx.insert(s.projectMembers).values({ projectId: w.b.projectId, userId: w.clientA }),
      ).rejects.toThrow();
    });
  });
});

describe('audit_log', () => {
  const row = (projectId: string | null, actorId: string) => ({
    actorKind: 'user' as const,
    actorId,
    projectId,
    action: 'test.row',
  });

  beforeAll(async () => {
    await withSystem(w.a.projectId, (tx) =>
      tx.insert(s.auditLog).values(row(w.a.projectId, w.manager)),
    );
  });

  it('only the super admin reads (system reads its own project)', async () => {
    const countAs = (run: Run) =>
      run((tx) => tx.select().from(s.auditLog)).then(
        (r) => r.filter((x) => x.action === 'test.row').length,
      );
    expect(await countAs(as(w.superAdmin, 'super_admin'))).toBeGreaterThan(0);
    expect(await countAs(as(w.manager, 'manager'))).toBe(0);
    expect(await countAs(as(w.clientA, 'client'))).toBe(0);
    expect(await countAs((fn) => withSystem(w.a.projectId, fn))).toBeGreaterThan(0);
    expect(await countAs((fn) => withSystem(w.b.projectId, fn))).toBe(0);
    expect(await countAs((fn) => withSystem(null, fn))).toBe(0);
  });

  it('a web user cannot write an audit row in someone else’s name', async () => {
    await withTenant({ userId: w.clientA, role: 'client' }, async (tx) => {
      await expectDenied(tx.insert(s.auditLog).values(row(w.a.projectId, w.manager)));
    });
    await withTenant({ userId: w.manager, role: 'manager' }, async (tx) => {
      await expectDenied(tx.insert(s.auditLog).values(row(null, w.superAdmin)));
    });
  });

  it('a web user writes its own rows, a client only inside its project', async () => {
    await dry(as(w.clientA, 'client'), (tx) =>
      tx.insert(s.auditLog).values(row(w.a.projectId, w.clientA)),
    );
    await dry(as(w.clientA, 'client'), (tx) => tx.insert(s.auditLog).values(row(null, w.clientA)));
    await dry(as(w.manager, 'manager'), (tx) =>
      tx.insert(s.auditLog).values(row(w.b.projectId, w.manager)),
    );
    await withTenant({ userId: w.clientA, role: 'client' }, async (tx) => {
      await expectDenied(tx.insert(s.auditLog).values(row(w.b.projectId, w.clientA)));
    });
  });

  it('the system role cannot write into another project', async () => {
    await withSystem(w.a.projectId, async (tx) => {
      await expectDenied(tx.insert(s.auditLog).values(row(w.b.projectId, w.manager)));
    });
  });

  it('nobody can update or delete', async () => {
    for (const run of [
      as(w.superAdmin, 'super_admin'),
      (fn: Parameters<Run>[0]) => withSystem(null, fn),
    ] as Run[]) {
      await expectDenied(run((tx) => tx.execute(sql`update audit_log set action = 'x'`)));
      await expectDenied(run((tx) => tx.execute(sql`delete from audit_log`)));
    }
  });
});

describe('users', () => {
  it('a client sees only itself; staff see everyone', async () => {
    const ids = (run: Run) =>
      run((tx) => tx.execute(sql`select id from users`)).then((r) =>
        (r.rows as { id: string }[]).map((x) => x.id),
      );
    expect(await ids(as(w.clientA, 'client'))).toEqual([w.clientA]);
    expect(await ids(as(w.manager, 'manager'))).toEqual(
      expect.arrayContaining([w.clientA, w.clientB, w.manager, w.superAdmin]),
    );
  });

  it('app_user cannot read pw_hash, nor write users', async () => {
    for (const actor of [as(w.clientA, 'client'), as(w.superAdmin, 'super_admin')]) {
      await expectDenied(actor((tx) => tx.execute(sql`select pw_hash from users`)));
      await expectDenied(actor((tx) => tx.execute(sql`select * from users`)));
      await expectDenied(actor((tx) => tx.execute(sql`update users set name = 'x'`)));
      await expectDenied(actor((tx) => tx.execute(sql`delete from users`)));
    }
  });

  it('the system role reads and writes users (auth lives there)', async () => {
    const rows = await withSystem(null, (tx) => tx.select({ id: s.users.id }).from(s.users));
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  it('there is only one super admin', async () => {
    await withSystem(null, async (tx) => {
      await expect(
        tx.insert(s.users).values({
          email: `second-${randomUUID()}@test.local`,
          name: 'Second',
          role: 'super_admin',
        }),
      ).rejects.toThrow();
    });
  });
});

describe('grants: secrets are unreadable by app_user', () => {
  it.each([
    'sessions',
    'auth_tokens',
    'rate_limits',
    'error_log',
    'webhook_events',
    'integration_tokens',
  ])('%s', async (t) => {
    await expectDenied(
      withTenant({ userId: w.superAdmin, role: 'super_admin' }, (tx) =>
        tx.execute(sql`select 1 from ${sql.identifier(t)}`),
      ),
    );
  });
});

describe('no context means no rows, never an error', () => {
  it('app_user and app_system with nothing set see no tenant rows', async () => {
    for (const run of [bare('app_user'), bare('app_system')]) {
      await run(async (tx) => {
        expect(await tx.select().from(s.leads)).toEqual([]);
        expect(await tx.select().from(s.contacts)).toEqual([]);
      });
    }
  });

  it('a client with an unknown id sees nothing', async () => {
    await withTenant({ userId: randomUUID(), role: 'client' }, async (tx) => {
      expect(await tx.select().from(s.projects)).toEqual([]);
      expect(await tx.select().from(s.leads)).toEqual([]);
    });
  });

  it('withTenant rejects an unknown role', async () => {
    await expect(
      withTenant({ userId: randomUUID(), role: 'agent' as never }, async () => 1),
    ).rejects.toThrow();
  });
});

describe('the pool', () => {
  it('concurrent transactions with different actors never cross', async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => {
        const mine = i % 2 === 0 ? { id: w.clientA, p: w.a } : { id: w.clientB, p: w.b };
        return withTenant({ userId: mine.id, role: 'client' }, async (tx) => {
          await tx.execute(sql`select pg_sleep(0.01)`);
          const rows = await tx.select({ projectId: s.leads.projectId }).from(s.leads);
          return { expected: mine.p.projectId, seen: new Set(rows.map((r) => r.projectId)) };
        });
      }),
    );
    for (const r of results) expect(r.seen).toEqual(new Set([r.expected]));
  });

  it('a failed transaction leaves no role or context on the connection', async () => {
    await Promise.all(
      Array.from({ length: 12 }, () =>
        withTenant({ userId: w.clientA, role: 'client' }, async () => {
          throw new Error('boom');
        }).catch(() => undefined),
      ),
    );
    const probes = await Promise.all(
      Array.from({ length: 12 }, () =>
        getPool().query<{ u: string; id: string | null; role: string | null }>(
          `select current_user as u, nullif(current_setting('app.user_id', true), '') as id,
                  nullif(current_setting('app.role', true), '') as role`,
        ),
      ),
    );
    for (const { rows } of probes) {
      expect(rows[0]?.u).not.toMatch(/^app_/);
      expect(rows[0]?.id).toBeNull();
      expect(rows[0]?.role).toBeNull();
    }
  });
});
