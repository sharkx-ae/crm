import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing.ts';

// One catalog per module: messages/<locale>/<module>.json. Add the module name here when its file exists.
// Messages are namespaced by module: t('common.hello') or getTranslations('common').
export const MESSAGE_MODULES = ['common', 'auth', 'errors'] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  // A module without a catalog for this locale falls back to English (AR/FR arrive in the D18 batch).
  const load = async (loc: string, m: string) =>
    (await import(`../../../messages/${loc}/${m}.json`)).default;
  const entries = await Promise.all(
    MESSAGE_MODULES.map(
      async (m) => [m, await load(locale, m).catch(() => load('en', m))] as const,
    ),
  );
  return { locale, messages: Object.fromEntries(entries) };
});
