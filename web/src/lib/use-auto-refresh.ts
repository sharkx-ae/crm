'use client';

import { useEffect, useRef } from 'react';

// "Refresh every 5 s until F14a events" (F4b D2, no SWR): ask the server for the page again on a timer, once when the
// window regains focus, never while the tab is hidden and never while `paused` (an action is running or a dialog is
// open: a refresh then would swap the rows under the person's hands). F14a replaces this with /api/events.
export function useAutoRefresh({
  intervalMs,
  paused,
  onRefresh,
}: {
  intervalMs: number;
  paused: boolean;
  onRefresh: () => void;
}): void {
  const pausedRef = useRef(paused);
  const refreshRef = useRef(onRefresh);
  pausedRef.current = paused;
  refreshRef.current = onRefresh;

  useEffect(() => {
    const run = () => {
      if (document.hidden || pausedRef.current) return;
      refreshRef.current();
    };
    const timer = setInterval(run, intervalMs);
    window.addEventListener('focus', run);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', run);
    };
  }, [intervalMs]);
}
