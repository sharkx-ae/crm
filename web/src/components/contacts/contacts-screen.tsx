'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { ContactProfile, ContactsPage } from '../../contracts/contacts.ts';
import { type ContactFilters, contactsSearch } from '../../lib/contacts-url.ts';
import { usePathname, useRouter } from '../../lib/i18n/navigation.ts';
import { useAutoRefresh } from '../../lib/use-auto-refresh.ts';
import { Card, CardToolbar } from '../ui/card.tsx';
import { EmptyState } from '../ui/empty-state.tsx';
import { Pagination } from '../ui/pagination.tsx';
import { SearchField } from '../ui/search-field.tsx';
import { useToast } from '../ui/toast.tsx';
import { ContactDrawer } from './contact-drawer.tsx';
import { ContactsTable } from './contacts-table.tsx';

const REFRESH_MS = 5000;
const SEARCH_DELAY_MS = 300;

/**
 * Contacts (F4b S8, S9): one flush card (search toolbar, table, paging footer) and a profile drawer on `?contact=`.
 * The address is the state and the page refreshes itself every 5 s (F4b D2). Nothing here filters or slices.
 */
export function ContactsScreen({
  projectId,
  data,
  filters,
  profile,
  contactId,
  contactMissing,
  pageClamped,
}: {
  projectId: string;
  data: ContactsPage;
  filters: ContactFilters;
  profile: ContactProfile | null;
  contactId: string | null;
  contactMissing: boolean;
  /** The address asked for a page past the end: `filters` already holds the last page; fix the address. */
  pageClamped: boolean;
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
    toast(t('toast.gone'), { tone: 'error' });
    router.replace(`${pathname}${contactsSearch(filters, { contact: null }, contactId)}`, {
      scroll: false,
    });
  }, [contactMissing, contactId]);

  // The server already rendered the last page; make the address say so.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a clamp happens, not on every search change
  useEffect(() => {
    if (pageClamped)
      router.replace(`${pathname}${contactsSearch(filters, {}, contactId)}`, { scroll: false });
  }, [pageClamped]);

  const type = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: next.trim() }), SEARCH_DELAY_MS);
  };

  const nothingYet = data.total === 0 && !filters.q;

  return (
    <>
      <Card flush fill>
        <CardToolbar>
          <SearchField
            label={t('searchLabel')}
            placeholder={t('search')}
            value={value}
            onChange={type}
          />
        </CardToolbar>
        {data.rows.length === 0 ? (
          <EmptyState title={nothingYet ? t('empty.noneTitle') : t('empty.matchTitle')} />
        ) : (
          <ContactsTable
            rows={data.rows}
            hrefFor={(id) => `${pathname}${contactsSearch(filters, { contact: id }, contactId)}`}
            sort={{ sort: filters.sort, dir: filters.dir }}
            onSort={(s) => go({ sort: s.sort, dir: s.dir })}
          />
        )}
        {data.rows.length > 0 ? (
          <Pagination
            page={filters.page}
            size={filters.size}
            total={data.total}
            shown={data.rows.length}
            hrefFor={(page) => `${pathname}${contactsSearch(filters, { page }, contactId)}`}
            onSizeChange={(size) => go({ size: size as ContactFilters['size'] })}
          />
        ) : null}
      </Card>
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
