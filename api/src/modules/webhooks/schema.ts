import { jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { pk, tstz } from '../../db/schema/columns.ts';

// Raw inbound events, stored before processing. project_id is unknown until routing, so this is
// system-role-only (grants), not a tenant-policy table.
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: pk(),
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    projectId: uuid('project_id'),
    payload: jsonb('payload').$type<unknown>().notNull(),
    receivedAt: tstz('received_at').notNull().defaultNow(),
    processedAt: tstz('processed_at'),
    error: text('error'),
  },
  (t) => [unique('webhook_events_provider_external').on(t.provider, t.externalId)],
);
