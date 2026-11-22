import { boolean, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, pk } from '../../db/schema/columns.ts';
import { projectRef } from '../../db/schema/refs.ts';

export const automationRules = pgTable('automation_rules', {
  id: pk(),
  projectId: projectRef(),
  trigger: text('trigger').notNull(),
  conditions: jsonb('conditions').$type<Record<string, unknown>>().notNull().default({}),
  actions: jsonb('actions').$type<Record<string, unknown>[]>().notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  runCount: integer('run_count').notNull().default(0),
  createdAt: createdAt(),
});
