import { getTranslations } from 'next-intl/server';
import { Card } from '../../../../../../components/ui/card.tsx';
import { Skeleton } from '../../../../../../components/ui/skeleton.tsx';

// First load of the Leads screen: the state bar, the tabs and a few rows, announced once for screen readers.
export default async function LeadsLoading() {
  const t = await getTranslations('ui');
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{t('loading')}</span>
      <Card flush>
        <Skeleton className="mx-4 mt-5 mb-4 h-2 rail:mx-6" />
        <Skeleton className="mx-4 mb-4 h-14 rail:mx-6" />
        <div className="flex flex-col gap-3 ps-4 pe-4 pb-6 rail:ps-6 rail:pe-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </Card>
    </div>
  );
}
