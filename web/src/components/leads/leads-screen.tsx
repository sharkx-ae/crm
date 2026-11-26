'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ClientLeadRow, LeadsPage, LeadTab } from '../../contracts/leads.ts';
import { useProjectFormat } from '../../lib/i18n/use-project-format.ts';
import type { LeadFilters } from '../../lib/leads-url.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { EmptyState } from '../ui/empty-state.tsx';
import { Pagination } from '../ui/pagination.tsx';
import { type TabKeyTone, Tabs, TabsList, TabsPanel, TabsTrigger } from '../ui/tabs.tsx';
import { LeadsTable } from './leads-table.tsx';
import { LeadsToolbar } from './leads-toolbar.tsx';
import { StatusBar } from './status-bar.tsx';

type Tab = { value: LeadTab; label: string; count: number; tone?: TabKeyTone; hot?: boolean };

/**
 * One flush card (mockup `card flush`): state bar, ribbon tabs, toolbar, table. The client's tabs start with "Waiting
 * for review" (the same filter as Unreviewed). Nothing here filters or slices: `data` is what the api returned for the
 * address: one page of it, with the footer that moves between pages.
 */
export function LeadsScreen({
  data,
  filters,
  onChange,
  hrefFor,
  pageHref,
  renderMark,
  actions,
}: {
  data: LeadsPage;
  filters: LeadFilters;
  onChange: (change: Partial<LeadFilters>) => void;
  hrefFor: (id: string) => string;
  /** The address of another page of this same view. */
  pageHref: (page: number) => string;
  renderMark?: (row: ClientLeadRow) => ReactNode;
  /** Export: sits in the filter row so the table gets the height. */
  actions?: ReactNode;
}) {
  const t = useTranslations('leads');
  const tStatus = useTranslations('common.status');
  const format = useProjectFormat();
  const staff = data.view === 'staff';
  const c = data.counts;

  const unreviewed: Tab = {
    value: 'unreviewed',
    label: staff ? t('tabs.unreviewed') : t('tabs.waiting'),
    count: c.unreviewed,
    tone: 'new',
    hot: c.unreviewed > 0,
  };
  const all: Tab = { value: 'all', label: t('tabs.all'), count: c.all };
  const rest: Tab[] = [
    { value: 'mql', label: t('tabs.mql'), count: c.mql, tone: 'mql' },
    { value: 'sql', label: t('tabs.sql'), count: c.sql, tone: 'sql' },
    { value: 'not_qualified', label: t('tabs.not_qualified'), count: c.not_qualified, tone: 'nq' },
  ];
  const tabs = staff ? [all, unreviewed, ...rest] : [unreviewed, all, ...rest];

  const filtered = Boolean(filters.q || filters.source || filters.owner);
  const nothingYet = c.all === 0 && !filtered;

  return (
    <Card flush fill>
      <StatusBar
        label={t('statusBar')}
        segments={[
          { key: 'new', count: c.unreviewed, label: tStatus('new') },
          { key: 'mql', count: c.mql, label: tStatus('mql') },
          { key: 'sql', count: c.sql, label: tStatus('sql') },
          { key: 'nq', count: c.not_qualified, label: tStatus('not_qualified') },
        ]}
      />
      <Tabs
        value={filters.tab}
        onValueChange={(tab) => onChange({ tab: tab as LeadTab })}
        variant="ribbon"
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList label={t('tabs.label')}>
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              count={format.number(tab.count)}
              keyTone={tab.tone}
              hot={tab.hot}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <LeadsToolbar
          filters={filters}
          sources={data.sources}
          owners={data.view === 'staff' ? data.owners : null}
          onChange={onChange}
          actions={actions}
        />
        <TabsPanel value={filters.tab} className="flex min-h-0 flex-1 flex-col">
          {data.rows.length === 0 ? (
            nothingYet ? (
              <EmptyState title={t('empty.noneTitle')} body={t('empty.noneBody')} />
            ) : (
              <EmptyState
                title={t('empty.matchTitle')}
                body={t('empty.matchBody')}
                action={
                  <Button onClick={() => onChange({ tab: 'all', q: '', source: '', owner: '' })}>
                    {t('empty.clear')}
                  </Button>
                }
              />
            )
          ) : (
            <LeadsTable
              rows={data.rows}
              staff={staff}
              hrefFor={hrefFor}
              renderMark={renderMark}
              sort={{ sort: filters.sort, dir: filters.dir }}
              onSort={(s) => onChange({ sort: s.sort, dir: s.dir })}
            />
          )}
        </TabsPanel>
      </Tabs>
      {data.rows.length > 0 ? (
        <Pagination
          page={filters.page}
          size={filters.size}
          total={data.total}
          shown={data.rows.length}
          hrefFor={pageHref}
          onSizeChange={(size) => onChange({ size: size as LeadFilters['size'] })}
        />
      ) : null}
    </Card>
  );
}
