'use client';

import { useTranslations } from 'next-intl';
import type { ContactRow } from '../../contracts/contacts.ts';
import { Link } from '../../lib/i18n/navigation.ts';
import { useProjectFormat } from '../../lib/i18n/use-project-format.ts';
import { StatusChip } from '../leads/leads-table.tsx';
import { Phone, UserText } from '../ui/bidi.tsx';
import { ClickRow } from '../ui/click-row.tsx';
import { Table, Td, Th } from '../ui/table.tsx';

/**
 * The contacts table (mockup `sx-table`): name and phone, email, how many leads, the newest lead's status, and
 * when something last happened. The first cell is a real link to the profile drawer.
 */
export function ContactsTable({
  rows,
  hrefFor,
}: {
  rows: readonly ContactRow[];
  hrefFor: (id: string) => string;
}) {
  const t = useTranslations('contacts');
  const format = useProjectFormat();

  return (
    <Table aria-label={t('table')}>
      <thead>
        <tr>
          <Th>{t('columns.contact')}</Th>
          <Th>{t('columns.email')}</Th>
          <Th num>{t('columns.leads')}</Th>
          <Th>{t('columns.latestStatus')}</Th>
          <Th num>{t('columns.lastActivity')}</Th>
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
                  <span className="font-heading text-section">
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
              <Td>{row.email ? <UserText>{row.email}</UserText> : null}</Td>
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
