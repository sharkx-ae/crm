'use client';

import type { MouseEvent } from 'react';
import { cx } from '../../lib/cx.ts';
import { useRouter } from '../../lib/i18n/navigation.ts';
import { FRESH_ROW, type RowProps } from './table.tsx';

const INTERACTIVE = 'a,button,input,select,textarea,label,[role="button"],[role="menuitem"]';

/**
 * A table row that opens `href` when clicked anywhere. The first cell must hold a real `Link` to the same
 * `href`: that link is what keyboards, screen readers and "open in new tab" use. A click on any other control
 * inside the row (a button, a select) is left to that control; modifier clicks are left to the browser.
 */
export function ClickRow({
  href,
  fresh = false,
  className,
  onClick,
  ...rest
}: Omit<RowProps, 'onClick'> & {
  href: string;
  onClick?: (e: MouseEvent<HTMLTableRowElement>) => void;
}) {
  const router = useRouter();
  return (
    // The row is a mouse shortcut; the first cell's Link is the accessible control for keyboards.
    <tr
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
        router.push(href);
      }}
      className={cx(
        'group/row cursor-pointer transition-colors duration-150 hover:bg-sx-page',
        fresh && FRESH_ROW,
        className,
      )}
    />
  );
}
