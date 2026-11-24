import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell } from '../../../components/shell/app-shell.tsx';
import { getProjectOptions } from '../../../lib/data/projects.ts';
import { createFormat } from '../../../lib/i18n/format.ts';
import type { Locale } from '../../../lib/i18n/routing.ts';
import { requireSession } from '../../../lib/session.ts';

// The agency works from Dubai: the footer's "today" is Dubai's.
const AGENCY_TIME_ZONE = 'Asia/Dubai';

// Every signed-in screen sits in this frame. It does not protect the pages (a layout cannot see the child segment):
// each page calls guardRoute with its own key.
export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireSession();
  const options = await getProjectOptions();
  const footerDate = createFormat({
    locale: locale as Locale,
    timeZone: AGENCY_TIME_ZONE,
  }).date(new Date().toISOString());

  return (
    <AppShell
      me={{ name: me.name, role: me.role, projectIds: me.projectIds }}
      options={options}
      footerDate={footerDate}
    >
      {children}
    </AppShell>
  );
}
