import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LinkExpired } from '../../../../../components/auth/link-expired.tsx';
import { inspectInvite } from '../../../../../lib/data/users.ts';
import { AcceptForm } from './accept-form.tsx';

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const info = await inspectInvite(token);
  if (!info) return <LinkExpired />;
  const t = await getTranslations('auth.accept');

  const project = info.projectName ?? 'none';
  const intro = info.inviterName
    ? t('invitedBy', { inviter: info.inviterName, project })
    : t('invitedGeneric', { project });

  return (
    <AcceptForm
      token={token}
      title={t('title')}
      intro={intro}
      hello={t('hello', { name: info.name })}
    />
  );
}
