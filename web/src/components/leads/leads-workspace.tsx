'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useTransition } from 'react';
import type { LeadDetail, LeadsPage } from '../../contracts/leads.ts';
import { usePathname, useRouter } from '../../lib/i18n/navigation.ts';
import { type LeadFilters, leadsSearch } from '../../lib/leads-url.ts';
import { useAutoRefresh } from '../../lib/use-auto-refresh.ts';
import { useToast } from '../ui/toast.tsx';
import { ClientMarkCell } from './client-mark-cell.tsx';
import { LeadDrawer } from './lead-drawer.tsx';
import { LeadsScreen } from './leads-screen.tsx';
import { RefreshPauseProvider, useRefreshPaused } from './refresh-pause.tsx';

const REFRESH_MS = 5000;

/**
 * The client side of the Leads page: the address is the state (filters and the open lead), the page re-renders on
 * the server, and the data refreshes itself every 5 s (F4b D2). The server page passes everything in as props.
 */
export function LeadsWorkspace(props: {
  projectId: string;
  data: LeadsPage;
  filters: LeadFilters;
  /** The lead the address names, when it exists; the drawer shows it. */
  detail: LeadDetail | null;
  /** The address named a lead that is gone: say so once and drop it from the address. */
  leadMissing: boolean;
  leadId: string | null;
}) {
  return (
    <RefreshPauseProvider>
      <Workspace {...props} />
    </RefreshPauseProvider>
  );
}

function Workspace({
  projectId,
  data,
  filters,
  detail,
  leadMissing,
  leadId,
}: {
  projectId: string;
  data: LeadsPage;
  filters: LeadFilters;
  detail: LeadDetail | null;
  leadMissing: boolean;
  leadId: string | null;
}) {
  const t = useTranslations('leads');
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const heldByAction = useRefreshPaused();

  const go = (change: Partial<LeadFilters> & { lead?: string | null }) =>
    start(() =>
      router.replace(`${pathname}${leadsSearch(filters, change, leadId)}`, { scroll: false }),
    );

  useAutoRefresh({
    intervalMs: REFRESH_MS,
    paused: pending || heldByAction,
    onRefresh: () => start(() => router.refresh()),
  });

  // Once per missing lead: after the replace the address no longer names it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a missing lead appears, not on every filter change
  useEffect(() => {
    if (!leadMissing) return;
    toast(t('toast.gone'));
    router.replace(`${pathname}${leadsSearch(filters, { lead: null }, leadId)}`, { scroll: false });
  }, [leadMissing, leadId]);

  const client = data.view === 'client';

  return (
    <>
      {client ? (
        <p className="text-sx-muted">
          {t('waitingLine', { n: data.counts.unreviewed, total: data.counts.all })}
        </p>
      ) : null}
      <LeadsScreen
        data={data}
        filters={filters}
        onChange={go}
        hrefFor={(id) => `${pathname}${leadsSearch(filters, { lead: id }, leadId)}`}
        // A client marks from the table (mockup `markInline`): only a lead still waiting shows the buttons.
        renderMark={
          client ? (row) => <ClientMarkCell row={row} projectId={projectId} /> : undefined
        }
      />
      {detail ? (
        <LeadDrawer
          key={detail.lead.id}
          detail={detail}
          projectId={projectId}
          onClose={() => go({ lead: null })}
        />
      ) : null}
    </>
  );
}
