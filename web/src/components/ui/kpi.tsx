import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cx } from '../../lib/cx.ts';

// Brand rule: at most six KPI tiles above the fold (KpiStrip's type enforces it; at runtime a seventh is dropped).
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

// One tile: a <Kpi>, or `cond && <Kpi/>` for the conditional ones (the client's "Waiting for review").
type Tile = ReactElement | false | null | undefined;

/**
 * One to six tiles, as a tuple, so a seventh is a TYPE ERROR rather than a tile that silently disappears (it would be
 * the last one, which is usually the conditional "needs attention" tile). `.map()` output is an unbounded array and
 * does not fit: a strip is a fixed set of metrics, written out.
 */
export type KpiTiles = Tile | readonly [Tile, Tile?, Tile?, Tile?, Tile?, Tile?];

// Fragments hold tiles too: unwrap them, or `<><Kpi/>…</>` would count as one child and dodge the cap.
function flatten(nodes: ReactNode, path = ''): ReactElement[] {
  return Children.toArray(nodes).flatMap((node, i) => {
    const key = `${path}${i}`;
    if (isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment) {
      return flatten(node.props.children, `${key}.`);
    }
    return isValidElement(node) ? [cloneElement(node, { key })] : [];
  });
}

/** A continuous row of metrics on the canvas, no boxes. */
export function KpiStrip({ children }: { children: KpiTiles }) {
  // The type already forbids more than six; this is the backstop for what the type cannot see (a spread array).
  const tiles = flatten(children).slice(0, MAX_KPI_TILES);
  return (
    <div className="grid grid-cols-2 rail:flex rail:flex-wrap rail:items-end rail:gap-y-4">
      {tiles}
    </div>
  );
}
