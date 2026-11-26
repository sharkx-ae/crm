'use client';

import type { ReactNode } from 'react';
import { useTransition } from 'react';
import { useRouter } from '../../lib/i18n/navigation.ts';
import { useAutoRefresh } from '../../lib/use-auto-refresh.ts';
import { RefreshPauseProvider, useRefreshPaused } from '../leads/refresh-pause.tsx';

// The Overview has no filters, so the address holds no state: it simply asks the server again every 30 s (the PRD
// allows up to 30 s outside the inbox and leads), never while the tab is hidden or while a mark is running in the
// waiting card. F14a's events replace the timer.
export const OVERVIEW_REFRESH_MS = 30_000;

export function OverviewRefresh({ children }: { children: ReactNode }) {
  return (
    <RefreshPauseProvider>
      <Refresher />
      {children}
    </RefreshPauseProvider>
  );
}

function Refresher() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const held = useRefreshPaused();
  useAutoRefresh({
    intervalMs: OVERVIEW_REFRESH_MS,
    paused: pending || held,
    onRefresh: () => start(() => router.refresh()),
  });
  return null;
}
