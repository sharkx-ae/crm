import { cx } from '../../lib/cx.ts';

export type StatusSegment = { key: 'new' | 'mql' | 'sql' | 'nq'; count: number; label: string };

const FILL: Record<StatusSegment['key'], string> = {
  new: 'bg-sx-line',
  mql: 'bg-sx-red-mid',
  sql: 'bg-sx-red',
  nq: 'bg-sx-black',
};

/** The state bar (mockup `sbar`): one segment per status that has leads, as wide as its count. Token colours only. */
export function StatusBar({
  segments,
  label,
}: {
  segments: readonly StatusSegment[];
  label: string;
}) {
  const shown = segments.filter((s) => s.count > 0);
  return (
    <div
      role="img"
      aria-label={label}
      className="mx-4 mt-4 mb-3 flex h-2 flex-none gap-0.5 rail:mx-6"
    >
      {shown.map((s) => (
        <i
          key={s.key}
          title={`${s.label}: ${s.count}`}
          style={{ flex: s.count }}
          className={cx(
            'block min-w-1 rounded-sm transition-[flex] duration-500 ease-out',
            FILL[s.key],
          )}
        />
      ))}
    </div>
  );
}
