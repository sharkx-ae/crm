// `pnpm db:seed [--reset]` (F4a S5): demo data from the mockup for every screen. Local and staging only.
// Refuses in production, refuses when clients exist unless --reset, never creates a super admin (auth:seed-admin does).
// --reset deletes every client (and, by cascade, its leads, chats and tasks) and the seed's own users (`.test` emails).
// Real staff on staging (any other email) and the super admin are kept. Seeded users that already exist (a run that
// failed half-way, or clients deleted by hand) are updated in place, so a re-run never fails on a duplicate email.
import { parseArgs } from 'node:util';
import { and, eq, like, ne, sql } from 'drizzle-orm';
import { hashPassword } from '../lib/crypto/index.ts';
import { getSeedEnv } from '../lib/env.ts';
import { withSystem } from '../lib/tenant/index.ts';
import { projectMembers } from '../lib/tenant/schema.ts';
import { users } from '../modules/auth/schema.ts';
import { contacts } from '../modules/contacts/schema.ts';
import { integrations } from '../modules/integrations/hub/schema.ts';
import { normalisePhone } from '../modules/leads/phone.ts';
import { leadEvents, leads, qualificationSettings } from '../modules/leads/schema.ts';
import { pipelineStages } from '../modules/pipeline/schema.ts';
import { projects } from '../modules/projects/schema.ts';
import { tasks } from '../modules/tasks/schema.ts';
import { waConversations, waMessages, waNumbers } from '../modules/whatsapp/schema.ts';
import { buildSeed, type SeedPlan } from './seed/build.ts';
import { CLIENTS, DEFINITIONS, integrationsFor, MANAGERS, REASONS, STAGES } from './seed/data.ts';

const MIN = 60_000;

export class SeedRefused extends Error {}

export type SeedResult = { clients: number; leads: number; managers: number; clientUsers: number };

export async function seed(o: {
  appEnv: string;
  password: string;
  reset?: boolean;
  now?: Date;
}): Promise<SeedResult> {
  if (o.appEnv !== 'local' && o.appEnv !== 'staging') {
    throw new SeedRefused(`db:seed runs only when APP_ENV is local or staging (got ${o.appEnv})`);
  }
  const now = o.now ?? new Date();
  const plan = buildSeed(now);

  const existing = await withSystem(null, (tx) => tx.select({ id: projects.id }).from(projects));
  if (existing.length > 0 && !o.reset) {
    throw new SeedRefused(
      `${existing.length} client(s) already exist. Run with --reset to replace them.`,
    );
  }
  if (o.reset) await wipe(existing.map((p) => p.id));

  const pwHash = await hashPassword(o.password);

  // People first (no project context): managers, then one client user per client.
  const managerIds = await withSystem(null, async (tx) => {
    const rows = await tx
      .insert(users)
      .values(
        MANAGERS.map((m) => ({
          email: m.email,
          name: m.name,
          role: 'manager' as const,
          status: m.status,
          pwHash: m.status === 'active' ? pwHash : null,
        })),
      )
      .onConflictDoUpdate({ target: users.email, set: seededUserColumns })
      .returning({ id: users.id, email: users.email });
    // Same order as MANAGERS, active ones only: the round-robin indexes of buildSeed point into this list.
    return MANAGERS.filter((m) => m.status === 'active').map(
      (m) => rows.find((r) => r.email === m.email)?.id as string,
    );
  });

  let leadCount = 0;
  for (const rows of plan.clients) {
    leadCount += await seedClient(rows, managerIds, pwHash, now);
  }
  return {
    clients: plan.clients.length,
    leads: leadCount,
    managers: MANAGERS.length,
    clientUsers: CLIENTS.length,
  };
}

/** On a re-run, a seeded user that already exists takes the seed's values again (name, role, status, password). */
const seededUserColumns = {
  name: sql`excluded.name`,
  role: sql`excluded.role`,
  status: sql`excluded.status`,
  pwHash: sql`excluded.pw_hash`,
};

async function wipe(projectIds: string[]): Promise<void> {
  for (const id of projectIds) {
    await withSystem(id, (tx) => tx.delete(projects).where(eq(projects.id, id)));
  }
  // Only the seed's own people: every seeded email is on a `.test` domain (seed/data.ts).
  await withSystem(null, (tx) =>
    tx.delete(users).where(and(ne(users.role, 'super_admin'), like(users.email, '%.test'))),
  );
}

