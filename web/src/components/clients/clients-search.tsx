'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from '../../lib/i18n/navigation.ts';
import { SearchField } from '../ui/search-field.tsx';

// Client search on the Clients home. The query lives in the URL (?q=) so the server renders the filtered list and a
// reload or shared link keeps it; typing replaces the URL after a short pause.
export function ClientsSearch() {
  const t = useTranslations('projects.home');
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const update = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const q = next.trim();
      start(() => router.replace(q ? `${pathname}?${new URLSearchParams({ q })}` : pathname));
    }, 250);
  };

  return (
    <SearchField label={t('search')} placeholder={t('search')} value={value} onChange={update} />
  );
}
