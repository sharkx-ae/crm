import { getTranslations } from 'next-intl/server';
import { Card } from '../ui/card.tsx';
import { EmptyState } from '../ui/empty-state.tsx';

/** A landing screen whose real content arrives with a later spec (clients home F2b, overview F13a). */
export async function Placeholder() {
  const t = await getTranslations('shell.placeholder');
  return (
    <Card>
      <EmptyState title={t('title')} body={t('body')} />
    </Card>
  );
}
