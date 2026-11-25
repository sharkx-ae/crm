import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card } from '../../../../../../../components/ui/card.tsx';
import { InviteUser } from '../../../../../../../components/users/invite-user.tsx';
import { UsersTable } from '../../../../../../../components/users/users-table.tsx';
import { can } from '../../../../../../../contracts/session.ts';
import { getProject } from '../../../../../../../lib/data/projects.ts';
import { getUsers } from '../../../../../../../lib/data/users.ts';
import { guardRoute } from '../../../../../../../lib/nav/guard.ts';

// Client settings → Client users (F10a S2, staff): one client's users. Invite, Disable and Enable go through Alex's
// F1c actions, which check can('clientuser.manage') and write the audit rows; a client user never reaches this page.
export default async function ClientUsersPage({
  params,
}: {
  params: Promise<{ locale: string; projectId: string }>;
}) {
  const { locale, projectId } = await params;
  setRequestLocale(locale);
  const me = await guardRoute('settings', projectId);
  const project = await getProject(projectId);
  if (!project) notFound();
  const [t, users] = await Promise.all([
    getTranslations('team.clientUsers'),
    getUsers({ kind: 'client', projectId }),
  ]);

  return (
    <Card flush>
      <div className="flex flex-wrap items-start justify-between gap-3 ps-4 pe-4 pt-4 pb-3 rail:ps-6 rail:pe-6 rail:pt-5">
        <div>
          <h2 className="font-heading text-section text-sx-black">{t('title')}</h2>
          <p className="text-label text-sx-muted">{t('help')}</p>
        </div>
        {can(me, 'clientuser.manage', projectId) ? (
          <InviteUser
            kind="client"
            projectId={projectId}
            label={t('invite')}
            title={t('inviteTitle')}
            description={t('inviteDescription', { name: project.name })}
          />
        ) : null}
      </div>
      <UsersTable users={users} emptyText={t('empty')} tone="soft" />
    </Card>
  );
}
