import { timestamp, uuid } from 'drizzle-orm/pg-core';

// Column helpers shared by every module's schema.ts.
export const pk = () => uuid('id').primaryKey().defaultRandom();
export const tstz = (name: string) => timestamp(name, { withTimezone: true });
export const createdAt = () => tstz('created_at').notNull().defaultNow();
export const updatedAt = () =>
  tstz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
