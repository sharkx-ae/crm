import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cx } from '../../lib/cx.ts';

// Brand table: red header with white text, hairline rows, numbers aligned to the end. The scroll container is
// inside the card, so a wide table scrolls there and never makes the page scroll sideways.
export function Table({
  'aria-label': ariaLabel,
  className,
  children,
}: {
  'aria-label': string;
  className?: string;
  children: ReactNode;
}) {
  return (
    // relative: absolutely positioned content (sr-only labels) stays inside the scroll box, never widening the page.
    <div className="relative overflow-x-auto">
      <table
        aria-label={ariaLabel}
        className={cx(
          'w-full border-collapse text-body [&_tbody_tr:last-child_td]:border-b-0',
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}

/** A column header. `num` aligns it (and its column) to the end; the first column always starts. */
export function Th({
  num = false,
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return (
    <th
      scope="col"
      {...rest}
      className={cx(
        'whitespace-nowrap bg-sx-red px-4 py-[9px] font-label text-label text-white',
        num ? 'text-end tabular-nums first:text-start' : 'text-start',
        className,
      )}
    />
  );
}

export function Td({
  num = false,
  strong = false,
  className,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean; strong?: boolean }) {
  return (
    <td
      {...rest}
      className={cx(
        // Under 900px a row never wraps: the card's table scrolls sideways instead of stacking a name on three lines.
        'border-b border-sx-border px-4 py-2.5 align-middle max-rail:whitespace-nowrap',
        num && 'text-end tabular-nums first:text-start',
        strong && 'font-heading',
        className,
      )}
    />
  );
}

// A new, unreviewed row carries a 3px red edge on its first cell.
export const FRESH_ROW = [
  '[&>td:first-child]:relative',
  "[&>td:first-child]:before:absolute [&>td:first-child]:before:inset-y-0 [&>td:first-child]:before:start-0 [&>td:first-child]:before:w-[3px] [&>td:first-child]:before:bg-sx-red [&>td:first-child]:before:content-['']",
].join(' ');

export type RowProps = HTMLAttributes<HTMLTableRowElement> & { fresh?: boolean };
