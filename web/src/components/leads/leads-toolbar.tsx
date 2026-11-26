'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { LeadsPage } from '../../contracts/leads.ts';
import type { LeadFilters } from '../../lib/leads-url.ts';
import { CardToolbar } from '../ui/card.tsx';
import { SearchField } from '../ui/search-field.tsx';
import { Select } from '../ui/select.tsx';

const SEARCH_DELAY_MS = 300;

/**
 * Search, source and (staff) owner (mockup `toolbar`). Every change goes to the address, so the server renders the
 * result: nothing here filters. The search waits 300 ms after the last key.
 */
export function LeadsToolbar({
  filters,
  sources,
  owners,
  onChange,
}: {
  filters: LeadFilters;
  sources: LeadsPage['sources'];
  /** Staff only; a client has no owner filter. */
  owners: Extract<LeadsPage, { view: 'staff' }>['owners'] | null;
  onChange: (change: Partial<LeadFilters>) => void;
}) {
  const t = useTranslations('leads.toolbar');
  const tSource = useTranslations('common.source');
  const [value, setValue] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The address changed from elsewhere (Clear filters, back button): follow it.
  // (The search is sent trimmed: do not strip a space the person has just typed.)
  useEffect(() => setValue((v) => (v.trim() === filters.q ? v : filters.q)), [filters.q]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const type = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange({ q: next.trim() }), SEARCH_DELAY_MS);
  };

  return (
    <CardToolbar>
      <SearchField
        label={t('searchLabel')}
        placeholder={t('search')}
        value={value}
        onChange={type}
      />
      <Select
        size="sm"
        fit
        aria-label={t('source')}
        value={filters.source}
        onValueChange={(source) => onChange({ source })}
        options={[
          { value: '', label: t('allSources') },
          ...sources.map((s) => ({ value: s, label: tSource(s) })),
          // A shared link can name a source this client has no leads from: keep it visible, never a blank box.
          ...(filters.source && !sources.some((s) => s === filters.source)
            ? [
                {
                  value: filters.source,
                  label: tSource(filters.source as LeadsPage['sources'][number]),
                },
              ]
            : []),
        ]}
      />
      {owners ? (
        <Select
          size="sm"
          fit
          aria-label={t('owner')}
          value={filters.owner}
          onValueChange={(owner) => onChange({ owner })}
          options={[
            { value: '', label: t('allOwners') },
            { value: 'unassigned', label: t('unassigned') },
            ...owners.map((o) => ({
              value: o.id,
              label: o.active ? o.name : t('inactiveOwner', { name: o.name }),
            })),
            ...(filters.owner &&
            filters.owner !== 'unassigned' &&
            !owners.some((o) => o.id === filters.owner)
              ? [{ value: filters.owner, label: t('unknownOwner') }]
              : []),
          ]}
        />
      ) : null}
    </CardToolbar>
  );
}
