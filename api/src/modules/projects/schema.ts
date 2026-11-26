import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { BusinessHoursDay } from '../../contracts/projects.ts';
import { createdAt, pk, updatedAt } from '../../db/schema/columns.ts';
import { users } from '../auth/schema.ts';

/** The F1b shape, still held by rows created before migration 0003; toDailyHours() reads both. */
export type LegacyBusinessHours = { days: number[]; start: string; end: string };
/** Seven per-day windows (CONTRACTS businessHours), the shape every new row gets since 0003. */
export type BusinessHours = BusinessHoursDay[];

/** Mon–Fri 09:00–18:00, Saturday and Sunday closed: the default for a new client (F2b S2). */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
  day,
  open: day <= 5,
  from: '09:00',
  to: '18:00',
}));

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
      .$type<BusinessHours | LegacyBusinessHours>()
      .notNull()
      .default(DEFAULT_BUSINESS_HOURS),
    firstReplyMinutes: integer('first_reply_minutes').notNull().default(15),
    color: text('color'),
    // Round-robin (F4a S3): the manager who got the last lead. The next lead goes to the active manager after them.
    assignCursor: uuid('assign_cursor').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('projects_name_lower_idx').on(sql`lower(${t.name})`)],
);
