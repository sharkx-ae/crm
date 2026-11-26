import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cx } from '../../lib/cx.ts';
import { Icon } from './icons.tsx';

// Brand table: red header with white text, hairline rows, numbers aligned to the end. The scroll container is
// inside the card, so a wide table scrolls there and never makes the page scroll sideways. In a card that fills the screen
// (`Card fill`) the box takes the free height and scrolls both ways: the red header stays pinned, and so does the
// paging footer below it, so only the rows move.
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
    <div className="relative min-h-0 flex-1 overflow-auto">
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
        'sticky top-0 z-10 whitespace-nowrap bg-sx-red px-4 py-[9px] font-label text-label text-white',
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

/**
 * A sortable column header: the label is a button; the arrow shows the direction (a faint pair when the column is not
 * the sorted one). Clicking asks the screen to sort by `sortKey`; the screen decides the new order (see lib/sort.ts).
 */
export function SortTh<K extends string>({
  sortKey,
  active,
  dir,
  onSort,
  label,
  num = false,
  className,
  children,
}: {
  sortKey: K;
  /** The column the list is sorted by now, or '' for the natural order. */
  active: K | '';
  dir: 'asc' | 'desc';
  onSort: (key: K) => void;
  /** Accessible name of the button ("Sort by Lead"). */
  label: string;
  num?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const on = active === sortKey;
  return (
    <Th
      num={num}
      className={className}
      aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button
        type="button"
        aria-label={label}
        onClick={() => onSort(sortKey)}
        className="focus-ring -mx-1.5 inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-inherit transition-colors duration-150 hover:bg-white/15"
      >
        {children}
        <Icon
          name={on ? (dir === 'asc' ? 'up' : 'down') : 'sort'}
          size="sm"
          className={on ? undefined : 'opacity-55'}
        />
      </button>
    </Th>
  );
}
