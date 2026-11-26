import type { ReactNode } from 'react';
import { SettingsTabs } from '../../../../../../components/settings/settings-tabs.tsx';

// Client settings (staff): link tabs above each settings page. Each page still guards itself (guardRoute).
export default async function SettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string; projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <SettingsTabs projectId={projectId} />
      {children}
    </div>
  );
}
