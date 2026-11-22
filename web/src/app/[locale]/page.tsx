import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { landingPath, requireSession } from '../../lib/session.ts';

// The home address has no screen of its own: everyone goes to where their role lands (F1c landing rule).
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireSession();
  redirect(landingPath(me, locale));
}
