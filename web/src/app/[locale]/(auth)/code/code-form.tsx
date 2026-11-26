'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useState, useTransition } from 'react';
import { AuthHeading } from '../../../../components/auth/auth-heading.tsx';
import { CODE_LENGTH, CodeInput } from '../../../../components/auth/code-input.tsx';
import { FormError } from '../../../../components/auth/form-error.tsx';
import { authFormClass, linkClass, primaryButtonClass } from '../../../../components/auth/ui.ts';
import type { ActionError } from '../../../../lib/action.ts';
import { logout, resendCode, verifyCode } from '../../../../lib/actions/auth.ts';

// An email address is always left to right, so an Arabic sentence cannot pull its period to the front.
const address = (chunks: ReactNode) => <bdi dir="ltr">{chunks}</bdi>;

export function CodeForm({ maskedEmail, loginHref }: { maskedEmail: string; loginHref: string }) {
  const t = useTranslations('auth.code');
  const [code, setCode] = useState('');
  const [error, setError] = useState<ActionError | null>(null);
  // The masked address the new code went to, once it is sent.
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
        setNotice(res.data.maskedEmail);
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
    <form onSubmit={submit} className={authFormClass} noValidate>
      <AuthHeading title={t('title')}>
        <p>{t.rich('sent', { email: maskedEmail, e: address })}</p>
      </AuthHeading>
      <CodeInput
        value={code}
        onChange={onChange}
        disabled={pending}
        invalid={Boolean(error)}
        describedBy={error ? 'code-error' : undefined}
      />
      <FormError id="code-error" error={codeMessage ? null : error} override={codeMessage} />
      {notice ? (
        <p role="status" className="text-body font-label text-sx-black">
          {t.rich('resent', { email: notice, e: address })}
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
