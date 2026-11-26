import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { OverviewRefresh } from '../../../../../../components/reports/overview-refresh.tsx';
import { OverviewScreen } from '../../../../../../components/reports/overview-screen.tsx';
import { getProject } from '../../../../../../lib/data/projects.ts';
import { getOverview } from '../../../../../../lib/data/reports.ts';
import { createFormat } from '../../../../../../lib/i18n/format.ts';
import type { Locale } from '../../../../../../lib/i18n/routing.ts';
import { guardRoute } from '../../../../../../lib/nav/guard.ts';

// Overview (F13a): a client user's landing page and the first screen of every client for staff. The api picks the
// staff or client shape; numbers and days are in the client's own time zone.
export default async function OverviewPage({
  params,
}: {
  params: Promise<{ locale: string; projectId: string }>;
}) {
  const { locale, projectId } = await params;
  setRequestLocale(locale);
  await guardRoute('overview', projectId);
  // getProject is deduped with the layout's call within this request (React cache, never across requests).
  const [data, project] = await Promise.all([getOverview(projectId), getProject(projectId)]);
  if (!project) notFound();
  const format = createFormat({ locale: locale as Locale, timeZone: project.timezone });

  return (
    <OverviewRefresh>
      <OverviewScreen data={data} projectId={projectId} format={format} />
    </OverviewRefresh>
  );
}
