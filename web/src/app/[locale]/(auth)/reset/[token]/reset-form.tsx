'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { AuthHeading } from '../../../../../components/auth/auth-heading.tsx';
import { FormError } from '../../../../../components/auth/form-error.tsx';
import { PasswordField } from '../../../../../components/auth/password-field.tsx';
import { PasswordRules, passwordOk } from '../../../../../components/auth/password-rules.tsx';
import { authFormClass, primaryButtonClass } from '../../../../../components/auth/ui.ts';
import type { ActionError } from '../../../../../lib/action.ts';
import { resetPassword } from '../../../../../lib/actions/auth.ts';

export function ResetForm({ token }: { token: string }) {
  const t = useTranslations('auth.reset');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useTransition();
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = passwordOk(password) && password === confirm && !pending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    start(async () => {
      // Success redirects to /login?reset=1; a dead link redirects to the expired page.
      const res = await resetPassword({ token, password });
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className={authFormClass} noValidate>
      <AuthHeading title={t('newTitle')}>
        <p>{t('newIntro')}</p>
      </AuthHeading>
      <div>
        <PasswordField
          id="new-password"
          label={t('password')}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          describedBy="password-rules"
        />
        <PasswordRules id="password-rules" value={password} />
      </div>
      <div>
        <PasswordField
          id="confirm-password"
          label={t('confirm')}
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          describedBy={mismatch ? 'confirm-error' : undefined}
          invalid={mismatch}
        />
        <FormError
          error={null}
          id="confirm-error"
          override={mismatch ? t('mismatch') : undefined}
        />
      </div>
      <FormError error={error} />
      <button type="submit" disabled={!ready} className={primaryButtonClass}>
        {pending ? t('newSubmitting') : t('newSubmit')}
      </button>
    </form>
  );
}
