import { uuid } from 'drizzle-orm/pg-core';
import { projects } from '../../modules/projects/schema.ts';

// Every tenant table has this column; row-level security keys on it (migration 0002).
export const projectRef = () =>
  uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' });
