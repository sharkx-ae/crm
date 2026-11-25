'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

// The 5 s refresh must not swap rows under someone's hands (F4b D2): while an action runs or the reason dialog is
// open, the part of the screen that owns it calls `usePauseRefresh(true)`. A counter, so two can overlap.
type Pause = { paused: boolean; hold: () => () => void };
const PauseContext = createContext<Pause | null>(null);

export function RefreshPauseProvider({ children }: { children: ReactNode }) {
  const [holds, setHolds] = useState(0);
  // `hold` must keep its identity: it is an effect dependency, and a new one would release and retake the hold.
  const hold = useCallback(() => {
    setHolds((n) => n + 1);
    return () => setHolds((n) => n - 1);
  }, []);
  const value = useMemo<Pause>(() => ({ paused: holds > 0, hold }), [holds, hold]);
  return <PauseContext.Provider value={value}>{children}</PauseContext.Provider>;
}

export function useRefreshPaused(): boolean {
  return useContext(PauseContext)?.paused ?? false;
}

/** Hold the refresh while `active` is true. Outside a provider (a test) it does nothing. */
export function usePauseRefresh(active: boolean): void {
  const hold = useContext(PauseContext)?.hold;
  useEffect(() => {
    if (!active || !hold) return;
    return hold();
  }, [active, hold]);
}
