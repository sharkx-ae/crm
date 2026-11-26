import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { ProjectsHomeResponse } from '../../contracts/projects.ts';
import { zoneLabel } from '../../lib/i18n/format.ts';
import type { Locale } from '../../lib/i18n/routing.ts';
import { Card, CardToolbar } from '../ui/card.tsx';
import { EmptyState } from '../ui/empty-state.tsx';
import { Kpi, KpiStrip } from '../ui/kpi.tsx';
import { ClientsSearch } from './clients-search.tsx';
import { ClientsTable } from './clients-table.tsx';

/**
 * Clients home (mockup viewClients): the KPI strip on the canvas with the page's one action ("Add client") at its
 * inline end (above the strip, still at the inline end, under 900px), then one flush card with the search toolbar and
 * the table.
 */
export async function ClientsHome({
  data,
  searching,
  canCreate,
  action,
}: {
  data: ProjectsHomeResponse;
  searching: boolean;
  canCreate: boolean;
  /** The primary action (Add client), super admin only. */
  action?: ReactNode;
}) {
  const t = await getTranslations('projects.home');
  // Each client's own time zone, labelled (F13a): its numbers count "today" from its own midnight.
  const locale = (await getLocale()) as Locale;
  const now = new Date();
  const { totals, rows } = data;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-4 rail:flex-row rail:items-end rail:gap-6">
        <div className="min-w-0 flex-1">
          <KpiStrip>
            <Kpi label={t('kpi.newToday')} value={totals.newToday} />
            <Kpi label={t('kpi.unreplied')} value={totals.unreplied} />
            <Kpi label={t('kpi.overdue')} value={totals.overdue} />
            <Kpi label={t('kpi.toFix')} value={totals.toFix} hot={totals.toFix > 0} />
          </KpiStrip>
        </div>
        {action ? (
          <div className="order-first flex-none self-end rail:order-none">{action}</div>
        ) : null}
      </div>

      <Card flush fill>
        <CardToolbar>
          <ClientsSearch />
        </CardToolbar>
        {rows.length === 0 ? (
          searching ? (
            <EmptyState title={t('noMatchTitle')} body={t('noMatchBody')} />
          ) : (
            <EmptyState title={t('emptyTitle')} body={canCreate ? t('emptyBody') : undefined} />
          )
        ) : (
          <ClientsTable
            items={rows.map((row) => ({
              row,
              place: t('place', {
                city: row.city ?? '',
                industry: row.industry ?? '',
                zone: zoneLabel(row.timezone, locale, now),
              }),
            }))}
          />
        )}
      </Card>
    </div>
  );
}
