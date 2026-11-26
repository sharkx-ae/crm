import { PAGE_SIZES } from '../contracts/common.ts';

// Paging for the Leads and Contacts screens (replaces "Show 20 more"). The address carries ?page&size, the api takes
// page and limit. Pure, so the address readers, the pages and the footer share one reading of it.

export { PAGE_SIZES };
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE: PageSize = 20;

type Raw = string | string[] | undefined;
const first = (v: Raw) => (Array.isArray(v) ? v[0] : v);

/** A whole number from 1 up; anything else (0, -1, 2.5, "abc", "2e3") is dropped to page 1. */
export function parsePage(raw: Raw): number {
  const v = first(raw);
  if (v === undefined || !/^[1-9]\d{0,6}$/.test(v)) return DEFAULT_PAGE;
  return Number(v);
}

/** One of 10, 20, 50, 100; anything else (including an old ?limit=) is dropped to the default of 20. */
export function parsePageSize(raw: Raw): PageSize {
  const v = Number(first(raw));
  return (PAGE_SIZES as readonly number[]).includes(v) ? (v as PageSize) : DEFAULT_PAGE_SIZE;
}

/** The last page of `total` rows at `size` per page; an empty list still has a page 1. */
export const lastPage = (total: number, size: number): number =>
  Math.max(1, Math.ceil(total / size));

/** The 1-based range of rows on a page, for "1–20 of 64". `from` is 0 when there are no rows. */
export function rowRange(page: number, size: number, shown: number) {
  if (shown === 0) return { from: 0, to: 0 };
  const from = (page - 1) * size + 1;
  return { from, to: from + shown - 1 };
}

export type PageItem = number | 'gap';

/**
 * The page links, compact: the first and last page and the current one with a neighbour on each side, with a gap
 * (…) where pages are skipped. A gap that would hide one page shows that page instead: 1 … 4 5 6 … 12, 1 2 3 4 5.
 */
export function pageItems(page: number, last: number): PageItem[] {
  const wanted = new Set([1, last, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);
  const items: PageItem[] = [];
  let prev = 0;
  for (const p of pages) {
    if (p - prev === 2) items.push(prev + 1);
    else if (p - prev > 2) items.push('gap');
    items.push(p);
    prev = p;
  }
  return items;
}
