import { index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { createdAt, pk } from '../../db/schema/columns.ts';
import { projectRef } from '../../db/schema/refs.ts';

// One person per client (CONTRACTS §3). First version written by Alex in F1b; John owns it from here.
export const contacts = pgTable(
  'contacts',
  {
    id: pk(),
    projectId: projectRef(),
    name: text('name'),
    phoneE164: text('phone_e164'),
    email: text('email'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('contacts_project_phone').on(t.projectId, t.phoneE164),
    index('contacts_project_email_idx').on(t.projectId, t.email),
  ],
);
