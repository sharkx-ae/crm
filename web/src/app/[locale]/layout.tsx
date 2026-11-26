import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { Direction } from 'radix-ui';
import type { ReactNode } from 'react';
import { ToastProvider } from '../../components/ui/toast.tsx';
import { pickModules } from '../../lib/i18n/merge.ts';
import { CLIENT_MODULES } from '../../lib/i18n/request.ts';
import { dirOf, routing } from '../../lib/i18n/routing.ts';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = pickModules(await getMessages(), CLIENT_MODULES);
  const dir = dirOf(locale);

  return (
    <html lang={locale} dir={dir}>
      <body>
        {/* Radix reads the direction from here: arrow keys in menus and tabs, popover sides. */}
        <Direction.DirectionProvider dir={dir}>
          <NextIntlClientProvider messages={messages}>
            <ToastProvider>{children}</ToastProvider>
          </NextIntlClientProvider>
        </Direction.DirectionProvider>
      </body>
    </html>
  );
}
