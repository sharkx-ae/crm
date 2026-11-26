import { type LeadTab, leadsQuery } from '../contracts/leads.ts';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  type PageSize,
  parsePage,
  parsePageSize,
} from './paging.ts';

// The Leads screen's state lives in the address (F4b §4.8): ?tab&q&source&owner&page&size&lead, so a reload or a shared
// link keeps the view. Pure, so the page, the toolbar and the tests share one reading and one writing of it.

export type LeadFilters = {
  tab: LeadTab;
  q: string;
  source: string;
  owner: string;
  /** 1-based. */
  page: number;
  /** Rows per page: 10, 20, 50 or 100. Sent to the api as `limit`. */
  size: PageSize;
};

export const DEFAULT_FILTERS: LeadFilters = {
  tab: 'all',
  q: '',
  source: '',
  owner: '',
  page: DEFAULT_PAGE,
  size: DEFAULT_PAGE_SIZE,
};

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const PROBE = '00000000-0000-4000-8000-000000000000';
const accepted = (key: string, value: string) =>
  leadsQuery.safeParse({ projectId: PROBE, [key]: value }).success;

/**
 * Reads the address. A value the contract refuses (an unknown tab, a page of 0, a size of 5000) is dropped, never an
 * error page; an old `?limit=` link is ignored; and a client never carries an owner filter.
 */
export function parseLeadFilters(raw: Raw, o: { client: boolean }): LeadFilters {
  const pick = (key: string) => {
    const v = first(raw[key]);
    return v !== undefined && accepted(key, v) ? v : undefined;
  };
  const q = first(raw.q)?.trim().slice(0, 120);
  return {
    tab: (pick('tab') as LeadTab | undefined) ?? DEFAULT_FILTERS.tab,
    q: q ?? '',
    source: pick('source') ?? '',
    owner: o.client ? '' : (pick('owner') ?? ''),
    page: parsePage(raw.page),
    size: parsePageSize(raw.size),
  };
}

/**
 * The query string for `current` with `change` applied, defaults left out. Changing the tab, the search, a filter or
 * the page size starts over at page 1 (unless the change names a page). `lead` (the open drawer) is carried unless
 * `change.lead` is null.
 */
export function leadsSearch(
  current: LeadFilters,
  change: Partial<LeadFilters> & { lead?: string | null } = {},
  lead: string | null = null,
): string {
  const { lead: nextLead = lead, ...patch } = change;
  const resets = (['tab', 'q', 'source', 'owner', 'size'] as const).some(
    (k) => k in patch && patch[k] !== current[k],
  );
  const f: LeadFilters = {
    ...current,
    ...patch,
    page: 'page' in patch ? (patch.page as number) : resets ? DEFAULT_PAGE : current.page,
  };
  const p = new URLSearchParams();
  if (f.tab !== DEFAULT_FILTERS.tab) p.set('tab', f.tab);
  if (f.q) p.set('q', f.q);
  if (f.source) p.set('source', f.source);
  if (f.owner) p.set('owner', f.owner);
  if (f.page !== DEFAULT_PAGE) p.set('page', String(f.page));
  if (f.size !== DEFAULT_PAGE_SIZE) p.set('size', String(f.size));
  if (nextLead) p.set('lead', nextLead);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** The api (and export) query for these filters; the export sends no paging: it is the whole filtered set. */
export function leadsApiParams(
  projectId: string,
  f: LeadFilters,
  o: { withPaging: boolean },
): URLSearchParams {
  const p = new URLSearchParams({ projectId, tab: f.tab });
  if (f.q) p.set('q', f.q);
  if (f.source) p.set('source', f.source);
  if (f.owner) p.set('owner', f.owner);
  if (o.withPaging) {
    p.set('page', String(f.page));
    p.set('limit', String(f.size));
  }
  return p;
}
