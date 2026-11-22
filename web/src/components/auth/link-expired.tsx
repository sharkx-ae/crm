import { getLocale, getTranslations } from 'next-intl/server';
import { StatusPanel } from './status-panel.tsx';

// One page for an expired, used or forged invite or reset link: it never says which.
export async function LinkExpired() {
  const [t, locale] = await Promise.all([getTranslations('auth.expired'), getLocale()]);
  return (
    <StatusPanel
      title={t('title')}
      body={t('body')}
      cta={{ href: `/${locale}/login`, label: t('cta') }}
    />
  );
}
