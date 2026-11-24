'use client';

import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { type ReactNode, useRef } from 'react';
import { cx } from '../../lib/cx.ts';
import { IconButton } from './button.tsx';
import { useFocusReturn } from './focus-return.ts';

// A centred dialog on a 30% ink scrim. Radix gives the focus trap and Esc; focus returns to whatever opened it.
// The first form field gets the focus on open (not the close button), as in the mockup.
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  footer,
  wide = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('ui');
  const body = useRef<HTMLDivElement>(null);
  const focusReturn = useFocusReturn();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-90 bg-sx-black/30" />
        <div className="pointer-events-none fixed inset-0 z-96 grid place-items-center p-4">
          <Dialog.Content
            // Radix links a <Description> by itself; with none it wants the link switched off explicitly.
            {...(description ? {} : { 'aria-describedby': undefined })}
            onOpenAutoFocus={(e) => {
              focusReturn.remember();
              const first = body.current?.querySelector<HTMLElement>('input,select,textarea');
              if (first) {
                e.preventDefault();
                first.focus();
              }
            }}
            onCloseAutoFocus={focusReturn.restore}
            className={cx(
              'pointer-events-auto flex max-h-[calc(100dvh-32px)] w-full flex-col rounded-card bg-sx-paper shadow-sx-md',
              wide ? 'max-w-[720px]' : 'max-w-[520px]',
            )}
          >
            <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
              <div className="min-w-0">
                <Dialog.Title className="font-heading text-section">{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-1 text-sx-muted">
                    {description}
                  </Dialog.Description>
                ) : null}
              </div>
              <Dialog.Close asChild>
                <IconButton label={t('close')} icon="x" />
              </Dialog.Close>
            </header>
            <div ref={body} className="flex flex-col gap-4 overflow-auto px-6 pt-1 pb-5">
              {children}
            </div>
            {footer ? (
              <footer className="flex flex-wrap justify-end gap-2 border-sx-border border-t px-6 py-4">
                {footer}
              </footer>
            ) : null}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
