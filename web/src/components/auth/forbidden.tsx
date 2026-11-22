import { getLocale, getTranslations } from 'next-intl/server';
import { StatusPanel } from './status-panel.tsx';

// "You do not have access". John's role-gated pages render this when can() says no for a page the user can see exists.
// For a project that is not the client's own, use notFound() instead: the answer must not reveal that it exists.
export async function Forbidden() {
  const [t, locale] = await Promise.all([getTranslations('auth.forbidden'), getLocale()]);
  return (
    <StatusPanel
      title={t('title')}
      body={t('body')}
      cta={{ href: `/${locale}`, label: t('cta') }}
    />
  );
}
