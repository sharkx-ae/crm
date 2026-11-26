'use client';

import { Popover as RadixPopover } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { MENU_SIZE, MENU_SURFACE } from './menu-styles.ts';

// A small floating panel for arbitrary content (the notifications bell arrives with F14b). It takes focus,
// closes on Esc or an outside click, and returns focus to the trigger. For a list of actions use Menu.
export function Popover({
  trigger,
  children,
  align = 'end',
  label,
}: {
  /** One element (a button): it receives the open/close behaviour and the aria attributes. */
  trigger: ReactElement;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  /** Accessible name of the panel. */
  label?: string;
}) {
  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          sideOffset={6}
          aria-label={label}
          className={cx(MENU_SURFACE, MENU_SIZE)}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
