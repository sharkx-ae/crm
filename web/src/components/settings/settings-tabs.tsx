'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '../../lib/i18n/navigation.ts';
import { SETTINGS_TABS } from '../../lib/settings/tabs.ts';

// Link tabs (the URL is the state, so each tab is a real page). Underlined text, the current one in red (mockup).
export function SettingsTabs({ projectId }: { projectId: string }) {
  const t = useTranslations('projects.settings');
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('tabsLabel')}
      className="flex gap-6 overflow-x-auto border-b border-sx-border"
    >
      {SETTINGS_TABS.map((tab) => {
        const href = `/p/${projectId}/settings/${tab.slug}`;
        const current = pathname === href;
        return (
          <Link
            key={tab.slug}
            href={href}
            aria-current={current ? 'page' : undefined}
            className="focus-ring -mb-px whitespace-nowrap border-b-2 border-transparent py-2.5 font-label text-sx-muted no-underline hover:text-sx-black aria-[current=page]:border-sx-red aria-[current=page]:font-heading aria-[current=page]:text-sx-black"
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
