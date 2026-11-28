import { cx } from '../../lib/cx.ts';

// Leads per day (F13a): ONE idea, "each bar is one day". One column per day in a soft brand red, the best day in full
// red with a plain label, whole-number gridlines, one date label a week. No averages, no legend, no jargon: a person
// who has never read a chart understands it from the sentence under it. Drawn as an inline SVG, no chart library.
// Brand rules (chart-theme.json): white plot, no gradients, one series, hairline grid. Time always runs oldest to
// newest, left to right, in Arabic too (the plot and its axis are dir="ltr"; the words around it follow the page).
// A screen reader gets a table. Hover or tap a day for a band and "14 Nov: 3 leads".
//
// Responsive: the SVG stretches to the card and holds only flat columns, while every label and tooltip is HTML placed
// in %, so nothing is squashed. Under 640px the date labels thin out to every other week.

export type DayPoint = { key: string; label: string; count: number; title: string };

const VIEW_W = 300;
const VIEW_H = 100;
const GAP = 1.5;

/** The index of the best day (the earliest one on a tie); -1 when every day is 0. */
export function peakIndex(points: readonly { count: number }[]): number {
  const max = Math.max(0, ...points.map((p) => p.count));
  return max === 0 ? -1 : points.findIndex((p) => p.count === max);
}

/**
 * The top of the scale: the smallest round number that holds the busiest day, so the grid lines land on whole
 * leads (0, half, top). 4 leads -> 4; 5 -> 6; 12 -> 20. A month with no leads still has a 1-lead scale.
 */
export function niceMax(max: number): number {
  if (max <= 1) return 1;
  if (max <= 10) return [2, 4, 6, 8, 10].find((c) => c >= max) ?? 10;
  const unit = 10 ** (String(Math.ceil(max)).length - 1);
  return Math.ceil(max / unit) * unit;
}

/** The date labels under the plot: the last day, then every 7th day back, so each label is a week apart. */
export function axisIndices(n: number): number[] {
  if (n === 0) return [];
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i -= 7) out.unshift(i);
  return out;
}

// A column with rounded top corners, in viewbox units.
function columnPath(x: number, w: number, h: number): string {
  const y = VIEW_H - h;
  const r = Math.min(1.6, w / 2, h);
  return `M${x},${VIEW_H}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${VIEW_H}Z`;
}

