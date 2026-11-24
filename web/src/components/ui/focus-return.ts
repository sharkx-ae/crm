import { type RefObject, useRef } from 'react';

/**
 * Modal and Drawer are controlled (the page owns `open`), so there is no <Dialog.Trigger>. For a modal dialog
 * Radix cancels its own focus return and focuses that trigger instead, which would leave focus on <body>.
 * This remembers whatever had focus when the dialog opened (read at the moment Radix is about to move focus)
 * and gives it back on close, as long as it is still on the page.
 *
 * The opener is not always there to return to: a dialog opened from a menu item (the item unmounts as the menu
 * closes) or from a row that was removed. Pass `returnTo`, a ref to the element focus belongs on (the menu's
 * trigger button), and it wins over the remembered opener. With neither, focus is left where the browser put it.
 */
export function useFocusReturn(returnTo?: RefObject<HTMLElement | null>) {
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
      const remembered = opener.current;
      opener.current = null;
      const target = [returnTo?.current, remembered].find((el) => el?.isConnected);
      target?.focus();
    },
  };
}
