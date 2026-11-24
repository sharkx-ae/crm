import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getSession, landingPath } from '../../../lib/session.ts';

// Split screen from the mockup (web plan §2.2): a red cover at the inline start with the primary lockup, the tagline
// (cover only, brand rule) and the footer line; the white form column at the inline end (form box max 400px).
// Under 900px the cover stacks on top as a short band. Signed-in visitors never see these screens: they go to the
// landing rule. A pending (code step) visitor is let through: /code, logout and the sign-in screens are theirs.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const [me, locale, t] = await Promise.all([
    getSession(),
    getLocale(),
    getTranslations('auth.brand'),
  ]);
  if (me?.stage === 'active') redirect(landingPath(me, locale));

  return (
    <div className="flex min-h-dvh flex-col bg-sx-paper text-sx-black rail:flex-row">
      <section
        aria-label={t('coverLabel')}
        className="flex flex-col justify-between gap-6 bg-sx-red ps-6 pe-6 py-6 text-white rail:w-1/2 rail:ps-12 rail:pe-12 rail:py-10"
      >
        {/* Logo from skills/sharkx-brand-guidelines/assets/logos (copied to public/brand) */}
        <Image
          src="/brand/logo-primary-red-bg.png"
          alt={t('logoAlt')}
          width={1200}
          height={400}
          className="h-auto w-36 rail:w-52"
          priority
        />
        <p className="hidden max-w-md font-heading text-hero leading-tight rail:block">
          {t('tagline')}
        </p>
        <p className="hidden text-label text-white rail:block">{t('footer')}</p>
      </section>
      <main className="flex flex-1 items-center justify-center ps-4 pe-4 py-10 rail:ps-12 rail:pe-12">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
