'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { CODE_LENGTH, CodeInput } from '../../../../components/auth/code-input.tsx';
import { FormError } from '../../../../components/auth/form-error.tsx';
import { cardClass, linkClass, primaryButtonClass } from '../../../../components/auth/ui.ts';
import type { ActionError } from '../../../../lib/action.ts';
import { logout, resendCode, verifyCode } from '../../../../lib/actions/auth.ts';

export function CodeForm({ maskedEmail, loginHref }: { maskedEmail: string; loginHref: string }) {
  const t = useTranslations('auth.code');
  const [code, setCode] = useState('');
  const [error, setError] = useState<ActionError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [resending, startResend] = useTransition();

  function verify(value: string) {
    setError(null);
    setNotice(null);
    start(async () => {
      // On success the action swaps the cookie and redirects to the landing page.
      const res = await verifyCode({ code: value });
      if (res && !res.ok) {
        setError(res.error);
        setCode('');
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length === CODE_LENGTH && !pending) verify(code);
  }

  function onChange(v: string) {
    setCode(v);
    if (v.length === CODE_LENGTH && !pending) verify(v); // submits itself once the sixth digit lands
  }

  function resend() {
    setError(null);
    setNotice(null);
    startResend(async () => {
      const res = await resendCode({});
      if (res.ok) {
        setCode('');
        setNotice(t('resent', { email: res.data.maskedEmail }));
      } else setError(res.error);
    });
  }

  // Details from the api: attemptsLeft, expired, needNewCode (CONTRACTS §7 / plan §6.1).
  const d = error?.details;
  const codeMessage =
    error?.code === 'VALIDATION'
      ? d?.expired
        ? t('expired')
        : d?.needNewCode
          ? t('needNew')
          : typeof d?.attemptsLeft === 'number'
            ? t('wrong', { left: d.attemptsLeft })
            : undefined
      : undefined;

  return (
    <form onSubmit={submit} className={`${cardClass} space-y-5 text-start`} noValidate>
      <div>
        <h1 className="mb-2 text-2xl font-bold">{t('title')}</h1>
        <p className="text-base text-sx-muted">{t('sent', { email: maskedEmail })}</p>
      </div>
      <CodeInput
        value={code}
        onChange={onChange}
        disabled={pending}
        invalid={Boolean(error)}
        describedBy={error ? 'code-error' : undefined}
      />
      <FormError id="code-error" error={codeMessage ? null : error} override={codeMessage} />
      {notice ? (
        <p role="status" className="text-sm font-semibold text-sx-black">
          {notice}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || code.length !== CODE_LENGTH}
        className={primaryButtonClass}
      >
        {pending ? t('submitting') : t('submit')}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <button type="button" onClick={resend} disabled={resending} className={linkClass}>
          {resending ? t('resending') : t('resend')}
        </button>
        <a
          href={loginHref}
          onClick={(e) => {
            // Ends the pending session so the next sign-in starts clean, then lands on /login.
            e.preventDefault();
            start(async () => {
              await logout({});
            });
          }}
          className={linkClass}
        >
          {t('back')}
        </a>
      </div>
    </form>
  );
}
