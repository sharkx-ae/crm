import { setRequestLocale } from 'next-intl/server';
import { maskEmail } from '../../../../lib/mask.ts';
import { requireSession } from '../../../../lib/session.ts';
import { CodeForm } from './code-form.tsx';

export default async function CodePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // No session, or an expired pending one, goes to /login; an active one never gets here (the layout redirects).
  const me = await requireSession({ allowPending: true });
  return <CodeForm maskedEmail={maskEmail(me.email)} loginHref={`/${locale}/login`} />;
}
