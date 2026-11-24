import type { ReactNode } from 'react';

// A page has no title (the rail marks where you are). Its one action sits here, at the inline end of the
// first row. Put it as a direct child of a flex row; `ms-auto` pushes it to the end in both directions.
export function PageActions({ children }: { children: ReactNode }) {
  return <div className="ms-auto flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
