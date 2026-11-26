'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { LeadStatus } from '../../contracts/common.ts';
import type { ClientLeadRow, LeadSort, StaffLeadRow } from '../../contracts/leads.ts';
import { Link } from '../../lib/i18n/navigation.ts';
import { useProjectFormat } from '../../lib/i18n/use-project-format.ts';
import { nextSort, type Sort } from '../../lib/sort.ts';
import { Phone, UserText } from '../ui/bidi.tsx';
import { Chip, type ChipTone } from '../ui/chip.tsx';
import { ClickRow } from '../ui/click-row.tsx';
import { SortTh, Table, Td, Th } from '../ui/table.tsx';
import { SourceBadge } from './source-badge.tsx';

export const STATUS_TONE: Record<LeadStatus, ChipTone> = {
  new: 'new',
  mql: 'mql',
  sql: 'sql',
  not_qualified: 'nq',
};

export type LeadTableRow = ClientLeadRow | StaffLeadRow;

/** The status as the chip shows it: colour dot and the word, never colour alone. */
export function StatusChip({ status }: { status: LeadStatus }) {
  const t = useTranslations('common.status');
  return <Chip tone={STATUS_TONE[status]}>{t(status)}</Chip>;
}

/**
 * The rows (mockup `sx-table leads-t`). A new, unreviewed lead has the red edge. The first cell holds a real link to
 * the drawer; the whole row is a mouse shortcut to it. The staff table has an Owner column; a client's has none
 * and may add its inline "Mark as" column (`renderMark`).
 */
export function LeadsTable({
  rows,
  staff,
  hrefFor,
  renderMark,
  showStatus = true,
  label,
  sort,
  onSort,
}: {
  rows: readonly LeadTableRow[];
  staff: boolean;
  hrefFor: (id: string) => string;
  renderMark?: (row: ClientLeadRow) => ReactNode;
  /** The Overview's waiting list leaves it out: every row there is still new (mockup waitCard). */
  showStatus?: boolean;
  /** The table's accessible name; the Leads screen's by default. */
  label?: string;
  /** The sorted column, and what to do when a header is clicked. Without them the headers are plain text. */
  sort?: Sort<LeadSort>;
  onSort?: (next: Sort<LeadSort>) => void;
}) {
  const t = useTranslations('leads');
  const tSource = useTranslations('common.source');
  const format = useProjectFormat();
  const tUi = useTranslations('ui');

  // A sortable header when the screen passes the sort state, a plain one otherwise (the Overview's waiting list).
  const head = (key: LeadSort, text: string, num = false) =>
    sort && onSort ? (
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
    ) : (
      <Th num={num}>{text}</Th>
    );

  return (
    <Table aria-label={label ?? t('table')}>
      <thead>
        <tr>
          {head('lead', t('columns.lead'))}
          {head('source', t('columns.source'))}
          {head('campaign', t('columns.campaign'))}
          {showStatus ? head('status', t('columns.status')) : null}
          {staff ? head('owner', t('columns.owner')) : null}
          {head('received', t('columns.received'), true)}
          {renderMark ? <Th>{t('columns.markAs')}</Th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const href = hrefFor(r.id);
          const name = r.name ?? r.phoneDisplay ?? t('unnamed');
          return (
            <ClickRow key={r.id} href={href} fresh={r.status === 'new'}>
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
                    {r.name ? (
                      <UserText>{r.name}</UserText>
                    ) : r.phoneDisplay ? (
                      <Phone>{r.phoneDisplay}</Phone>
                    ) : (
                      name
                    )}
                  </span>
                  {r.name && r.phoneDisplay ? (
                    <Phone className="text-label text-sx-muted">{r.phoneDisplay}</Phone>
                  ) : null}
                </Link>
              </Td>
              <Td>
                <SourceBadge source={r.source} label={tSource(r.source)} />
              </Td>
              <Td className="max-w-[28ch] truncate" title={r.campaign ?? undefined}>
                {r.campaign ? <UserText>{r.campaign}</UserText> : null}
              </Td>
              {showStatus ? (
                <Td>
                  <StatusChip status={r.status} />
                </Td>
              ) : null}
              {staff ? (
                <Td>
                  {'ownerName' in r && r.ownerName ? (
                    <UserText>{r.ownerName}</UserText>
                  ) : (
                    <span className="text-sx-muted">{t('toolbar.unassigned')}</span>
                  )}
                </Td>
              ) : null}
              <Td num>{format.ago(r.createdAt)}</Td>
              {renderMark ? <Td>{renderMark(r)}</Td> : null}
            </ClickRow>
          );
        })}
      </tbody>
    </Table>
  );
}
