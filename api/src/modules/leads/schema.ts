import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tstz, updatedAt } from '../../db/schema/columns.ts';
import { actorKindEnum, leadStatusEnum, sourceEnum } from '../../db/schema/enums.ts';
import { projectRef } from '../../db/schema/refs.ts';
import { users } from '../auth/schema.ts';
import { contacts } from '../contacts/schema.ts';
import { integrations } from '../integrations/hub/schema.ts';
import { pipelineStages } from '../pipeline/schema.ts';

// First versions written by Alex in F1b from CONTRACTS §3; John owns them from here.
export const leads = pgTable(
  'leads',
  {
    id: pk(),
    projectId: projectRef(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    source: sourceEnum('source').notNull(),
    externalId: text('external_id'),
    formId: text('form_id'),
    campaign: text('campaign'),
    answers: jsonb('answers').$type<Record<string, string>>().notNull().default({}),
    attribution: jsonb('attribution').$type<Record<string, string>>().notNull().default({}),
    status: leadStatusEnum('status').notNull().default('new'),
    statusSeq: integer('status_seq').notNull().default(0),
    reason: text('reason'),
    stageId: uuid('stage_id').references(() => pipelineStages.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    isTest: boolean('is_test').notNull().default(false),
    firstReplyAt: tstz('first_reply_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('leads_project_source_external').on(t.projectId, t.source, t.externalId),
    index('leads_project_created_idx').on(t.projectId, t.createdAt),
    index('leads_project_status_idx').on(t.projectId, t.status),
    index('leads_contact_idx').on(t.contactId),
  ],
);

export const leadEvents = pgTable(
  'lead_events',
  {
    id: pk(),
    projectId: projectRef(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    actorKind: actorKindEnum('actor_kind').notNull(),
    actorId: uuid('actor_id'),
    at: tstz('at').notNull().defaultNow(),
  },
  (t) => [index('lead_events_lead_idx').on(t.leadId, t.at)],
);

export const leadForms = pgTable(
  'lead_forms',
  {
    id: pk(),
    projectId: projectRef(),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    externalFormId: text('external_form_id').notNull(),
    name: text('name').notNull(),
    mapping: jsonb('mapping').$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [unique('lead_forms_integration_form').on(t.integrationId, t.externalFormId)],
);

// Internal notes: visible to SHARKX staff only, never to clients.
export const notes = pgTable(
  'notes',
  {
    id: pk(),
    projectId: projectRef(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('notes_lead_idx').on(t.leadId, t.createdAt)],
);

export const qualificationSettings = pgTable(
  'qualification_settings',
  {
    id: pk(),
    projectId: projectRef(),
    mqlDefinition: text('mql_definition').notNull().default(''),
    sqlDefinition: text('sql_definition').notNull().default(''),
    reasons: text('reasons')
      .array()
      .notNull()
      .default(
        sql`ARRAY['No budget','Wrong location','Not interested','Unreachable','Duplicate']::text[]`,
      ),
  },
  (t) => [unique('qualification_settings_project').on(t.projectId)],
);
