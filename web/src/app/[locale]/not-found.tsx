import { getLocale, getTranslations } from 'next-intl/server';
import { StatusPanel } from '../../components/auth/status-panel.tsx';

// The same page for "does not exist" and "not yours": a client must not learn which.
export default async function NotFound() {
  const [t, locale] = await Promise.all([getTranslations('auth.notFound'), getLocale()]);
  return (
    <StatusPanel
      fullPage
      title={t('title')}
      body={t('body')}
      cta={{ href: `/${locale}`, label: t('cta') }}
    />
  );
}
