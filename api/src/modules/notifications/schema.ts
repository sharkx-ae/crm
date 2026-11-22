import { index, pgTable, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tstz } from '../../db/schema/columns.ts';
import { notificationKindEnum } from '../../db/schema/enums.ts';
import { projectRef } from '../../db/schema/refs.ts';
import { users } from '../auth/schema.ts';

export const notifications = pgTable(
  'notifications',
  {
    id: pk(),
    projectId: projectRef(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: notificationKindEnum('kind').notNull(),
    refId: uuid('ref_id'),
    readAt: tstz('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_unread_idx').on(t.userId, t.readAt)],
);
