import { index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, pk } from '../../db/schema/columns.ts';
import { projectRef } from '../../db/schema/refs.ts';

export const pipelineStages = pgTable(
  'pipeline_stages',
  {
    id: pk(),
    projectId: projectRef(),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('pipeline_stages_project_idx').on(t.projectId, t.position)],
);
