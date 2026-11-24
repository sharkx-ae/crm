import { cx } from '../../lib/cx.ts';

// A grey block shown while a page loads. Size it with className (`h-8 w-40`). Decorative: the page's
// loading state is announced by its container, not by each block.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx('animate-pulse rounded-btn bg-sx-shell motion-reduce:animate-none', className)}
    />
  );
}
