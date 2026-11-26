import { setRequestLocale } from 'next-intl/server';
import { AddClient } from '../../../../components/clients/add-client.tsx';
import { ClientsHome } from '../../../../components/clients/clients-home.tsx';
import { can } from '../../../../contracts/session.ts';
import { getProjectsHome } from '../../../../lib/data/projects.ts';
import { guardRoute } from '../../../../lib/nav/guard.ts';

// Staff landing page (F2b S1). No page title (the rail marks the page); the one action is "Add client", super
// admin only, at the inline end of the KPI strip. `?new=1` (the switcher's "Add client" link) opens the modal straight away.
export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; new?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await guardRoute('clients');
  const { q, new: openNew } = await searchParams;
  const query = q?.trim().slice(0, 100) || undefined;
  const data = await getProjectsHome(query);
  const canCreate = can(me, 'project.create');

  return (
    <div className="flex flex-col gap-6">
      <ClientsHome
        data={data}
        searching={!!query}
        canCreate={canCreate}
        action={canCreate ? <AddClient defaultOpen={openNew === '1'} /> : null}
      />
    </div>
  );
}
