import { setRequestLocale } from 'next-intl/server';
import { Placeholder } from '../../../../components/shell/placeholder.tsx';
import { guardRoute } from '../../../../lib/nav/guard.ts';

// Staff landing page. Placeholder until the clients home (F2b) lands; it exists now so sign-in has somewhere to go.
export default async function ClientsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await guardRoute('clients');
  return <Placeholder />;
}
