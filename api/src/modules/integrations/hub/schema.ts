import { pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tstz, updatedAt } from '../../../db/schema/columns.ts';
import { healthEnum, modeEnum } from '../../../db/schema/enums.ts';
import { projectRef } from '../../../db/schema/refs.ts';

export const integrations = pgTable(
  'integrations',
  {
    id: pk(),
    projectId: projectRef(),
    platform: text('platform').notNull(),
    status: healthEnum('status').notNull().default('not_connected'),
    mode: modeEnum('mode').notNull().default('awaiting'),
    accountLabel: text('account_label'),
    lastDataAt: tstz('last_data_at'),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('integrations_project_platform').on(t.projectId, t.platform)],
);

// Encrypted platform tokens (AES-256-GCM). App roles can't read this table: system role only.
// One token per (integration, account): each WhatsApp Embedded Signup run is one WABA, with its own business token.
export const integrationTokens = pgTable(
  'integration_tokens',
  {
    id: pk(),
    projectId: projectRef(),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    accountRef: text('account_ref').notNull(),
    encValue: text('enc_value').notNull(),
    keyId: text('key_id').notNull(),
    expiresAt: tstz('expires_at'),
    createdAt: createdAt(),
  },
  (t) => [unique('integration_tokens_integration_account').on(t.integrationId, t.accountRef)],
);
