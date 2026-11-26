'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { AuthHeading } from '../../../../components/auth/auth-heading.tsx';
import { FormError } from '../../../../components/auth/form-error.tsx';
import { PasswordField } from '../../../../components/auth/password-field.tsx';
import {
  authFormClass,
  inputClass,
  labelClass,
  linkClass,
  primaryButtonClass,
} from '../../../../components/auth/ui.ts';
import type { ActionError } from '../../../../lib/action.ts';
import { login } from '../../../../lib/actions/auth.ts';

export function LoginForm({ resetDone, resetHref }: { resetDone?: string; resetHref: string }) {
  const t = useTranslations('auth.login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      // On success the action sets the pending cookie and redirects to /code; it only returns on failure.
      const res = await login({ email, password });
      if (res && !res.ok) setError(res.error);
    });
  }

  // One generic message for a wrong email or password: never which one.
  const wrongCredentials = error?.code === 'UNAUTHENTICATED' || error?.code === 'VALIDATION';

  return (
    <form onSubmit={submit} className={authFormClass} noValidate>
      <AuthHeading title={t('title')}>
        <p>{t('subtitle')}</p>
      </AuthHeading>
      {resetDone ? (
        <p
          role="status"
          className="rounded-xl bg-sx-red-soft p-3 text-sm font-semibold text-sx-black"
        >
          {resetDone}
        </p>
      ) : null}
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
          aria-invalid={wrongCredentials || undefined}
          aria-describedby={error ? 'login-error' : undefined}
          className={inputClass}
        />
      </div>
      <PasswordField
        id="password"
        label={t('password')}
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        describedBy={error ? 'login-error' : undefined}
        invalid={wrongCredentials}
      />
      <FormError
        id="login-error"
        error={wrongCredentials ? null : error}
        override={wrongCredentials ? t('invalid') : undefined}
      />
      <button
        type="submit"
        disabled={pending || !email || !password}
        className={primaryButtonClass}
      >
        {pending ? t('submitting') : t('submit')}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <a href={resetHref} className={linkClass}>
          {t('forgot')}
        </a>
      </div>
    </form>
  );
}
