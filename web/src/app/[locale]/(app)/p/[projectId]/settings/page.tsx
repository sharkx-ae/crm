import { setRequestLocale } from 'next-intl/server';
import { redirect } from '../../../../../../lib/i18n/navigation.ts';
import { guardRoute } from '../../../../../../lib/nav/guard.ts';
import { SETTINGS_TABS } from '../../../../../../lib/settings/tabs.ts';

// /p/<id>/settings opens the first settings tab (Client users, F10a).
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string; projectId: string }>;
}) {
  const { locale, projectId } = await params;
  setRequestLocale(locale);
  await guardRoute('settings', projectId);
  redirect({ href: `/p/${projectId}/settings/${SETTINGS_TABS[0].slug}`, locale });
}
