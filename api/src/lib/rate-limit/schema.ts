import { index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { tstz } from '../../db/schema/columns.ts';

export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: tstz('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index('rate_limits_window_idx').on(t.windowStart),
  ],
);
