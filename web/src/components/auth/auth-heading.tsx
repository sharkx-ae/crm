import type { ReactNode } from 'react';

/** The heading block of an auth screen (mockup `.auth h1` + `.muted`): 28px bold title, muted lines 6px below it. */
export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-[28px] leading-tight">{title}</h1>
      {children ? (
        <div className="mt-1.5 flex flex-col gap-1 text-body text-sx-muted">{children}</div>
      ) : null}
    </div>
  );
}
