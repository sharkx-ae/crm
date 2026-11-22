import { setRequestLocale } from 'next-intl/server';
import { LinkExpired } from '../../../../../components/auth/link-expired.tsx';
import { ResetForm } from './reset-form.tsx';

export default async function ResetTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ expired?: string }>;
}) {
  const { locale, token } = await params;
  const { expired } = await searchParams;
  setRequestLocale(locale);
  // The api has no "is this link good" call for resets (it would be an oracle): the submit finds out.
  if (expired === '1') return <LinkExpired />;
  return <ResetForm token={token} />;
}
