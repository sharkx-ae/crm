'use client';

import { useLocale } from 'next-intl';
import { useMemo, useState } from 'react';
import type { PageSize } from './paging.ts';
import { DEFAULT_PAGE_SIZE, lastPage } from './paging.ts';
import { NO_SORT, nextSort, type Sort, sortRows } from './sort.ts';

/**
 * Sort and page state for a short list the screen already holds in full (Team, client users, Clients). Leads and
 * Contacts do not use it: they are long, so the api sorts and pages them and the address holds the state.
 * Sorting changes go back to page 1; a page past the end (a row was removed) shows the last page.
 */
export function useLocalTable<T, K extends string>(
  rows: readonly T[],
  value: (row: T, key: K) => string | number | null,
) {
  const locale = useLocale();
  const [sort, setSort] = useState<Sort<K>>(NO_SORT as Sort<K>);
  const [size, setSizeState] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [wanted, setPage] = useState(1);

  const sorted = useMemo(
    () => sortRows(rows, sort, (row, key) => value(row, key as K), locale),
    [rows, sort, value, locale],
  );
  const page = Math.min(wanted, lastPage(sorted.length, size));
  const view = sorted.slice((page - 1) * size, page * size);

  return {
    view,
    total: sorted.length,
    sort,
    page,
    size,
    onSort: (key: K) => {
      setSort((s) => nextSort(s, key));
      setPage(1);
    },
    onPageChange: setPage,
    onSizeChange: (next: number) => {
      setSizeState(next as PageSize);
      setPage(1);
    },
  };
}
