import { index, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, pk } from '../../db/schema/columns.ts';

// Unexpected errors; never store personal data or tokens in `context`.
export const errorLog = pgTable(
  'error_log',
  {
    id: pk(),
    fingerprint: text('fingerprint').notNull(),
    message: text('message').notNull(),
    context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('error_log_fingerprint_idx').on(t.fingerprint, t.createdAt)],
);
