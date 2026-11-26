'use client';

import { useTranslations } from 'next-intl';
import type { ActionError } from '../../lib/action.ts';
import { useToast } from './toast.tsx';

/**
 * Shows a failed action as a short error toast (bottom inline end), never as text inside the form or the modal.
 * The wording is `ui.errorShort.<CODE>`: a few words. Sign-in and the other auth screens keep their inline messages.
 */
export function useErrorToast() {
  const { toast } = useToast();
  const t = useTranslations('ui.errorShort');
  return (error: ActionError) =>
    toast(
      error.code === 'RATE_LIMITED'
        ? t('RATE_LIMITED', { minutes: Math.max(1, Math.ceil((error.retryAfterSec ?? 60) / 60)) })
        : t(error.code),
      { tone: 'error' },
    );
}
