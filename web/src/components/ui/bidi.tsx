import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';

// Mixed-direction content. Latin digits and names inside an Arabic sentence must not reorder around the
// surrounding text, so each gets its own isolated run.

/** A phone number (the server-formatted `phoneDisplay`): always LTR, tabular digits. */
export function Phone({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={cx('tabular-nums', className)}>
      {children}
    </bdi>
  );
}

/** Text a person typed (names, campaigns, form answers): isolated and aligned by its own first letters. */
export function UserText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="auto" className={className}>
      {children}
    </bdi>
  );
}
