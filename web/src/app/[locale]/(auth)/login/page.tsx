import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LoginForm } from './login-form.tsx';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reset?: string }>;
}) {
  const { locale } = await params;
  const { reset } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('auth.login');
  return (
    <LoginForm
      resetDone={reset === '1' ? t('resetDone') : undefined}
      resetHref={`/${locale}/reset`}
    />
  );
}
