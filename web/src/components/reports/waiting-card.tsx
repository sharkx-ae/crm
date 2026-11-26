'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { ClientLeadRow, LeadSort } from '../../contracts/leads.ts';
import { Link } from '../../lib/i18n/navigation.ts';
import { NO_SORT, type Sort, sortRows } from '../../lib/sort.ts';
import { ClientMarkCell } from '../leads/client-mark-cell.tsx';
import { LeadsTable } from '../leads/leads-table.tsx';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { EmptyState } from '../ui/empty-state.tsx';
import { Icon } from '../ui/icons.tsx';

/**
 * The client's "Waiting for review" card (mockup `waitCard`): the newest unreviewed leads with the inline mark. A row
 * opens the lead in the Leads screen's drawer; "Review leads" opens the whole waiting tab. A mark refreshes the page,
 * so the marked lead leaves the list at once.
 */
export function WaitingCard({ rows, projectId }: { rows: ClientLeadRow[]; projectId: string }) {
  const t = useTranslations('reports.overview');
  const locale = useLocale();
  const [sort, setSort] = useState<Sort<LeadSort>>(NO_SORT);
  // A handful of rows held in the browser, so they sort here (the full Leads screen sorts in the api).
  const sorted = useMemo(
    () =>
      sortRows(
        rows,
        sort,
        (r, key) =>
          key === 'lead'
            ? (r.name ?? r.phoneDisplay)
            : key === 'received'
              ? Date.parse(r.createdAt)
              : key === 'source'
                ? r.source
                : r.campaign,
        locale,
      ),
    [rows, sort, locale],
  );
  const leadsHref = `/p/${projectId}/leads?tab=unreviewed`;

  return (
    <Card flush>
      <div className="flex items-center justify-between gap-3 ps-4 pe-4 pt-4 pb-3 rail:ps-6 rail:pe-6 rail:pt-5">
        <h2 className="m-0 font-heading text-section">{t('kpi.waiting')}</h2>
        <Button asChild size="sm">
          <Link href={leadsHref}>
            {t('waiting.review')}
            <Icon name="right" size="sm" flip />
          </Link>
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={t('waiting.emptyTitle')} body={t('waiting.emptyBody')} />
      ) : (
        <LeadsTable
          rows={sorted}
          sort={sort}
          onSort={setSort}
          staff={false}
          showStatus={false}
          label={t('waiting.table')}
          hrefFor={(id) => `${leadsHref}&lead=${id}`}
          renderMark={(row) => <ClientMarkCell row={row} projectId={projectId} />}
        />
      )}
    </Card>
  );
}