async function seedClient(
  { client, leads: plannedLeads, tasks: plannedTasks }: SeedPlan['clients'][number],
  managerIds: string[],
  pwHash: string,
  now: Date,
): Promise<number> {
  const projectId = crypto.randomUUID();
  const kind = client.industry.startsWith('Real estate')
    ? 'realEstate'
    : client.industry.startsWith('Fitness')
      ? 'fitness'
      : 'aesthetic';

  return withSystem(projectId, async (tx) => {
    await tx.insert(projects).values({
      id: projectId,
      name: client.name,
      city: client.city,
      industry: client.industry,
      timezone: client.timezone,
      color: client.color,
      createdAt: new Date(now.getTime() - 60 * 24 * 60 * MIN),
    });
    const stages = await tx
      .insert(pipelineStages)
      .values(STAGES.map((name, i) => ({ projectId, name, position: i + 1 })))
      .returning({ id: pipelineStages.id, name: pipelineStages.name });
    const stageId = (name: string) => stages.find((s) => s.name === name)?.id ?? null;

    await tx.insert(qualificationSettings).values({
      projectId,
      mqlDefinition: DEFINITIONS[kind].mql,
      sqlDefinition: DEFINITIONS[kind].sql,
      reasons: REASONS,
    });
    await tx.insert(integrations).values(
      integrationsFor(client.key).map((i) => ({
        projectId,
        platform: i.platform,
        status: i.status,
        mode: i.mode,
        accountLabel:
          i.status === 'not_connected'
            ? null
            : i.platform === 'whatsapp'
              ? `${client.numbers.length} number(s)`
              : client.name,
        lastDataAt:
          i.minutesSinceData == null ? null : new Date(now.getTime() - i.minutesSinceData * MIN),
        note: i.note ?? null,
      })),
    );
    const numbers = await tx
      .insert(waNumbers)
      .values(
        client.numbers.map((n) => {
          const p = normalisePhone(n.phone, client.city);
          const phoneE164 = p?.valid ? p.e164 : n.phone;
          const digits = phoneE164.replace(/\D/g, '');
          return {
            projectId,
            phoneE164,
            label: n.label,
            // Demo-only Meta ids, derived from the (unique) number so a re-seed is repeatable.
            phoneNumberId: `7${digits}`,
            wabaId: `8${digits}`,
            syncState: 'done' as const,
            syncPct: 100,
          };
        }),
      )
      .returning({ id: waNumbers.id });

    const [clientUser] = await tx
      .insert(users)
      .values({
        email: client.user.email,
        name: client.user.name,
        role: 'client',
        status: 'active',
        pwHash,
      })
      .onConflictDoUpdate({ target: users.email, set: seededUserColumns })
      .returning({ id: users.id });
    await tx.insert(projectMembers).values({ projectId, userId: clientUser?.id as string });

    const leadIds: string[] = [];
    for (const [i, l] of plannedLeads.entries()) {
      const [contact] = await tx
        .insert(contacts)
        .values({
          projectId,
          name: l.name,
          phoneE164: l.phoneE164,
          email: l.email,
          createdAt: l.createdAt,
        })
        .returning({ id: contacts.id });
      const ownerId = l.ownerIndex == null ? null : (managerIds[l.ownerIndex] ?? null);
      const stage =
        l.status === 'sql'
          ? 'Qualified'
          : l.status === 'mql'
            ? 'Contacted'
            : l.status === 'not_qualified'
              ? 'Lost'
              : 'New';
      const [lead] = await tx
        .insert(leads)
        .values({
          projectId,
          contactId: contact?.id as string,
          source: l.source,
          externalId: `seed-${client.key}-${i}`,
          campaign: l.campaign,
          answers: l.answers,
          status: l.status,
          statusSeq: l.status === 'new' ? 0 : 1,
          reason: l.reason,
          stageId: stageId(stage),
          ownerId,
          isTest: l.isTest,
          firstReplyAt: l.firstReplyAt,
          createdAt: l.createdAt,
        })
        .returning({ id: leads.id });
      const leadId = lead?.id as string;
      leadIds.push(leadId);

      await tx.insert(leadEvents).values([
        {
          projectId,
          leadId,
          kind: 'created',
          data: { source: l.source, campaign: l.campaign, ...(l.isTest ? { isTest: true } : {}) },
          actorKind: 'system',
          at: l.createdAt,
        },
        ...(ownerId
          ? [
              {
                projectId,
                leadId,
                kind: 'assigned',
                data: { ownerId, via: 'round_robin' },
                actorKind: 'system' as const,
                at: l.createdAt,
              },
            ]
          : []),
        ...(l.markedAt
          ? [
              {
                projectId,
                leadId,
                kind: 'status_changed',
                data: { from: 'new', to: l.status, ...(l.reason ? { reason: l.reason } : {}) },
                actorKind: 'client' as const,
                actorId: clientUser?.id ?? null,
                at: l.markedAt,
              },
            ]
          : []),
      ]);

      if (l.chat.length) {
        const [conv] = await tx
          .insert(waConversations)
          .values({
            projectId,
            numberId: numbers[0]?.id as string,
            contactId: contact?.id as string,
            lastMessageAt: l.chat.at(-1)?.ts ?? null,
            createdAt: l.createdAt,
          })
          .returning({ id: waConversations.id });
        await tx.insert(waMessages).values(
          l.chat.map((m, k) => ({
            projectId,
            conversationId: conv?.id as string,
            waMessageId: `seed-${client.key}-${i}-${k}`,
            direction: m.dir,
            origin: m.dir === 'in' ? ('customer' as const) : ('app' as const),
            text: m.text,
            ts: m.ts,
          })),
        );
      }
    }

    if (plannedTasks.length) {
      await tx.insert(tasks).values(
        plannedTasks.map((k) => {
          const l = plannedLeads[k.leadIndex];
          return {
            projectId,
            leadId: leadIds[k.leadIndex] as string,
            assigneeId: l?.ownerIndex == null ? null : (managerIds[l.ownerIndex] ?? null),
            title: k.title,
            dueAt: k.dueAt,
            doneAt: k.done ? k.dueAt : null,
          };
        }),
      );
    }
    return plannedLeads.length;
  });
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { reset: { type: 'boolean', default: false } } });
  try {
    const env = getSeedEnv();
    const r = await seed({ appEnv: env.APP_ENV, password: env.SEED_PASSWORD, reset: values.reset });
    console.log(
      `Seeded ${r.clients} clients, ${r.leads} leads, ${r.managers} managers and ${r.clientUsers} client users. Sign in with SEED_PASSWORD.`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'seed failed');
    process.exitCode = 1;
  } finally {
    const { getPool } = await import('./index.ts');
    await getPool().end();
  }
}
