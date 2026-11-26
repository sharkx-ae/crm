'use client';

import { useTranslations } from 'next-intl';
import type { HealthState } from '../../contracts/common.ts';
import type { ProjectsHomeResponse } from '../../contracts/projects.ts';
import { Link } from '../../lib/i18n/navigation.ts';
import { useLocalTable } from '../../lib/use-local-table.ts';
import { Avatar } from '../ui/avatar.tsx';
import { UserText } from '../ui/bidi.tsx';
import { Chip } from '../ui/chip.tsx';
import { ClickRow } from '../ui/click-row.tsx';
import { type DotState, Dots } from '../ui/dots.tsx';
import { Icon } from '../ui/icons.tsx';
import { Pagination } from '../ui/pagination.tsx';
import { SortTh, Table, Td, Th } from '../ui/table.tsx';

const DOT: Record<HealthState, DotState> = {
  connected: 'ok',
  needs_attention: 'warn',
  broken: 'bad',
  not_connected: 'off',
};

export type ClientRowItem = {
  row: ProjectsHomeResponse['rows'][number];
  /** "Casablanca · Aesthetics · GMT+1", built on the server (it depends on the current date). */
  place: string;
};

type SortKey = 'client' | 'newToday' | 'unreplied' | 'overdue' | 'connections';

const sortValue = ({ row }: ClientRowItem, key: SortKey): string | number => {
  switch (key) {
    case 'client':
      return row.name;
    case 'newToday':
      return row.newToday;
    case 'unreplied':
      return row.unreplied;
    case 'overdue':
      return row.overdue;
    case 'connections':
      return row.integrations.filter((i) => i.status === 'connected').length;
  }
};

/**
 * The Clients home table: sortable columns and a paging footer. The api returns every client the staff member can
 * see (a short list), so sorting and paging happen here; the red header and the footer stay put and only the rows scroll.
 */
export function ClientsTable({ items }: { items: ClientRowItem[] }) {
  const t = useTranslations('projects.home');
  const tUi = useTranslations('ui');
  const table = useLocalTable(items, sortValue);

  const head = (key: SortKey, num = false) => (
    <SortTh
      sortKey={key}
      active={table.sort.sort}
      dir={table.sort.dir}
      onSort={table.onSort}
      label={tUi('sortBy', { column: t(`col.${key}`) })}
      num={num}
    >
      {t(`col.${key}`)}
    </SortTh>
  );

  return (
    <>
      <Table aria-label={t('tableLabel')}>
        <thead>
          <tr>
            {head('client')}
            {head('newToday', true)}
            {head('unreplied', true)}
            {head('overdue', true)}
            {head('connections')}
            <Th>
              <span className="sr-only">{t('col.open')}</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {table.view.map(({ row: r, place }) => {
            const href = `/p/${r.id}/overview`;
            const toFix = r.integrations.filter(
              (i) => i.status === 'needs_attention' || i.status === 'broken',
            );
            const connected = r.integrations.filter((i) => i.status === 'connected').length;
            return (
              <ClickRow key={r.id} href={href}>
                <Td>
                  <Link
                    href={href}
                    aria-label={t('open', { name: r.name })}
                    className="flex min-w-0 items-center gap-2.5 text-sx-black no-underline"
                  >
                    <Avatar name={r.name} shape="square" color={r.color} />
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate font-heading">
                        <UserText>{r.name}</UserText>
                      </span>
                      <span className="block truncate text-label text-sx-muted">{place}</span>
                    </span>
                  </Link>
                </Td>
                <Td num>{r.newToday}</Td>
                <Td num>{r.unreplied}</Td>
                <Td num>{r.overdue}</Td>
                <Td>
                  <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
                    <Dots
                      states={r.integrations.map((i) => DOT[i.status])}
                      label={t('dotsLabel', { connected, toFix: toFix.length })}
                    />
                    {toFix.length > 0 ? (
                      <Chip tone={toFix.some((i) => i.status === 'broken') ? 'bad' : 'warn'}>
                        {t('toFixChip', { n: toFix.length })}
                      </Chip>
                    ) : null}
                  </span>
                </Td>
                <Td num>
                  <Icon name="right" size="sm" flip className="text-sx-muted" />
                </Td>
              </ClickRow>
            );
          })}
        </tbody>
      </Table>
      <Pagination
        page={table.page}
        size={table.size}
        total={table.total}
        shown={table.view.length}
        onPageChange={table.onPageChange}
        onSizeChange={table.onSizeChange}
      />
    </>
  );
}
