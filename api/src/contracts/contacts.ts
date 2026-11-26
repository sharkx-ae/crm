import { z } from 'zod';
import { e164, email, iso, leadStatus, pageNumber, pageSize, sortDir } from './common.ts';
import { staffLeadRow } from './leads.ts';

// F4b S3 (web plan §4.4). Staff only: the client role gets 403 from every route here.

export const contactSort = z.enum(['contact', 'email', 'leads', 'status', 'activity']);

// GET /contacts. `q` searches name, phone and email; `page` (1-based) and `limit` (the page size: 10, 20, 50 or 100)
// page the list; `total` is the size of the whole filtered set.
export const contactsQuery = z.object({
  projectId: z.uuid(),
  q: z.string().trim().max(120).optional(),
  sort: contactSort.optional(),
  dir: sortDir.optional(),
  page: pageNumber,
  limit: pageSize,
});
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

export type ContactsQuery = z.infer<typeof contactsQuery>;
export type ContactRow = z.infer<typeof contactRow>;
export type ContactsPage = z.infer<typeof contactsPage>;
export type ContactProfile = z.infer<typeof contactProfile>;
export type ContactSort = z.infer<typeof contactSort>;
