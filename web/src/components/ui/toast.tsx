'use client';

import { useTranslations } from 'next-intl';
import { Toast } from 'radix-ui';
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

// A short confirmation at the bottom centre ("Marked Lina as MQL"). Announced politely to screen readers, gone
// after 3.4 s, paused while hovered or focused. Mounted once in the locale layout; call `useToast().toast(text)`.
const DURATION_MS = 3400;

type ToastApi = { toast: (message: string) => void };
const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast needs a <ToastProvider> (mounted in the locale layout)');
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('ui');
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  const nextId = useRef(0);
  const toast = useCallback((text: string) => {
    const id = nextId.current++;
    setItems((current) => [...current, { id, text }]);
  }, []);
  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      <Toast.Provider duration={DURATION_MS} label={t('notification')}>
        {children}
        {items.map((item) => (
          <Toast.Root
            key={item.id}
            type="background"
            onOpenChange={(open) => {
              if (!open) setItems((current) => current.filter((i) => i.id !== item.id));
            }}
            className="flex max-w-[min(520px,92vw)] animate-sx-rise items-center gap-3 rounded-btn bg-sx-black px-4 py-3 font-label text-white shadow-sx-md"
          >
            <Icon name="check" size="sm" className="text-sx-red-mid" />
            <Toast.Description>{item.text}</Toast.Description>
          </Toast.Root>
        ))}
        <Toast.Viewport
          label={t('notifications')}
          className="fixed start-1/2 bottom-5 z-120 m-0 flex w-max max-w-[92vw] -translate-x-1/2 list-none flex-col items-center gap-2 p-0 outline-none rtl:translate-x-1/2"
        />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}
