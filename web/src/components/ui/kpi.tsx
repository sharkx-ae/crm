import { Children, type ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';

// Brand rule: at most six KPI tiles above the fold. A seventh child is not rendered.
export const MAX_KPI_TILES = 6;

// Under 900px the strip is a two-column grid (first tile across, a lone last tile across); from 900px it is one
// continuous row separated by hairlines. The first tile is the one large figure (34px, others 22px).
const TILE = [
  'flex min-w-0 flex-col gap-0.5 border-b border-sx-border py-3.5 pe-3',
  'first:col-span-full last:even:col-span-full',
  'rail:min-w-[150px] rail:flex-1 rail:border-b-0 rail:border-s rail:px-7 rail:py-0',
  'rail:first:flex-[1.2] rail:first:border-s-0 rail:first:ps-0',
  'first:[&>span:first-child]:text-hero first:[&>span:first-child]:leading-[1.1]',
].join(' ');

/** One metric: the figure first, then its muted label. `hot` turns the figure red (something needs attention). */
export function Kpi({
  label,
  value,
  hot = false,
}: {
  label: string;
  value: ReactNode;
  hot?: boolean;
}) {
  return (
    <div className={TILE}>
      <span
        className={cx('font-heading text-figure leading-tight tabular-nums', hot && 'text-sx-red')}
      >
        {value}
      </span>
      <span className="font-label text-label text-sx-muted">{label}</span>
    </div>
  );
}

/** A continuous row of metrics on the canvas, no boxes. */
export function KpiStrip({ children }: { children: ReactNode }) {
  const tiles = Children.toArray(children).slice(0, MAX_KPI_TILES);
  return (
    <div className="grid grid-cols-2 rail:flex rail:flex-wrap rail:items-end rail:gap-y-4">
      {tiles}
    </div>
  );
}
