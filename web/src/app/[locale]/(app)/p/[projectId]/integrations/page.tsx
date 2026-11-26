import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { WhatsAppCard } from '../../../../../../components/integrations/whatsapp-card.tsx';
import { getProject } from '../../../../../../lib/data/projects.ts';
import { getWaNumbers } from '../../../../../../lib/data/whatsapp.ts';
import { getMetaWebEnv } from '../../../../../../lib/env.ts';
import { guardRoute } from '../../../../../../lib/nav/guard.ts';

// Integrations (F3a, TEMPORARY): the WhatsApp connect card and the connected numbers. F14b replaces this page with the
// hub card and the generic wizard. The proxy relaxes the CSP for the Facebook SDK on this path only; the SDK script
// carries the request's nonce (read from `x-nonce`, which the proxy sets), as 'strict-dynamic' requires.
export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ locale: string; projectId: string }>;
}) {
  const { locale, projectId } = await params;
  setRequestLocale(locale);
  await guardRoute('integrations', projectId);
  const [project, wa, requestHeaders] = await Promise.all([
    getProject(projectId),
    getWaNumbers(projectId),
    headers(),
  ]);
  if (!project) notFound();

  return (
    <WhatsAppCard
      projectId={projectId}
      numbers={wa.numbers}
      connect={wa.connect}
      meta={getMetaWebEnv()}
      nonce={requestHeaders.get('x-nonce') ?? undefined}
      timeZone={project.timezone}
    />
  );
}
