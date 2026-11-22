import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { expect } from 'vitest';
import * as s from '../../src/db/schema/index.ts';
import { getTestDbUrl } from '../../src/lib/env.ts';
import { emitChange, withSystem } from '../../src/lib/tenant/index.ts';

/** Superuser connection for catalog checks only. Never used to test RLS behaviour. */
export function rawClient(): pg.Client {
  return new pg.Client({ connectionString: getTestDbUrl() });
}

export function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error('expected at least one row');
  return row;
}

const digits = (n: number) => String(Math.floor(10 ** (n - 1) + Math.random() * 9 * 10 ** (n - 1)));

export type SeededProject = {
  projectId: string;
  /** The client user that is a member of this project. */
  clientId: string;
  contactId: string;
  leadId: string;
  stageId: string;
  integrationId: string;
  numberId: string;
  conversationId: string;
};

/**
 * Creates a project with one row in every tenant table, the way the app will: through withSystem.
 * `staffId` gets a notification too, so tests can prove a client reads only its own.
 */
export async function seedProject(clientId: string, staffId: string): Promise<SeededProject> {
  const projectId = randomUUID();
  return withSystem(projectId, async (tx) => {
    await tx.insert(s.projects).values({ id: projectId, name: `Client ${projectId.slice(0, 8)}` });
    await tx.insert(s.projectMembers).values({ projectId, userId: clientId });
    const stage = first(
      await tx
        .insert(s.pipelineStages)
        .values({ projectId, name: 'New', position: 1 })
        .returning({ id: s.pipelineStages.id }),
    );
    const contact = first(
      await tx
        .insert(s.contacts)
        .values({ projectId, name: 'Test Contact', phoneE164: `+9715${digits(8)}` })
        .returning({ id: s.contacts.id }),
    );
    const lead = first(
      await tx
        .insert(s.leads)
        .values({
          projectId,
          contactId: contact.id,
          source: 'website',
          externalId: randomUUID(),
          stageId: stage.id,
        })
        .returning({ id: s.leads.id }),
    );
    await tx
      .insert(s.leadEvents)
      .values({ projectId, leadId: lead.id, kind: 'created', actorKind: 'system' });
    await tx.insert(s.notes).values({ projectId, leadId: lead.id, text: 'internal' });
    await tx.insert(s.tasks).values({ projectId, leadId: lead.id, title: 'Call back' });
    const integration = first(
      await tx
        .insert(s.integrations)
        .values({ projectId, platform: 'meta' })
        .returning({ id: s.integrations.id }),
    );
    await tx.insert(s.leadForms).values({
      projectId,
      integrationId: integration.id,
      externalFormId: randomUUID(),
      name: 'Form',
    });
    await tx
      .insert(s.integrationTokens)
      .values({ projectId, integrationId: integration.id, encValue: 'enc', keyId: 'k1' });
    const number = first(
      await tx
        .insert(s.waNumbers)
        .values({ projectId, phoneE164: `+9714${digits(8)}` })
        .returning({ id: s.waNumbers.id }),
    );
    const conversation = first(
      await tx
        .insert(s.waConversations)
        .values({ projectId, numberId: number.id, contactId: contact.id })
        .returning({ id: s.waConversations.id }),
    );
    await tx.insert(s.waMessages).values({
      projectId,
      conversationId: conversation.id,
      waMessageId: randomUUID(),
      direction: 'in',
      origin: 'customer',
      ts: new Date(),
    });
    await tx.insert(s.qualificationSettings).values({ projectId });
    await tx.insert(s.automationRules).values({ projectId, trigger: 'lead.created' });
    await tx.insert(s.conversionMappings).values({ projectId, status: 'mql' });
    await tx
      .insert(s.conversionEvents)
      .values({ projectId, leadId: lead.id, status: 'mql', statusSeq: 1, platform: 'meta' });
    await tx.insert(s.notifications).values([
      { projectId, userId: clientId, kind: 'new_lead', refId: lead.id },
      { projectId, userId: staffId, kind: 'new_lead', refId: lead.id },
    ]);
    await emitChange(tx, 'lead', projectId, lead.id);
    await emitChange(tx, 'task', projectId, randomUUID());
    return {
      projectId,
      clientId,
      contactId: contact.id,
      leadId: lead.id,
      stageId: stage.id,
      integrationId: integration.id,
      numberId: number.id,
      conversationId: conversation.id,
    };
  });
}

export type World = {
  superAdmin: string;
  manager: string;
  clientA: string; // the only member of project A
  clientB: string; // the only member of project B
  a: SeededProject;
  b: SeededProject;
};

/**
 * The database allows exactly one super admin (users_one_super_admin), so tests share one:
 * created on first use, left active, kept between files. Tests that need another state set it themselves.
 */
export async function ensureSuperAdmin(): Promise<string> {
  return withSystem(null, async (tx) => {
    await tx
      .insert(s.users)
      .values({
        email: 'super-admin@test.local',
        name: 'Super Admin',
        role: 'super_admin',
        status: 'active',
      })
      .onConflictDoNothing();
    const row = first(
      await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.role, 'super_admin')),
    );
    return row.id;
  });
}

export async function seedWorld(): Promise<World> {
  const tag = randomUUID().slice(0, 8);
  const superAdmin = await ensureSuperAdmin();
  const [manager, clientA, clientB] = await withSystem(null, async (tx) => {
    const rows = await tx
      .insert(s.users)
      .values([
        { email: `manager-${tag}@test.local`, name: 'Manager', role: 'manager', status: 'active' },
        { email: `client-a-${tag}@test.local`, name: 'Client A', role: 'client', status: 'active' },
        { email: `client-b-${tag}@test.local`, name: 'Client B', role: 'client', status: 'active' },
      ])
      .returning({ id: s.users.id });
    return rows.map((r) => r.id);
  });
  if (!manager || !clientA || !clientB) throw new Error('seed users failed');
  return {
    superAdmin,
    manager,
    clientA,
    clientB,
    a: await seedProject(clientA, manager),
    b: await seedProject(clientB, manager),
  };
}

/** Asserts a statement is rejected by the database (privilege or row-level security). */
export async function expectDenied(p: Promise<unknown>): Promise<void> {
  const err = (await p.then(
    () => null,
    (e: unknown) => e,
  )) as (Error & { cause?: Error }) | null;
  expect(err, 'expected the database to reject this statement').not.toBeNull();
  expect(`${err?.message} ${err?.cause?.message}`).toMatch(/permission denied|row-level security/i);
}
