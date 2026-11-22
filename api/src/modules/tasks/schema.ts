import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tstz } from '../../db/schema/columns.ts';
import { projectRef } from '../../db/schema/refs.ts';
import { users } from '../auth/schema.ts';
import { leads } from '../leads/schema.ts';

export const tasks = pgTable(
  'tasks',
  {
    id: pk(),
    projectId: projectRef(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    dueAt: tstz('due_at'),
    doneAt: tstz('done_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('tasks_assignee_due_idx').on(t.assigneeId, t.dueAt),
    index('tasks_project_idx').on(t.projectId),
  ],
);
