'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { ContactProfile, ContactsPage } from '../../contracts/contacts.ts';
import {
  type ContactFilters,
  contactsSearch,
  PAGE_CAP,
  PAGE_STEP,
} from '../../lib/contacts-url.ts';
import { usePathname, useRouter } from '../../lib/i18n/navigation.ts';
import { useAutoRefresh } from '../../lib/use-auto-refresh.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { EmptyState } from '../ui/empty-state.tsx';
import { Icon } from '../ui/icons.tsx';
import { useToast } from '../ui/toast.tsx';
import { ContactDrawer } from './contact-drawer.tsx';
import { ContactsTable } from './contacts-table.tsx';

const REFRESH_MS = 5000;
const SEARCH_DELAY_MS = 300;

/**
 * Contacts (F4b S8, S9): one search, one flush table, and a profile drawer on `?contact=`. The address is the
 * state and the page refreshes itself every 5 s (F4b D2). Nothing here filters or slices.
 */
export function ContactsScreen({
  projectId,
  data,
  filters,
  profile,
  contactId,
  contactMissing,
}: {
  projectId: string;
  data: ContactsPage;
  filters: ContactFilters;
  profile: ContactProfile | null;
  contactId: string | null;
  contactMissing: boolean;
}) {
  const t = useTranslations('contacts');
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (change: Partial<ContactFilters> & { contact?: string | null }) =>
    start(() =>
      router.replace(`${pathname}${contactsSearch(filters, change, contactId)}`, { scroll: false }),
    );

  useAutoRefresh({
    intervalMs: REFRESH_MS,
    paused: pending,
    onRefresh: () => start(() => router.refresh()),
  });

  useEffect(() => setValue((v) => (v.trim() === filters.q ? v : filters.q)), [filters.q]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Once per missing contact: after the replace the address no longer names it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a missing contact appears, not on every search change
  useEffect(() => {
    if (!contactMissing) return;
    toast(t('toast.gone'));
    router.replace(`${pathname}${contactsSearch(filters, { contact: null }, contactId)}`, {
      scroll: false,
    });
  }, [contactMissing, contactId]);

  const type = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: next.trim() }), SEARCH_DELAY_MS);
  };

  const more = Math.min(PAGE_STEP, data.total - data.rows.length);
  const canGrow = data.rows.length < data.total && filters.limit < PAGE_CAP;
  const capped = data.rows.length < data.total && filters.limit >= PAGE_CAP;
  const nothingYet = data.total === 0 && !filters.q;

  return (
    <>
      <label className="flex h-9 max-w-[340px] items-center gap-2.5 rounded-field border border-sx-line bg-sx-paper ps-3 pe-3 text-sx-muted focus-within:border-sx-black has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-sx-red">
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
      <Card flush>
        {data.rows.length === 0 ? (
          <EmptyState title={nothingYet ? t('empty.noneTitle') : t('empty.matchTitle')} />
        ) : (
          <ContactsTable
            rows={data.rows}
            hrefFor={(id) => `${pathname}${contactsSearch(filters, { contact: id }, contactId)}`}
          />
        )}
      </Card>
      {canGrow ? (
        <div className="flex justify-center">
          <Button onClick={() => go({ limit: Math.min(PAGE_CAP, filters.limit + PAGE_STEP) })}>
            {t('more', { n: more })}
          </Button>
        </div>
      ) : null}
      {capped ? (
        <p className="text-center text-label text-sx-muted">{t('cap', { n: PAGE_CAP })}</p>
      ) : null}
      {profile ? (
        <ContactDrawer
          key={profile.contact.id}
          profile={profile}
          projectId={projectId}
          onClose={() => go({ contact: null })}
        />
      ) : null}
    </>
  );
}
