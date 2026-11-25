import { z } from 'zod';
import { contactsQuery } from '../contracts/contacts.ts';

// The Contacts screen's state lives in the address (F4b D4): ?q&limit&contact. Pure, so the page and the
// screen share one reading and one writing of it.

export const PAGE_STEP = 20;
export const PAGE_CAP = 200;

export type ContactFilters = { q: string; limit: number };

export const DEFAULT_FILTERS: ContactFilters = { q: '', limit: PAGE_STEP };

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const PROBE = '00000000-0000-4000-8000-000000000000';

/** Reads the address. A limit the contract refuses is dropped; a contact id that is not a uuid is ignored. */
export function parseContactsAddress(raw: Raw): {
  filters: ContactFilters;
  contactId: string | null;
} {
  const q = first(raw.q)?.trim().slice(0, 120) ?? '';
  const limitRaw = first(raw.limit);
  const limitOk =
    limitRaw !== undefined &&
    contactsQuery.safeParse({ projectId: PROBE, limit: limitRaw }).success;
  const contact = first(raw.contact);
  return {
    filters: { q, limit: limitOk ? Number(limitRaw) : PAGE_STEP },
    contactId: contact && z.uuid().safeParse(contact).success ? contact : null,
  };
}

/**
 * The query string for `current` with `change` applied, defaults left out. Changing the search starts over at
 * 20 rows. `contact` (the open drawer) is carried unless `change.contact` is null.
 */
export function contactsSearch(
  current: ContactFilters,
  change: Partial<ContactFilters> & { contact?: string | null } = {},
  contact: string | null = null,
): string {
  const { contact: next = contact, ...patch } = change;
  const qChanged = 'q' in patch && patch.q !== current.q;
  const f: ContactFilters = {
    ...current,
    ...patch,
    limit: 'limit' in patch ? (patch.limit as number) : qChanged ? PAGE_STEP : current.limit,
  };
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.limit !== PAGE_STEP) p.set('limit', String(f.limit));
  if (next) p.set('contact', next);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** The api query for these filters. The browser never filters or slices. */
export function contactsApiParams(projectId: string, f: ContactFilters): URLSearchParams {
  const p = new URLSearchParams({ projectId, limit: String(f.limit) });
  if (f.q) p.set('q', f.q);
  return p;
}
