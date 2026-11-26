import { getTranslations } from 'next-intl/server';
import { Card } from '../../../../../../components/ui/card.tsx';
import { Skeleton } from '../../../../../../components/ui/skeleton.tsx';

// First load of the Overview: the KPI strip and the chart card at their real heights, so nothing jumps.
export default async function OverviewLoading() {
  const t = await getTranslations('ui');
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{t('loading')}</span>
      <div className="grid grid-cols-2 gap-4 rail:flex">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 rail:flex-1" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 rail:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <Skeleton className="mb-4 h-5 w-40" />
          <Skeleton className="h-[264px]" />
        </Card>
        <div className="flex flex-col gap-4 rail:pt-[25px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      </div>
    </div>
  );
}
