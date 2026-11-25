import { setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { LeadsWorkspace } from '../../../../../../components/leads/leads-workspace.tsx';
import { getLead, getLeads } from '../../../../../../lib/data/leads.ts';
import { parseLeadFilters } from '../../../../../../lib/leads-url.ts';
import { guardRoute } from '../../../../../../lib/nav/guard.ts';

// Leads (F4b): staff see every client's leads one client at a time, a client user its own with a reduced shape. The
// address is the state (?tab&q&source&owner&limit&lead); the api does the filtering, counting and paging.
export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, projectId } = await params;
  setRequestLocale(locale);
  const me = await guardRoute('leads', projectId);
  const raw = await searchParams;
  const filters = parseLeadFilters(raw, { client: me.role === 'client' });
  const asked = Array.isArray(raw.lead) ? raw.lead[0] : raw.lead;
  const leadId = z.uuid().safeParse(asked).success ? (asked as string) : null;

  const [data, detail] = await Promise.all([
    getLeads(projectId, filters),
    leadId ? getLead(projectId, leadId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <LeadsWorkspace
        projectId={projectId}
        data={data}
        filters={filters}
        detail={detail}
        leadId={leadId}
        leadMissing={Boolean(leadId) && detail === null}
      />
    </div>
  );
}