export function DayChart({
  points,
  label,
  heightPx,
  fill = false,
  tableHeads,
  bestLabel,
  hint,
}: {
  points: readonly DayPoint[];
  /** What the chart shows, for screen readers ("Leads per day, last 30 days, days in GMT+4"). */
  label: string;
  /** The plot's height; with `fill` its minimum. */
  heightPx: number;
  /** Grow to the free height of the card (the staff Overview), never below `heightPx`. */
  fill?: boolean;
  tableHeads: { day: string; value: string };
  /** The words on the best day's bar ("Best day: 4"). */
  bestLabel: string;
  /** One plain sentence under the chart ("Each bar is one day. Hover or tap a bar to see its leads."). */
  hint: string;
}) {
  const n = points.length;
  const top = niceMax(Math.max(0, ...points.map((p) => p.count)));
  const peak = peakIndex(points);
  const axis = axisIndices(n);
  const step = VIEW_W / Math.max(n, 1);
  const w = Math.max(step - GAP, 1);
  const pct = (c: number) => (Math.min(Math.max(c, 0), top) / top) * 100;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  // Grid lines on whole leads: 0, half of the top, the top (just 0 and 1 for a scale of 1).
  const ticks = top === 1 ? [0, 1] : [0, top / 2, top];
  // A label near either edge sits inside the plot instead of being cut off.
  const edge = (i: number) => (i < 3 ? 'start' : i > n - 4 ? 'end' : 'middle');

  return (
    <figure className={cx('m-0 min-w-0', fill && 'flex min-h-0 flex-1 flex-col')}>
      <div
        dir="ltr"
        className={cx('flex pt-7', fill && 'min-h-0 flex-1')}
        style={fill ? { minBlockSize: heightPx + 28 } : { blockSize: heightPx + 28 }}
      >
        {/* The scale: whole leads at the grid lines. */}
        <div aria-hidden="true" className="relative w-7 flex-none">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute end-2 translate-y-1/2 text-label text-sx-muted tabular-nums"
              style={{ insetBlockEnd: `${(t / top) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="relative min-h-0 min-w-0 flex-1">
          {ticks.slice(1).map((t) => (
            <i
              key={t}
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 border-sx-border/70 border-t"
              style={{ insetBlockEnd: `${(t / top) * 100}%` }}
            />
          ))}
          {/* The columns grow in from the left, once, when the chart appears. */}
          <svg
            role="img"
            aria-label={label}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            className="relative block size-full animate-sx-reveal overflow-visible border-b border-sx-line motion-reduce:animate-none"
            data-chart="days"
          >
            {points.map((p, i) => {
              const h = (pct(p.count) / 100) * VIEW_H;
              if (h === 0) return null;
              return (
                <path
                  key={p.key}
                  d={columnPath(i * step + GAP / 2, w, h)}
                  className={i === peak ? 'fill-sx-red' : 'fill-sx-red-mid'}
                  data-part="column"
                  data-peak={i === peak ? '' : undefined}
                />
              );
            })}
          </svg>
          {/* One hover column per day: a soft band and a small label with the day and its leads. */}
          <div aria-hidden="true" className="absolute inset-0 flex">
            {points.map((p, i) => (
              <div key={p.key} className="group/day relative min-w-0 flex-1">
                <span className="absolute inset-0 bg-sx-black/[0.05] opacity-0 transition-opacity duration-150 group-hover/day:opacity-100" />
                <span
                  dir="auto"
                  className={cx(
                    'pointer-events-none absolute z-10 w-max max-w-[240px] translate-y-1 rounded-lg bg-sx-black px-2.5 py-1.5 font-label text-label text-white opacity-0 shadow-sx-md transition-[opacity,transform] duration-150 group-hover/day:translate-y-0 group-hover/day:opacity-100',
                    edge(i) === 'start' && 'start-0',
                    edge(i) === 'end' && 'end-0',
                    edge(i) === 'middle' && 'start-1/2 -translate-x-1/2 rtl:-translate-x-1/2',
                  )}
                  style={{ insetBlockEnd: `calc(${pct(p.count)}% + 10px)` }}
                >
                  {p.title}
                </span>
              </div>
            ))}
          </div>
          {/* The best day, named in words right on its bar (the one direct label). */}
          {peak >= 0 ? (
            <span
              aria-hidden="true"
              className={cx(
                'pointer-events-none absolute animate-sx-fade whitespace-nowrap font-heading text-label text-sx-red [animation-delay:500ms] backwards motion-reduce:animate-none',
                edge(peak) === 'middle' && '-translate-x-1/2 rtl:-translate-x-1/2',
              )}
              style={{
                ...(edge(peak) === 'end'
                  ? { insetInlineEnd: 0 }
                  : { insetInlineStart: edge(peak) === 'start' ? 0 : `${x(peak)}%` }),
                insetBlockEnd: `calc(${pct(points[peak]?.count ?? 0)}% + 6px)`,
              }}
            >
              {bestLabel}
            </span>
          ) : null}
        </div>
      </div>
      {/* The dates: the last day, then a label every week back, each under its own day. */}
      <div dir="ltr" aria-hidden="true" className="relative ms-7 h-7 flex-none">
        {axis.map((i) => (
          <span
            key={i}
            className={cx(
              'absolute top-2 whitespace-nowrap text-label text-sx-muted',
              // The last date is aligned to the end of the plot so it never leaves the card; the others sit under their day.
              i !== n - 1 && '-translate-x-1/2 rtl:-translate-x-1/2',
              // Narrow screens keep every other week, counted back from the last day.
              ((n - 1 - i) / 7) % 2 === 1 && 'max-sm:hidden',
            )}
            style={i === n - 1 ? { insetInlineEnd: 0 } : { insetInlineStart: `${x(i)}%` }}
          >
            {points[i]?.label}
          </span>
        ))}
      </div>
      {/* One plain sentence on how to read it. */}
      <p data-part="hint" className="m-0 mt-1 flex-none text-label text-sx-muted">
        {hint}
      </p>
      {/* A table ignores sr-only's clip (its rows overflow the 1px box and stretch the scroll area), so a div clips it. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">{tableHeads.day}</th>
              <th scope="col">{tableHeads.value}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key}>
                <td>{p.label}</td>
                <td>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
