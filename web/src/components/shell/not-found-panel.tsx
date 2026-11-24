import { getLocale, getTranslations } from 'next-intl/server';
import { getSession, landingPath } from '../../lib/session.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';

/**
 * "Not found" inside the shell. The same panel for a missing page and one this person may not open, so a client user
 * cannot tell which. The way out is the person's own landing page.
 */
export async function NotFoundPanel() {
  const [t, locale, me] = await Promise.all([
    getTranslations('auth.notFound'),
    getLocale(),
    getSession(),
  ]);
  const href = me?.stage === 'active' ? landingPath(me, locale) : `/${locale}`;
  return (
    <div className="flex justify-center pt-10">
      <Card className="w-full max-w-md text-start">
        <h1 className="mb-3 font-heading text-figure text-sx-black">{t('title')}</h1>
        <p className="mb-6 text-sx-muted">{t('body')}</p>
        <Button asChild variant="primary">
          <a href={href}>{t('cta')}</a>
        </Button>
      </Card>
    </div>
  );
}
