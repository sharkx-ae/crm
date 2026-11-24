import { useRef } from 'react';

/**
 * Modal and Drawer are controlled (the page owns `open`), so there is no <Dialog.Trigger>. For a modal dialog
 * Radix cancels its own focus return and focuses that trigger instead, which would leave focus on <body>.
 * This remembers whatever had focus when the dialog opened (read at the moment Radix is about to move focus)
 * and gives it back on close, as long as it is still on the page.
 */
export function useFocusReturn() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    /** Call from `onOpenAutoFocus`. */
    remember() {
      const el = document.activeElement;
      opener.current = el instanceof HTMLElement && el !== document.body ? el : null;
    },
    /** Pass as `onCloseAutoFocus`. */
    restore(event: Event) {
      event.preventDefault();
      const el = opener.current;
      opener.current = null;
      if (el?.isConnected) el.focus();
    },
  };
}
