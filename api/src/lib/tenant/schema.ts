import { bigserial, index, pgTable, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, tstz } from '../../db/schema/columns.ts';
import { changeKindEnum } from '../../db/schema/enums.ts';
import { projectRef } from '../../db/schema/refs.ts';
import { users } from '../../modules/auth/schema.ts';

// Who belongs to which client: client users only (staff see every project). One client per user.
// Read by every client policy; writes are staff or system only.
export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: projectRef(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('project_members_pair').on(t.projectId, t.userId),
    unique('project_members_one_project').on(t.userId),
  ],
);

// Polling feed behind GET /api/events (CONTRACTS §6).
export const changeFeed = pgTable(
  'change_feed',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    projectId: projectRef(),
    kind: changeKindEnum('kind').notNull(),
    refId: uuid('ref_id').notNull(),
    at: tstz('at').notNull().defaultNow(),
  },
  (t) => [index('change_feed_project_idx').on(t.projectId, t.id)],
);
