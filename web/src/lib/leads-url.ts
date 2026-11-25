import { type LeadTab, leadsQuery } from '../contracts/leads.ts';

// The Leads screen's state lives in the address (F4b §4.8): ?tab&q&source&owner&limit&lead, so a reload or a shared
// link keeps the view. Pure, so the page, the toolbar and the tests share one reading and one writing of it.

export const PAGE_STEP = 20;
export const PAGE_CAP = 200;

export type LeadFilters = {
  tab: LeadTab;
  q: string;
  source: string;
  owner: string;
  limit: number;
};

export const DEFAULT_FILTERS: LeadFilters = {
  tab: 'all',
  q: '',
  source: '',
  owner: '',
  limit: PAGE_STEP,
};

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const PROBE = '00000000-0000-4000-8000-000000000000';
const accepted = (key: string, value: string) =>
  leadsQuery.safeParse({ projectId: PROBE, [key]: value }).success;

/**
 * Reads the address. A value the contract refuses (an unknown tab, a limit of 5000) is dropped, never an error page,
 * and a client never carries an owner filter.
 */
export function parseLeadFilters(raw: Raw, o: { client: boolean }): LeadFilters {
  const pick = (key: string) => {
    const v = first(raw[key]);
    return v !== undefined && accepted(key, v) ? v : undefined;
  };
  const q = first(raw.q)?.trim().slice(0, 120);
  const limit = pick('limit');
  return {
    tab: (pick('tab') as LeadTab | undefined) ?? DEFAULT_FILTERS.tab,
    q: q ?? '',
    source: pick('source') ?? '',
    owner: o.client ? '' : (pick('owner') ?? ''),
    limit: limit ? Number(limit) : PAGE_STEP,
  };
}

/**
 * The query string for `current` with `change` applied, defaults left out. Changing a filter (anything but `limit`)
 * starts over at 20 rows. `lead` (the open drawer) is carried unless `change.lead` is null.
 */
export function leadsSearch(
  current: LeadFilters,
  change: Partial<LeadFilters> & { lead?: string | null } = {},
  lead: string | null = null,
): string {
  const { lead: nextLead = lead, ...patch } = change;
  const filtersChanged = (['tab', 'q', 'source', 'owner'] as const).some(
    (k) => k in patch && patch[k] !== current[k],
  );
  const f: LeadFilters = {
    ...current,
    ...patch,
    limit: 'limit' in patch ? (patch.limit as number) : filtersChanged ? PAGE_STEP : current.limit,
  };
  const p = new URLSearchParams();
  if (f.tab !== DEFAULT_FILTERS.tab) p.set('tab', f.tab);
  if (f.q) p.set('q', f.q);
  if (f.source) p.set('source', f.source);
  if (f.owner) p.set('owner', f.owner);
  if (f.limit !== PAGE_STEP) p.set('limit', String(f.limit));
  if (nextLead) p.set('lead', nextLead);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** The api (and export) query for these filters; the export sends no `limit`. */
export function leadsApiParams(
  projectId: string,
  f: LeadFilters,
  o: { withLimit: boolean },
): URLSearchParams {
  const p = new URLSearchParams({ projectId, tab: f.tab });
  if (f.q) p.set('q', f.q);
  if (f.source) p.set('source', f.source);
  if (f.owner) p.set('owner', f.owner);
  if (o.withLimit) p.set('limit', String(f.limit));
  return p;
}
