import { z } from 'zod';
import { e164, email, iso, leadStatus } from './common.ts';
import { staffLeadRow } from './leads.ts';

// F4b S3 (web plan §4.4). Staff only: the client role gets 403 from every route here.
export const contactRow = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  phone: e164.nullable(),
  phoneDisplay: z.string().nullable(),
  email: email.nullable(),
  leadCount: z.number().int().nonnegative(),
  latestStatus: leadStatus.nullable(),
  lastActivityAt: iso.nullable(),
});
export const contactsPage = z.object({
  rows: z.array(contactRow),
  total: z.number().int().nonnegative(),
});

export const contactProfile = z.object({
  contact: contactRow.omit({ leadCount: true, latestStatus: true, lastActivityAt: true }).extend({
    createdAt: iso,
  }),
  leads: z.array(staffLeadRow),
  chats: z.array(
    z.object({
      numberLabel: z.string().nullable(),
      phoneDisplay: z.string().nullable(),
      messages: z.number().int().nonnegative(),
    }),
  ),
  notes: z.array(
    z.object({
      id: z.uuid(),
      leadId: z.uuid(),
      authorName: z.string().nullable(),
      text: z.string(),
      createdAt: iso,
    }),
  ),
  statusChanges: z.array(
    z.object({
      leadId: z.uuid(),
      from: leadStatus,
      to: leadStatus,
      reason: z.string().nullable(),
      byName: z.string().nullable(),
      at: iso,
    }),
  ),
});

export type ContactRow = z.infer<typeof contactRow>;
export type ContactsPage = z.infer<typeof contactsPage>;
export type ContactProfile = z.infer<typeof contactProfile>;
