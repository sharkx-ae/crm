'use client';

import { Popover as RadixPopover } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';

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
          className="z-97 max-h-[70dvh] min-w-[240px] max-w-[360px] overflow-auto rounded-xl border border-sx-border bg-sx-paper p-1.5 shadow-sx-md"
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
