import { boolean, index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tstz } from '../../db/schema/columns.ts';
import {
  conversionPlatformEnum,
  conversionStateEnum,
  leadStatusEnum,
} from '../../db/schema/enums.ts';
import { projectRef } from '../../db/schema/refs.ts';
import { leads } from '../leads/schema.ts';

export const conversionMappings = pgTable(
  'conversion_mappings',
  {
    id: pk(),
    projectId: projectRef(),
    status: leadStatusEnum('status').notNull(),
    metaEvent: text('meta_event'),
    googleEvent: text('google_event'),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => [unique('conversion_mappings_project_status').on(t.projectId, t.status)],
);

// `id` doubles as Meta's event_id, so a resend is deduplicated by the platform too.
export const conversionEvents = pgTable(
  'conversion_events',
  {
    id: pk(),
    projectId: projectRef(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    status: leadStatusEnum('status').notNull(),
    statusSeq: integer('status_seq').notNull(),
    platform: conversionPlatformEnum('platform').notNull(),
    state: conversionStateEnum('state').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    sentAt: tstz('sent_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('conversion_events_lead_seq_platform').on(t.leadId, t.statusSeq, t.platform),
    index('conversion_events_state_idx').on(t.state, t.createdAt),
  ],
);
