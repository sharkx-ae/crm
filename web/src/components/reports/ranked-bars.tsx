import type { Source } from '../../contracts/common.ts';

// Leads by source (F13a, mockup `hbars`): at most five ranked rows, each with its name, its value written out and a
// thin bar. Bars grow from the inline start, so they mirror in Arabic. The top row is SHARKX Red, the rest neutral.

export const MAX_ROWS = 5;

export type RankedRow =
  | { kind: 'source'; source: Source; count: number }
  | { kind: 'other'; sources: number; count: number };

/**
 * Top four plus one "Other" row when there are more than five sources, so the rows still add up to the total and the
 * chart never shows more than five bars (brand: ≤ 5 series). Input order is kept (the api sorts it).
 */
export function foldSources(rows: readonly { source: Source; count: number }[]): RankedRow[] {
  const all = rows.map((r) => ({ kind: 'source' as const, source: r.source, count: r.count }));
  if (all.length <= MAX_ROWS) return all;
  const rest = all.slice(MAX_ROWS - 1);
  return [
    ...all.slice(0, MAX_ROWS - 1),
    { kind: 'other', sources: rest.length, count: rest.reduce((n, r) => n + r.count, 0) },
  ];
}

export function RankedBars({
  rows,
  labelOf,
  format,
}: {
  rows: readonly RankedRow[];
  labelOf: (row: RankedRow) => string;
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {rows.map((r, i) => {
        const key = r.kind === 'source' ? r.source : 'other';
        const fill = i === 0 && r.kind === 'source' ? 'bg-sx-red' : 'bg-sx-faint';
        return (
          <li key={key} data-rank={key}>
            <div className="flex justify-between gap-3">
              <span className="min-w-0">{labelOf(r)}</span>
              <span className="font-heading tabular-nums">{format(r.count)}</span>
            </div>
            <div
              aria-hidden="true"
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sx-border"
            >
              <div
                className={`h-full rounded-full ${fill}`}
                style={{ inlineSize: `${(r.count / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
