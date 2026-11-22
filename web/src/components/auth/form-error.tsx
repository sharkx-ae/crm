'use client';

import { useTranslations } from 'next-intl';
import type { ActionError } from '../../lib/action.ts';
import { errorTextClass } from './ui.ts';

/** Translated message for an action failure (`errors.<CODE>`), announced to screen readers. */
export function FormError({
  error,
  id,
  override,
}: {
  error: ActionError | null;
  id?: string;
  override?: string;
}) {
  const t = useTranslations('errors');
  if (!error && !override) return null;
  const text =
    override ??
    (error?.code === 'RATE_LIMITED'
      ? t('RATE_LIMITED', { minutes: Math.max(1, Math.ceil((error.retryAfterSec ?? 60) / 60)) })
      : t(error?.code ?? 'INTERNAL'));
  return (
    <p id={id} role="alert" className={errorTextClass}>
      {text}
    </p>
  );
}
