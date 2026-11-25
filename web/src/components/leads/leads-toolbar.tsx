'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { LeadsPage } from '../../contracts/leads.ts';
import type { LeadFilters } from '../../lib/leads-url.ts';
import { Icon } from '../ui/icons.tsx';
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
    <div className="flex flex-wrap items-center gap-3 ps-4 pe-4 py-3 rail:ps-6 rail:pe-6 rail:py-4">
      {/* The input draws no outline of its own; the whole box gets the brand's 3px red ring on keyboard focus. */}
      <label className="flex h-9 min-w-[200px] max-w-[340px] flex-1 items-center gap-2.5 rounded-field border border-sx-line bg-sx-paper ps-3 pe-3 text-sx-muted focus-within:border-sx-black has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-sx-red">
        <Icon name="search" size="sm" />
        <span className="sr-only">{t('searchLabel')}</span>
        <input
          type="search"
          value={value}
          onChange={(e) => type(e.target.value)}
          placeholder={t('search')}
          className="min-w-0 flex-1 border-0 bg-transparent text-sx-black outline-none"
        />
      </label>
      <Select
        size="sm"
        aria-label={t('source')}
        className="w-auto min-w-[150px]"
        value={filters.source}
        onValueChange={(source) => onChange({ source })}
        options={[
          { value: '', label: t('allSources') },
          ...sources.map((s) => ({ value: s, label: tSource(s) })),
        ]}
      />
      {owners ? (
        <Select
          size="sm"
          aria-label={t('owner')}
          className="w-auto min-w-[150px]"
          value={filters.owner}
          onValueChange={(owner) => onChange({ owner })}
          options={[
            { value: '', label: t('allOwners') },
            { value: 'unassigned', label: t('unassigned') },
            ...owners.map((o) => ({
              value: o.id,
              label: o.active ? o.name : t('inactiveOwner', { name: o.name }),
            })),
          ]}
        />
      ) : null}
    </div>
  );
}
