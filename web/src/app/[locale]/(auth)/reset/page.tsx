import { setRequestLocale } from 'next-intl/server';
import { RequestForm } from './request-form.tsx';

export default async function ResetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <RequestForm loginHref={`/${locale}/login`} />;
}
