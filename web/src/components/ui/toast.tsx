'use client';

import { useTranslations } from 'next-intl';
import { Direction, Toast } from 'radix-ui';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from './icons.tsx';

// A short message at the bottom inline end ("Marked Lina as MQL"): bottom right in English, bottom left in Arabic.
// Newest on top, three at most. Gone after 4 s, paused while hovered or focused, and it can be closed. A success is
// announced politely, an error assertively. Mounted once in the locale layout; call `useToast().toast(text, opts?)`.
const DURATION_MS = 4000;
const MAX_VISIBLE = 3;

export type ToastTone = 'success' | 'error';
type ToastApi = { toast: (message: string, options?: { tone?: ToastTone }) => void };
const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast needs a <ToastProvider> (mounted in the locale layout)');
  return api;
}

type Item = { id: number; text: string; tone: ToastTone };

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('ui');
  const dir = Direction.useDirection();
  const [items, setItems] = useState<Item[]>([]);
  const nextId = useRef(0);
  const toast = useCallback((text: string, options?: { tone?: ToastTone }) => {
    const id = nextId.current++;
    const tone = options?.tone ?? 'success';
    // The oldest leave first once a fourth arrives.
    setItems((current) => [...current, { id, text, tone }].slice(-MAX_VISIBLE));
  }, []);
  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      <Toast.Provider
        duration={DURATION_MS}
        label={t('notification')}
        swipeDirection={dir === 'rtl' ? 'left' : 'right'}
      >
        {children}
        {items.map((item) => (
          <Toast.Root
            key={item.id}
            type={item.tone === 'error' ? 'foreground' : 'background'}
            onOpenChange={(open) => {
              if (!open) setItems((current) => current.filter((i) => i.id !== item.id));
            }}
            className="flex w-full animate-sx-toast-in items-start gap-3 rounded-btn bg-sx-black py-3 ps-4 pe-3 font-label text-white shadow-sx-md rtl:animate-sx-toast-in-rtl data-[state=closed]:animate-sx-toast-out data-[swipe=cancel]:[translate:0] data-[swipe=cancel]:transition-[translate] data-[swipe=cancel]:duration-200 data-[swipe=end]:animate-sx-toast-swipe-out data-[swipe=move]:[translate:var(--radix-toast-swipe-move-x)_0]"
          >
            <Icon
              name={item.tone === 'error' ? 'alert' : 'check'}
              size="sm"
              className="mt-[3px] text-sx-red-mid"
            />
            <Toast.Description className="min-w-0 flex-1 break-words">
              {item.text}
            </Toast.Description>
            <Toast.Close
              aria-label={t('close')}
              className="focus-ring grid size-6 flex-none cursor-pointer place-items-center rounded-lg text-white/70 transition-colors duration-150 hover:text-white"
            >
              <Icon name="x" size="sm" />
            </Toast.Close>
          </Toast.Root>
        ))}
        <Toast.Viewport
          label={t('notifications')}
          className="fixed end-4 bottom-4 z-120 m-0 flex w-[min(420px,calc(100vw-32px))] list-none flex-col-reverse gap-2 p-0 outline-none sm:end-5 sm:bottom-5"
        />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}
