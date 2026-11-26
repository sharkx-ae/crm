import { getTranslations } from 'next-intl/server';
import { Card } from '../../../components/ui/card.tsx';
import { Skeleton } from '../../../components/ui/skeleton.tsx';

// While a page loads: a KPI strip and one card, announced once for screen readers.
export default async function AppLoading() {
  const t = await getTranslations('ui');
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{t('loading')}</span>
      <div className="grid grid-cols-2 gap-4 wide:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Card>
        <Skeleton className="mb-4 h-5 w-40" />
        <Skeleton className="h-48" />
      </Card>
    </div>
  );
}
