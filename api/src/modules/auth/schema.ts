import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, tstz, updatedAt } from '../../db/schema/columns.ts';
import {
  authTokenKindEnum,
  localeEnum,
  roleEnum,
  sessionStageEnum,
  userStatusEnum,
} from '../../db/schema/enums.ts';

// The single super admin is enforced by `users_one_super_admin` (unique on ((1)) where role = 'super_admin'),
// hand-written in migration 0002 because drizzle cannot declare an expression-only partial index.
export const users = pgTable(
  'users',
  {
    id: pk(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    role: roleEnum('role').notNull(),
    pwHash: text('pw_hash'),
    locale: localeEnum('locale').notNull().default('en'),
    status: userStatusEnum('status').notNull().default('invited'),
    invitedBy: uuid('invited_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('users_email_lower', sql`${t.email} = lower(${t.email})`)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: pk(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stage: sessionStageEnum('stage').notNull().default('pending_2fa'),
    idleExpiresAt: tstz('idle_expires_at').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

// `used_at` is set for every terminal state except expiry (used, superseded, exhausted, revoked),
// so the partial unique index frees the slot: one live token per user and kind.
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: authTokenKindEnum('kind').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    expiresAt: tstz('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    usedAt: tstz('used_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('auth_tokens_one_live').on(t.userId, t.kind).where(sql`${t.usedAt} is null`),
    index('auth_tokens_session_idx').on(t.sessionId),
    index('auth_tokens_expires_idx').on(t.expiresAt),
    check(
      'auth_tokens_code_session',
      sql`(${t.kind} = 'email_code') = (${t.sessionId} is not null)`,
    ),
  ],
);

// A browser the person chose to trust at the code step: it skips the emailed code (never the password) while valid.
// Only the sha256 of the 256-bit cookie token is stored. System-only by grants, like `sessions`.
export const trustedDevices = pgTable(
  'trusted_devices',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    lastUsedAt: tstz('last_used_at').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('trusted_devices_user_idx').on(t.userId),
    index('trusted_devices_expires_idx').on(t.expiresAt),
  ],
);
