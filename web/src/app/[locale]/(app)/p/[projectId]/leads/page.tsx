import { setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { LeadsWorkspace } from '../../../../../../components/leads/leads-workspace.tsx';
import { getLead, getLeads } from '../../../../../../lib/data/leads.ts';
import { parseLeadFilters } from '../../../../../../lib/leads-url.ts';
import { guardRoute } from '../../../../../../lib/nav/guard.ts';
import { lastPage } from '../../../../../../lib/paging.ts';

// Leads (F4b): staff see every client's leads one client at a time, a client user its own with a reduced shape. The
// address is the state (?tab&q&source&owner&page&size&lead); the api does the filtering, counting and paging.
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
  const asked = parseLeadFilters(raw, { client: me.role === 'client' });
  const wanted = Array.isArray(raw.lead) ? raw.lead[0] : raw.lead;
  const leadId = z.uuid().safeParse(wanted).success ? (wanted as string) : null;

  const [first, detail] = await Promise.all([
    getLeads(projectId, asked),
    leadId ? getLead(projectId, leadId) : Promise.resolve(null),
  ]);

  // A page past the end (a stale link, a filter that shrank the list): show the last page now, and let the client
  // correct the address. An empty list has only a page 1, so nothing needs fetching again.
  const last = lastPage(first.total, asked.size);
  const pageClamped = asked.page > last;
  const filters = pageClamped ? { ...asked, page: last } : asked;
  const data = pageClamped && first.total > 0 ? await getLeads(projectId, filters) : first;

  return (
    <div className="flex flex-col gap-6">
      <LeadsWorkspace
        me={me}
        projectId={projectId}
        data={data}
        filters={filters}
        detail={detail}
        leadId={leadId}
        leadMissing={Boolean(leadId) && detail === null}
        pageClamped={pageClamped}
      />
    </div>
  );
}
