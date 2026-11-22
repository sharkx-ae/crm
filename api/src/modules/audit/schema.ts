import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { pk, tstz } from '../../db/schema/columns.ts';
import { actorKindEnum } from '../../db/schema/enums.ts';

// Append-only: app roles get INSERT and SELECT only (migration 0002). No foreign keys, so rows outlive projects.
export const auditLog = pgTable(
  'audit_log',
  {
    id: pk(),
    at: tstz('at').notNull().defaultNow(),
    actorKind: actorKindEnum('actor_kind').notNull(),
    actorId: uuid('actor_id'),
    projectId: uuid('project_id'),
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index('audit_at_idx').on(t.at, t.id),
    index('audit_project_idx').on(t.projectId, t.at),
    index('audit_actor_idx').on(t.actorId, t.at),
    index('audit_action_idx').on(t.action, t.at),
  ],
);
