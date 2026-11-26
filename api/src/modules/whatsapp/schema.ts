import { index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tstz } from '../../db/schema/columns.ts';
import { directionEnum, msgTypeEnum, originEnum, waSyncStateEnum } from '../../db/schema/enums.ts';
import { projectRef } from '../../db/schema/refs.ts';
import { contacts } from '../contacts/schema.ts';

export const waNumbers = pgTable(
  'wa_numbers',
  {
    id: pk(),
    projectId: projectRef(),
    // A number belongs to exactly one client.
    phoneE164: text('phone_e164').notNull().unique(),
    label: text('label'),
    // Webhook routing key (`value.metadata.phone_number_id`): unique across clients, whatever RLS lets a client see.
    phoneNumberId: text('phone_number_id').notNull(),
    // `account_update` webhooks carry only the WABA id; also the token lookup (one token per WABA).
    wabaId: text('waba_id').notNull(),
    syncState: waSyncStateEnum('sync_state').notNull().default('none'),
    syncPct: integer('sync_pct').notNull().default(0),
    // Meta allows the history sync only within 24 h of onboarding; a reconnect restarts the clock (created_at does not).
    onboardedAt: tstz('onboarded_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('wa_numbers_phone_number_id_unique').on(t.phoneNumberId),
    index('wa_numbers_waba_idx').on(t.wabaId),
  ],
);

export const waConversations = pgTable(
  'wa_conversations',
  {
    id: pk(),
    projectId: projectRef(),
    numberId: uuid('number_id')
      .notNull()
      .references(() => waNumbers.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    lastMessageAt: tstz('last_message_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('wa_conversations_number_contact').on(t.numberId, t.contactId),
    index('wa_conversations_project_last_idx').on(t.projectId, t.lastMessageAt),
  ],
);

export const waMessages = pgTable(
  'wa_messages',
  {
    id: pk(),
    projectId: projectRef(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => waConversations.id, { onDelete: 'cascade' }),
    waMessageId: text('wa_message_id').notNull().unique(),
    direction: directionEnum('direction').notNull(),
    origin: originEnum('origin').notNull(),
    type: msgTypeEnum('type').notNull().default('text'),
    text: text('text'),
    ts: tstz('ts').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('wa_messages_conversation_ts_idx').on(t.conversationId, t.ts)],
);
