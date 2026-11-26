import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';

// Chips mark lead status and connection health only (mockup rule). The dot and the text carry the meaning, never
// colour alone. Tones without a fill (nq, ok, warn, off) read as a dot plus text.
export type ChipTone = 'new' | 'mql' | 'sql' | 'nq' | 'ok' | 'warn' | 'bad' | 'off' | 'tag';

const BASE =
  'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-md text-label font-label';
const TONE: Record<ChipTone, { chip: string; dot: string }> = {
  new: {
    chip: 'bg-sx-paper px-2 text-sx-black shadow-[inset_0_0_0_1px_var(--color-sx-line)]',
    dot: 'border-[1.5px] border-sx-black',
  },
  mql: { chip: 'bg-sx-red-soft px-2 text-sx-black', dot: 'bg-sx-red' },
  sql: { chip: 'bg-sx-red px-2 text-white', dot: 'bg-white' },
  nq: { chip: 'bg-transparent px-0 text-sx-muted', dot: 'bg-sx-faint' },
  ok: { chip: 'bg-transparent px-0 text-sx-black', dot: 'bg-sx-ok' },
  warn: { chip: 'bg-transparent px-0 text-sx-black', dot: 'bg-sx-warn' },
  bad: { chip: 'bg-sx-red-soft px-2 text-sx-black', dot: 'bg-sx-bad' },
  off: { chip: 'bg-transparent px-0 text-sx-muted', dot: 'bg-sx-faint' },
  tag: {
    chip: 'bg-sx-paper px-2 font-body text-sx-muted shadow-[inset_0_0_0_1px_var(--color-sx-border)]',
    dot: '',
  },
};

export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <span className={cx(BASE, t.chip)}>
      {tone === 'tag' ? null : (
        <span aria-hidden="true" className={cx('size-[7px] flex-none rounded-full', t.dot)} />
      )}
      {children}
    </span>
  );
}
