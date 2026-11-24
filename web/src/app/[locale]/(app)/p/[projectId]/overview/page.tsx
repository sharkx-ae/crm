import { setRequestLocale } from 'next-intl/server';
import { Placeholder } from '../../../../../../components/shell/placeholder.tsx';
import { guardRoute } from '../../../../../../lib/nav/guard.ts';

// A client user's landing page and the first screen of every client. Placeholder until F13a.
export default async function OverviewPage({
  params,
}: {
  params: Promise<{ locale: string; projectId: string }>;
}) {
  const { locale, projectId } = await params;
  setRequestLocale(locale);
  await guardRoute('overview', projectId);
  return <Placeholder />;
}
