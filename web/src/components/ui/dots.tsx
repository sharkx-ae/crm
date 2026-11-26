import { cx } from '../../lib/cx.ts';

export type DotState = 'ok' | 'warn' | 'bad' | 'off';

const COLOR: Record<DotState, string> = {
  ok: 'bg-sx-ok',
  warn: 'bg-sx-warn',
  bad: 'bg-sx-bad',
  off: 'bg-sx-border',
};

/** A row of connection dots (one per platform). `label` is the spoken summary, e.g. "2 connected, 1 to fix". */
export function Dots({ states, label }: { states: readonly DotState[]; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-1 align-middle">
      {states.map((state, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed ordered set of platforms, never reordered
          key={i}
          aria-hidden="true"
          className={cx('block size-[9px] rounded-full', COLOR[state])}
        />
      ))}
    </span>
  );
}
