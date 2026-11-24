'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from '../../lib/i18n/navigation.ts';
import { Icon } from '../ui/icons.tsx';

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
    // The input draws no outline of its own; the whole box gets the brand's 3px red ring on keyboard focus.
    <label className="flex h-9 w-full max-w-72 items-center gap-2.5 rounded-field border border-sx-line bg-sx-paper ps-3 pe-3 text-sx-muted focus-within:border-sx-black has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-sx-red">
      <Icon name="search" size="sm" />
      <span className="sr-only">{t('search')}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => update(e.target.value)}
        placeholder={t('search')}
        className="min-w-0 flex-1 border-0 bg-transparent text-sx-black outline-none"
      />
    </label>
  );
}
