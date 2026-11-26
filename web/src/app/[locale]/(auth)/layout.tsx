import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getSession, landingPath } from '../../../lib/session.ts';

// Split screen from the mockup (`.auth`): two equal columns from 900px. The red cover at the inline start holds the
// primary lockup, the headline with its one-sentence description (cover only, brand rule) and the footer line; the
// white form column at the inline end centres a 400px box. Under 900px the cover is a short band (logo, headline and
// footer; the description is hidden) so the form stays above the fold at 360px. Signed-in visitors never see these
// screens: they go to the landing rule. A pending (code step) visitor is let through: /code, logout and the sign-in
// screens are theirs.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const [me, locale, t] = await Promise.all([
    getSession(),
    getLocale(),
    getTranslations('auth.brand'),
  ]);
  if (me?.stage === 'active') redirect(landingPath(me, locale));

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-sx-paper text-sx-black rail:grid-cols-2">
      <section
        aria-label={t('coverLabel')}
        className="flex min-w-0 flex-col justify-between gap-5 bg-sx-red p-7 text-white rail:gap-8 rail:p-12"
      >
        {/* Logo from skills/sharkx-brand-guidelines/assets/logos (copied to public/brand) */}
        <Image
          src="/brand/logo-primary-red-bg.png"
          alt={t('logoAlt')}
          width={1200}
          height={400}
          className="block h-auto w-[min(360px,70%)]"
          priority
        />
        <div>
          <p className="max-w-[14ch] font-display text-[clamp(28px,3.6vw,44px)] leading-[1.08]">
            {t('tagline')}
          </p>
          <p className="mt-4 hidden max-w-[44ch] text-section rail:block">{t('description')}</p>
        </div>
        <p className="text-label text-white">{t('footer')}</p>
      </section>
      <main className="grid min-w-0 grid-cols-[minmax(0,1fr)] place-items-center px-6 py-8">
        <div className="flex w-[min(400px,100%)] flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}
