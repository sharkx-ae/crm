import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { withFallback } from './merge.ts';
import { routing } from './routing.ts';

// One catalog per module: messages/<locale>/<module>.json. Add the module name here when its file exists.
// Messages are namespaced by module: t('common.hello') or getTranslations('common').
export const MESSAGE_MODULES = [
  'common',
  'ui',
  'shell',
  'auth',
  'errors',
  'leads',
  'contacts',
  'projects',
  'team',
  'reports',
] as const;

// The modules the browser receives (NextIntlClientProvider). Add one when a client component starts using it.
export const CLIENT_MODULES = [
  'common',
  'ui',
  'shell',
  'auth',
  'errors',
  'leads',
  'contacts',
  'projects',
  'team',
  'reports',
] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const load = async (loc: string, m: string) =>
    (await import(`../../../messages/${loc}/${m}.json`)).default;
  // A module or key missing for this locale falls back to English (AR/FR arrive in the D18 batch).
  const entries = await Promise.all(
    MESSAGE_MODULES.map(async (m) => {
      const en = await load('en', m);
      if (locale === 'en') return [m, en] as const;
      const own = await load(locale, m).catch(() => ({}));
      return [m, withFallback(en, own)] as const;
    }),
  );
  return { locale, messages: Object.fromEntries(entries) };
});
