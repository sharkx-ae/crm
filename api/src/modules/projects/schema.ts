import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, updatedAt } from '../../db/schema/columns.ts';
import { users } from '../auth/schema.ts';

export type BusinessHours = { days: number[]; start: string; end: string };

// A project is one client = the tenant. Its own `id` is the tenant key (policy key 'id' in migration 0002).
export const projects = pgTable(
  'projects',
  {
    id: pk(),
    name: text('name').notNull(),
    city: text('city'),
    industry: text('industry'),
    timezone: text('timezone').notNull().default('Asia/Dubai'),
    businessHours: jsonb('business_hours')
      .$type<BusinessHours>()
      .notNull()
      .default({ days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }),
    firstReplyMinutes: integer('first_reply_minutes').notNull().default(15),
    color: text('color'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('projects_name_lower_idx').on(sql`lower(${t.name})`)],
);
