import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getSession, landingPath } from '../../../lib/session.ts';

// Centered brand card on a light canvas. Signed-in visitors never see these screens: they go to the landing rule.
// A pending (code step) visitor is let through: /code, logout and the sign-in screens are theirs.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const [me, locale, t] = await Promise.all([
    getSession(),
    getLocale(),
    getTranslations('auth.brand'),
  ]);
  if (me?.stage === 'active') redirect(landingPath(me, locale));

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-sx-page ps-4 pe-4 py-8 text-sx-black">
      {/* Logo from skills/sharkx-brand-guidelines/assets/logos (copied to public/brand) */}
      <Image
        src="/brand/logo-red-on-white.png"
        alt={t('logoAlt')}
        width={1600}
        height={320}
        className="mb-8 h-auto w-44"
        priority
      />
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
