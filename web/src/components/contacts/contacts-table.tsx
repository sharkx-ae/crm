'use client';

import { useTranslations } from 'next-intl';
import type { ContactRow, ContactSort } from '../../contracts/contacts.ts';
import { Link } from '../../lib/i18n/navigation.ts';
import { useProjectFormat } from '../../lib/i18n/use-project-format.ts';
import { nextSort, type Sort } from '../../lib/sort.ts';
import { StatusChip } from '../leads/leads-table.tsx';
import { Phone, UserText } from '../ui/bidi.tsx';
import { ClickRow } from '../ui/click-row.tsx';
import { SortTh, Table, Td } from '../ui/table.tsx';

/**
 * The contacts table (mockup `sx-table`): name and phone, email, how many leads, the newest lead's status, and
 * when something last happened. The first cell is a real link to the profile drawer.
 */
export function ContactsTable({
  rows,
  hrefFor,
  sort,
  onSort,
}: {
  rows: readonly ContactRow[];
  hrefFor: (id: string) => string;
  sort: Sort<ContactSort>;
  onSort: (next: Sort<ContactSort>) => void;
}) {
  const t = useTranslations('contacts');
  const format = useProjectFormat();
  const tUi = useTranslations('ui');
  const head = (key: ContactSort, text: string, num = false) => (
    <SortTh
      sortKey={key}
      active={sort.sort}
      dir={sort.dir}
      onSort={(k) => onSort(nextSort(sort, k))}
      label={tUi('sortBy', { column: text })}
      num={num}
    >
      {text}
    </SortTh>
  );

  return (
    <Table aria-label={t('table')}>
      <thead>
        <tr>
          {head('contact', t('columns.contact'))}
          {head('email', t('columns.email'))}
          {head('leads', t('columns.leads'), true)}
          {head('status', t('columns.latestStatus'))}
          {head('activity', t('columns.lastActivity'), true)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const href = hrefFor(row.id);
          const name = row.name ?? row.phoneDisplay ?? t('unnamed');
          return (
            <ClickRow key={row.id} href={href}>
              <Td>
                <Link
                  href={href}
                  aria-label={t('open', { name })}
                  className="flex min-w-0 flex-col leading-snug text-sx-black no-underline"
                >
                  <span
                    title={name}
                    className="block max-w-[32ch] truncate font-heading text-section"
                  >
                    {row.name ? (
                      <UserText>{row.name}</UserText>
                    ) : row.phoneDisplay ? (
                      <Phone>{row.phoneDisplay}</Phone>
                    ) : (
                      name
                    )}
                  </span>
                  {row.name && row.phoneDisplay ? (
                    <Phone className="text-label text-sx-muted">{row.phoneDisplay}</Phone>
                  ) : null}
                </Link>
              </Td>
              <Td className="max-w-[28ch] truncate" title={row.email ?? undefined}>
                {row.email ? <UserText>{row.email}</UserText> : null}
              </Td>
              <Td num>{format.number(row.leadCount)}</Td>
              <Td>{row.latestStatus ? <StatusChip status={row.latestStatus} /> : null}</Td>
              <Td num>{format.ago(row.lastActivityAt)}</Td>
            </ClickRow>
          );
        })}
      </tbody>
    </Table>
  );
}
