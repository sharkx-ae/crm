'use client';

import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import type { ReactNode, RefObject } from 'react';
import { IconButton } from './button.tsx';
import { useFocusReturn } from './focus-return.ts';

// A side panel that slides in from the inline end (the right in English, the left in Arabic) on a 30% ink scrim.
// Width min(520px, 100%). Same Radix behaviour as Modal: focus trap, Esc, focus returns to the row that opened it.
export function Drawer({
  open,
  onOpenChange,
  title,
  subtitle,
  returnFocusTo,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: ReactNode;
  /** Where focus goes on close when the opener is gone (a drawer opened from a menu item): the menu's trigger. */
  returnFocusTo?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const t = useTranslations('ui');
  const focusReturn = useFocusReturn(returnFocusTo);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-90 bg-sx-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={() => focusReturn.remember()}
          onCloseAutoFocus={focusReturn.restore}
          className="fixed inset-y-0 end-0 z-95 flex w-[min(520px,100%)] animate-sx-slide flex-col bg-sx-paper shadow-sx-md rtl:animate-sx-slide-rtl"
        >
          <header className="flex items-start justify-between gap-3 border-sx-border border-b px-4 pt-4 pb-4 rail:px-6 rail:pt-5">
            <div className="min-w-0">
              <Dialog.Title className="mb-0.5 font-heading text-xl">{title}</Dialog.Title>
              {subtitle}
            </div>
            <Dialog.Close asChild>
              <IconButton label={t('close')} icon="x" />
            </Dialog.Close>
          </header>
          <div className="flex flex-1 flex-col gap-6 overflow-auto p-4 rail:p-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
