import { z } from 'zod';
import type { SortDir } from '../contracts/common.ts';
import { type ContactSort, contactSort } from '../contracts/contacts.ts';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  type PageSize,
  parsePage,
  parsePageSize,
} from './paging.ts';
import { parseSort } from './sort.ts';

// The Contacts screen's state lives in the address (F4b D4): ?q&page&size&contact. Pure, so the page and the
// screen share one reading and one writing of it.

export type ContactFilters = {
  q: string;
  sort: ContactSort | '';
  dir: SortDir;
  /** 1-based. */
  page: number;
  /** Rows per page: 10, 20, 50 or 100. Sent to the api as `limit`. */
  size: PageSize;
};

export const DEFAULT_FILTERS: ContactFilters = {
  q: '',
  sort: '',
  dir: 'asc',
  page: DEFAULT_PAGE,
  size: DEFAULT_PAGE_SIZE,
};

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Reads the address. A page or size the contract refuses is dropped (an old `?limit=` is ignored); a contact id that is not a uuid is ignored. */
export function parseContactsAddress(raw: Raw): {
  filters: ContactFilters;
  contactId: string | null;
} {
  const q = first(raw.q)?.trim().slice(0, 120) ?? '';
  const contact = first(raw.contact);
  return {
    filters: {
      q,
      ...parseSort(raw.sort, raw.dir, contactSort.options),
      page: parsePage(raw.page),
      size: parsePageSize(raw.size),
    },
    contactId: contact && z.uuid().safeParse(contact).success ? contact : null,
  };
}

/**
 * The query string for `current` with `change` applied, defaults left out. Changing the search or the page size
 * starts over at page 1 (unless the change names a page). `contact` (the open drawer) is carried unless
 * `change.contact` is null.
 */
export function contactsSearch(
  current: ContactFilters,
  change: Partial<ContactFilters> & { contact?: string | null } = {},
  contact: string | null = null,
): string {
  const { contact: next = contact, ...patch } = change;
  const resets = (['q', 'size', 'sort', 'dir'] as const).some(
    (k) => k in patch && patch[k] !== current[k],
  );
  const f: ContactFilters = {
    ...current,
    ...patch,
    page: 'page' in patch ? (patch.page as number) : resets ? DEFAULT_PAGE : current.page,
  };
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.sort) {
    p.set('sort', f.sort);
    p.set('dir', f.dir);
  }
  if (f.page !== DEFAULT_PAGE) p.set('page', String(f.page));
  if (f.size !== DEFAULT_PAGE_SIZE) p.set('size', String(f.size));
  if (next) p.set('contact', next);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** The api query for these filters. The browser never filters or slices. */
export function contactsApiParams(projectId: string, f: ContactFilters): URLSearchParams {
  const p = new URLSearchParams({ projectId, page: String(f.page), limit: String(f.size) });
  if (f.q) p.set('q', f.q);
  if (f.sort) {
    p.set('sort', f.sort);
    p.set('dir', f.dir);
  }
  return p;
}
