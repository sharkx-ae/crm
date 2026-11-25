import { getTranslations } from 'next-intl/server';
import { Card } from '../../../../../../components/ui/card.tsx';
import { Skeleton } from '../../../../../../components/ui/skeleton.tsx';

// First load of Contacts: the search and a few rows, announced once for screen readers.
export default async function ContactsLoading() {
  const t = await getTranslations('ui');
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-9 max-w-[340px]" />
      <Card flush>
        <div className="flex flex-col gap-3 p-4 rail:p-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </Card>
    </div>
  );
}
