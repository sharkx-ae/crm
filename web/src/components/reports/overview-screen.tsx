import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { OverviewResponse } from '../../contracts/reports.ts';
import type { Formatter } from '../../lib/i18n/format.ts';
import { Card } from '../ui/card.tsx';
import { EmptyState } from '../ui/empty-state.tsx';
import { Kpi, KpiStrip } from '../ui/kpi.tsx';
import { BarChart, peakIndex } from './bar-chart.tsx';
import { foldSources, RankedBars } from './ranked-bars.tsx';
import { WaitingCard } from './waiting-card.tsx';

// Overview (F13a, mockup `viewOverview` minus the PRD hide list: no page title or sub-line, no deltas, no funnel,
// no Won, no cost per SQL). Staff: KPI strip, a "Leads per day" card and a quiet "Leads by source" aside. A client:
// one more tile, the waiting-for-review card first, then both panels quiet under a hairline. No primary button.
// The two panels sit side by side from 1100px (the `wide` breakpoint); below it they stack, so the chart is never
// squeezed into a column narrower than its bars (at 900 to 1100px the rail is open and the content is ~800px).

const CHART_H = { staff: 264, client: 200 } as const;

export async function OverviewScreen({
  data,
  projectId,
  format,
}: {
  data: OverviewResponse;
  projectId: string;
  /** Bound to the user's locale and the client's time zone. */
  format: Formatter;
}) {
  const t = await getTranslations('reports.overview');
  const tDuration = await getTranslations('common.duration');
  const tSource = await getTranslations('common.source');
  const { kpis } = data;
  const client = data.view === 'client';
  const zone = format.zoneLabel();

  const none = (
    <span role="img" aria-label={t('noData')}>
      {format.number(null)}
    </span>
  );
  const median =
    kpis.medianFirstReplyMin === null
      ? none
      : kpis.medianFirstReplyMin === 0
        ? t('underMinute')
        : format.duration(kpis.medianFirstReplyMin, tDuration);
  const rate = (r: number | null) => (r === null ? none : format.percent(r));

  const bars = data.perDay.map((d) => {
    const day = format.plainDay(d.date);
    return { key: d.date, label: day, count: d.count, title: t('perDay.bar', { day, n: d.count }) };
  });
  const peak = peakIndex(bars);
  const perDay = (
    <>
      <PanelHead
        title={t('perDay.title')}
        caption={
          peak >= 0
            ? t('perDay.peak', { n: bars[peak]?.count ?? 0, day: bars[peak]?.label ?? '' })
            : t('perDay.last30')
        }
      />
      <BarChart
        bars={bars}
        heightPx={client ? CHART_H.client : CHART_H.staff}
        label={t('perDay.label', { zone })}
        tableHeads={{ day: t('perDay.tableDay'), value: t('perDay.tableLeads') }}
      />
    </>
  );

  const rows = foldSources(data.bySource);
  const bySource = (
    <>
      <PanelHead title={t('bySource.title')} caption={t('bySource.caption')} />
      {rows.length === 0 ? (
        <EmptyState title={t('bySource.empty')} />
      ) : (
        <RankedBars
          rows={rows}
          format={(n) => format.number(n)}
          labelOf={(r) =>
            r.kind === 'source' ? tSource(r.source) : t('bySource.other', { n: r.sources })
          }
        />
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <KpiStrip>
        <Kpi label={t('kpi.leads30')} value={format.number(kpis.leads30)} />
        <Kpi label={t('kpi.newToday')} value={format.number(kpis.newToday)} />
        <Kpi label={t('kpi.medianReply')} value={median} />
        <Kpi label={t('kpi.mqlRate')} value={rate(kpis.mqlRate)} />
        <Kpi label={t('kpi.sqlRate')} value={rate(kpis.sqlRate)} />
        {data.view === 'client' && (
          <Kpi
            label={t('kpi.waiting')}
            value={format.number(data.kpis.waiting)}
            hot={data.kpis.waiting > 0}
          />
        )}
      </KpiStrip>

      {data.view === 'client' ? (
        <>
          <WaitingCard rows={data.waiting} projectId={projectId} />
          <div className="grid grid-cols-1 gap-6 wide:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className="min-w-0 border-t border-sx-border pt-5">{perDay}</section>
            <section className="min-w-0 border-t border-sx-border pt-5">{bySource}</section>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-6 wide:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card className="min-w-0">{perDay}</Card>
          <section className="min-w-0 wide:pt-[25px]">{bySource}</section>
        </div>
      )}
    </div>
  );
}

function PanelHead({ title, caption }: { title: string; caption: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="m-0 font-heading text-section">{title}</h2>
      <span className="text-end text-label text-sx-muted">{caption}</span>
    </div>
  );
}
