import type { HTMLAttributes } from 'react';
import { cx } from '../../lib/cx.ts';

// The one primary surface of a screen: white, 16px radius, hairline border, the brand's soft shadow.
// `flush` removes the padding for a table or toolbar that runs edge to edge; the table's first and last cells
// then get the card's inner padding back (24px, 16px under 900px), as in the mockup.
const FLUSH_CELLS =
  '[&_td:first-child]:ps-4 [&_th:first-child]:ps-4 [&_td:last-child]:pe-4 [&_th:last-child]:pe-4 rail:[&_td:first-child]:ps-6 rail:[&_th:first-child]:ps-6 rail:[&_td:last-child]:pe-6 rail:[&_th:last-child]:pe-6';

export function Card({
  flush = false,
  fill = false,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  flush?: boolean;
  /** Takes the free height of the screen (at least 24rem) so a table inside scrolls under its own header and above its footer, never the page. */
  fill?: boolean;
}) {
  return (
    <div
      {...rest}
      className={cx(
        'min-w-0 rounded-card border border-sx-border bg-sx-paper shadow-sx transition-shadow duration-200',
        flush ? cx('overflow-hidden', FLUSH_CELLS) : 'p-4 rail:p-6',
        fill && 'flex min-h-[24rem] flex-1 flex-col',
        className,
      )}
    />
  );
}

/**
 * The row of filters at the top of a flush card (mockup `.card > .toolbar`): search first, then selects, wrapping.
 * 16px 24px, 12px 16px under 900px, so it lines up with the table's first and last cells below it.
 */
export function CardToolbar({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx('flex flex-wrap items-center gap-3 px-4 py-3 rail:px-6 rail:py-4', className)}
    />
  );
}
