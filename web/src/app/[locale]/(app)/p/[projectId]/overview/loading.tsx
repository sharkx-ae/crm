import { getTranslations } from 'next-intl/server';
import { Card } from '../../../../../../components/ui/card.tsx';
import { Skeleton } from '../../../../../../components/ui/skeleton.tsx';

// First load of the Overview: the KPI strip and the chart card at their real heights, so nothing jumps: the strip is
// ~58px a row (the tiles stack two to a row under 900px, a little taller), the chart card is its 24px padding, the
// 36px panel head, the 24px of room above the plot, the 264px plot and the 28px axis row. Same 1100px breakpoint as
// the screen.
export default async function OverviewLoading() {
  const t = await getTranslations('ui');
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{t('loading')}</span>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rail:flex rail:gap-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton
            key={i}
            className={
              i === 0
                ? 'col-span-full h-[88px] rail:h-[58px] rail:flex-[1.2]'
                : 'h-[78px] rail:h-[58px] rail:flex-1'
            }
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 wide:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <Skeleton className="mb-3 h-6 w-40" />
          <Skeleton className="h-[288px]" />
          <Skeleton className="mt-2 h-5" />
        </Card>
        <div className="flex flex-col gap-4 wide:pt-[25px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      </div>
    </div>
  );
}
