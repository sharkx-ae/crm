import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { HealthState } from '../../contracts/common.ts';
import type { ProjectsHomeResponse } from '../../contracts/projects.ts';
import { zoneLabel } from '../../lib/i18n/format.ts';
import { Link } from '../../lib/i18n/navigation.ts';
import type { Locale } from '../../lib/i18n/routing.ts';
import { Avatar } from '../ui/avatar.tsx';
import { UserText } from '../ui/bidi.tsx';
import { Card, CardToolbar } from '../ui/card.tsx';
import { Chip } from '../ui/chip.tsx';
import { ClickRow } from '../ui/click-row.tsx';
import { type DotState, Dots } from '../ui/dots.tsx';
import { EmptyState } from '../ui/empty-state.tsx';
import { Icon } from '../ui/icons.tsx';
import { Kpi, KpiStrip } from '../ui/kpi.tsx';
import { Table, Td, Th } from '../ui/table.tsx';
import { ClientsSearch } from './clients-search.tsx';

const DOT: Record<HealthState, DotState> = {
  connected: 'ok',
  needs_attention: 'warn',
  broken: 'bad',
  not_connected: 'off',
};

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
    <div className="flex flex-col gap-6">
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

      <Card flush>
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
          <Table aria-label={t('tableLabel')}>
            <thead>
              <tr>
                <Th>{t('col.client')}</Th>
                <Th num>{t('col.newToday')}</Th>
                <Th num>{t('col.unreplied')}</Th>
                <Th num>{t('col.overdue')}</Th>
                <Th>{t('col.connections')}</Th>
                <Th>
                  <span className="sr-only">{t('col.open')}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
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
                          <span className="block truncate text-label text-sx-muted">
                            {t('place', {
                              city: r.city ?? '',
                              industry: r.industry ?? '',
                              zone: zoneLabel(r.timezone, locale, now),
                            })}
                          </span>
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
        )}
      </Card>
    </div>
  );
}
