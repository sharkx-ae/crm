import type { HTMLAttributes } from 'react';
import { cx } from '../../lib/cx.ts';

// The one primary surface of a screen: white, 16px radius, hairline border, the brand's soft shadow.
// `flush` removes the padding for a table or toolbar that runs edge to edge; the table's first and last cells
// then get the card's inner padding back (24px, 16px under 900px), as in the mockup.
const FLUSH_CELLS =
  '[&_td:first-child]:ps-4 [&_th:first-child]:ps-4 [&_td:last-child]:pe-4 [&_th:last-child]:pe-4 rail:[&_td:first-child]:ps-6 rail:[&_th:first-child]:ps-6 rail:[&_td:last-child]:pe-6 rail:[&_th:last-child]:pe-6';

export function Card({
  flush = false,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { flush?: boolean }) {
  return (
    <div
      {...rest}
      className={cx(
        'min-w-0 rounded-card border border-sx-border bg-sx-paper shadow-sx',
        flush ? cx('overflow-hidden', FLUSH_CELLS) : 'p-4 rail:p-6',
        className,
      )}
    />
  );
}
