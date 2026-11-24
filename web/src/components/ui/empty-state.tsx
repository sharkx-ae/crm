import type { ReactNode } from 'react';

// "Nothing here yet" with one sentence and, when it helps, the one action that fills the screen.
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-10 text-center text-sx-muted">
      <p className="mb-1 font-heading text-section text-sx-black">{title}</p>
      {body ? <p>{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
