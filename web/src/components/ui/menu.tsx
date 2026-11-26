'use client';

import { DropdownMenu } from 'radix-ui';
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { MENU_ITEM, MENU_SIZE, MENU_SURFACE } from './menu-styles.ts';

// Arrow-key menu semantics (the project switcher, the language menu). A menu is not a popover: use Popover for
// arbitrary content. Surface and rows come from menu-styles.ts, shared with Select and Popover.
const SURFACE = cx(MENU_SURFACE, MENU_SIZE);

export function Menu({
  trigger,
  children,
  align = 'end',
  label,
}: {
  /** One element (a button): it receives the open/close behaviour and the aria attributes. */
  trigger: ReactElement;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  /** Accessible name of the menu itself (the trigger already has its own). */
  label?: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} aria-label={label} className={SURFACE}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** One row. Use `asChild` with a Link to navigate; otherwise handle `onSelect`. Selecting closes the menu. */
export function MenuItem({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof DropdownMenu.Item>) {
  return (
    <DropdownMenu.Item
      {...rest}
      className={cx(MENU_ITEM, className)}
    />
  );
}

/** A muted group heading ("Client", "Language"). */
export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Label className="px-2.5 py-2 font-label text-label text-sx-muted">
      {children}
    </DropdownMenu.Label>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1.5 h-px bg-sx-border" />;
}
