'use client';

import { DropdownMenu } from 'radix-ui';
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';

// Arrow-key menu semantics (the project switcher, the language menu). A menu is not a popover: use Popover for
// arbitrary content. The surface matches the mockup's `.pop`: white, hairline, 12px radius, 6px padding.
const SURFACE =
  'z-97 max-h-[70dvh] min-w-[240px] max-w-[360px] overflow-auto rounded-xl border border-sx-border bg-sx-paper p-1.5 shadow-sx-md';

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
      className={cx(
        'focus-ring flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-start font-label text-sx-black no-underline outline-none data-disabled:cursor-default data-disabled:opacity-45 data-highlighted:bg-sx-shell',
        className,
      )}
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
