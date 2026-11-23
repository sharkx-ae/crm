'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useProject } from '../../components/shell/project-context.tsx';
import { createFormat } from './format.ts';
import type { Locale } from './routing.ts';

// `format.*` bound to the active locale and the open project's time zone; `ago` and `duration` read the catalogs.
export function useProjectFormat() {
  const locale = useLocale() as Locale;
  const { timezone } = useProject();
  const tAgo = useTranslations('common.ago');
  const tDuration = useTranslations('common.duration');
  return useMemo(() => {
    const f = createFormat({ locale, timeZone: timezone });
    return {
      ...f,
      ago: (iso: string | null | undefined) => f.ago(iso, tAgo),
      duration: (minutes: number | null | undefined) => f.duration(minutes, tDuration),
    };
  }, [locale, timezone, tAgo, tDuration]);
}
