import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { HoursForm } from '../../../../../../../components/settings/hours-form.tsx';
import { getProject } from '../../../../../../../lib/data/projects.ts';
import { guardRoute } from '../../../../../../../lib/nav/guard.ts';

// Client settings → Business hours (F2b S4, staff). Reply timers (F12) read these windows.
export default async function HoursPage({
  params,
}: {
  params: Promise<{ locale: string; projectId: string }>;
}) {
  const { locale, projectId } = await params;
  setRequestLocale(locale);
  await guardRoute('settings', projectId);
  const project = await getProject(projectId);
  if (!project) notFound();
  return (
    <HoursForm
      projectId={project.id}
      timezone={project.timezone}
      businessHours={project.businessHours}
    />
  );
}
