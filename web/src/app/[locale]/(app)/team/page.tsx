import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card } from '../../../../components/ui/card.tsx';
import { InviteUser } from '../../../../components/users/invite-user.tsx';
import { UsersTable } from '../../../../components/users/users-table.tsx';
import { getUsers } from '../../../../lib/data/users.ts';
import { guardRoute } from '../../../../lib/nav/guard.ts';

// Team (F2b S3, super admin): the SHARKX managers. The super admin is not in this list (and cannot disable itself).
export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await guardRoute('team');
  const [t, managers] = await Promise.all([
    getTranslations('team.managers'),
    getUsers({ kind: 'manager' }),
  ]);

  return (
    <Card flush>
      <div className="flex flex-wrap items-start justify-between gap-3 ps-4 pe-4 pt-4 pb-3 rail:ps-6 rail:pe-6 rail:pt-5">
        <div>
          <h2 className="font-heading text-section text-sx-black">{t('title')}</h2>
          <p className="text-label text-sx-muted">{t('help')}</p>
        </div>
        <InviteUser
          kind="manager"
          label={t('invite')}
          title={t('inviteTitle')}
          description={t('inviteDescription')}
        />
      </div>
      <UsersTable users={managers} emptyText={t('empty')} />
    </Card>
  );
}
