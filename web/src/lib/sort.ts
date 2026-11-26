import type { SortDir } from '../contracts/common.ts';

// Column sorting for the Leads and Contacts screens. The address carries ?sort&dir, the api sorts (the browser never
// sorts a page it did not fetch). No sort means the list's natural order (newest first). Pure, so the address readers
// and the column headers share one reading of it.

export type Sort<K extends string> = { sort: K | ''; dir: SortDir };
export const NO_SORT = { sort: '', dir: 'asc' } as const;

type Raw = string | string[] | undefined;
const first = (v: Raw) => (Array.isArray(v) ? v[0] : v);

/** A known column and direction; anything else is dropped to "no sort". A column without a direction sorts ascending. */
export function parseSort<K extends string>(
  rawSort: Raw,
  rawDir: Raw,
  allowed: readonly K[],
): Sort<K> {
  const sort = first(rawSort);
  if (!sort || !(allowed as readonly string[]).includes(sort)) return NO_SORT;
  return { sort: sort as K, dir: first(rawDir) === 'desc' ? 'desc' : 'asc' };
}

/** What a click on a column header does: ascending, then descending, then back to the natural order. */
export function nextSort<K extends string>(current: Sort<K>, key: K): Sort<K> {
  if (current.sort !== key) return { sort: key, dir: 'asc' };
  if (current.dir === 'asc') return { sort: key, dir: 'desc' };
  return NO_SORT;
}

/** Sorts a small, fully loaded list in the browser (Team, client users, Clients): text by locale, numbers by value. */
export function sortRows<T>(
  rows: readonly T[],
  sort: Sort<string>,
  value: (row: T, key: string) => string | number | null,
  locale: string,
): T[] {
  if (!sort.sort) return [...rows];
  const sign = sort.dir === 'asc' ? 1 : -1;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  return [...rows].sort((a, b) => {
    const x = value(a, sort.sort);
    const y = value(b, sort.sort);
    if (x === y) return 0;
    if (x === null) return 1; // empty values last, either direction
    if (y === null) return -1;
    const order =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : collator.compare(String(x), String(y));
    return order * sign;
  });
}
