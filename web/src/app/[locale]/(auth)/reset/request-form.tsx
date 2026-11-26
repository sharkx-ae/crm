'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { AuthHeading } from '../../../../components/auth/auth-heading.tsx';
import { FormError } from '../../../../components/auth/form-error.tsx';
import {
  authFormClass,
  inputClass,
  labelClass,
  linkClass,
  primaryButtonClass,
} from '../../../../components/auth/ui.ts';
import type { ActionError } from '../../../../lib/action.ts';
import { requestReset } from '../../../../lib/actions/auth.ts';

export function RequestForm({ loginHref }: { loginHref: string }) {
  const t = useTranslations('auth.reset');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<ActionError | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await requestReset({ email });
      if (res.ok) setSent(true);
      else setError(res.error);
    });
  }

  if (sent) {
    // The same message whether or not an account exists.
    return (
      <section className={authFormClass}>
        <AuthHeading title={t('title')} />
        <p role="status" className="text-body text-sx-black">
          {t('sent')}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <a href={loginHref} className={linkClass}>
            {t('back')}
          </a>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className={authFormClass} noValidate>
      <AuthHeading title={t('title')}>
        <p>{t('intro')}</p>
      </AuthHeading>
      <div>
        <label htmlFor="email" className={labelClass}>
          {t('email')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? 'reset-error' : undefined}
          className={inputClass}
        />
      </div>
      <FormError id="reset-error" error={error} />
      <button type="submit" disabled={pending || !email} className={primaryButtonClass}>
        {pending ? t('submitting') : t('submit')}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <a href={loginHref} className={linkClass}>
          {t('back')}
        </a>
      </div>
    </form>
  );
}
