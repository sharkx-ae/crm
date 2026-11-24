'use client';

import { useTranslations } from 'next-intl';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';

/** The generic failure message and a retry. No error text or digest is shown, and nothing is logged here. */
export function ErrorPanel({ reset }: { reset: () => void }) {
  const t = useTranslations('errors');
  const tUi = useTranslations('ui');
  return (
    <div className="flex justify-center pt-10">
      <Card className="w-full max-w-md text-start" role="alert">
        <p className="mb-6 font-heading text-section text-sx-black">{t('INTERNAL')}</p>
        <Button variant="primary" icon="refresh" onClick={reset}>
          {tUi('tryAgain')}
        </Button>
      </Card>
    </div>
  );
}
