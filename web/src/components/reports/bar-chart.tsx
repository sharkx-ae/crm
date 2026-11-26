// Leads per day (F13a, mockup `barChart`): one flat series drawn as an inline SVG, no chart library. Brand rules
// (chart-theme.json): white plot, no gradients, no legend (one series, labelled directly), the peak bar in SHARKX Red
// and the rest neutral grey, top corners rounded 4px. Time always runs oldest → newest left to right, in Arabic too
// (the plot and its axis are dir="ltr"; the words around it follow the page). A screen reader gets a table.

/** chart-theme.json: series 1 for the peak, `neutral` for every other bar. */
export const PEAK_FILL = '#e70101';
export const BAR_FILL = '#a49f9f';

export type Bar = { key: string; label: string; count: number; title: string };

const VIEW_W = 300;
const VIEW_H = 100;
const GAP = 2;
const MIN_PCT = 3;

/** The index of the tallest bar (the earliest one on a tie, as the mockup); -1 when every bar is 0. */
export function peakIndex(bars: readonly { count: number }[]): number {
  const max = Math.max(0, ...bars.map((b) => b.count));
  return max === 0 ? -1 : bars.findIndex((b) => b.count === max);
}

/** Height of a bar in % of the plot: none for 0, at least 3% otherwise so a single lead is still visible. */
export function barPct(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.max((count / max) * 100, MIN_PCT);
}

// A bar with rounded top corners, in viewBox units.
function barPath(x: number, w: number, pct: number): string {
  const h = (pct / 100) * VIEW_H;
  const y = VIEW_H - h;
  const r = Math.min(2, w / 2, h);
  return `M${x},${VIEW_H}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${VIEW_H}Z`;
}

export function BarChart({
  bars,
  label,
  heightPx,
  tableHeads,
}: {
  bars: readonly Bar[];
  /** What the chart shows, for screen readers ("Leads per day, last 30 days, days in GMT+4"). */
  label: string;
  heightPx: number;
  tableHeads: { day: string; value: string };
}) {
  const n = bars.length;
  const max = Math.max(0, ...bars.map((b) => b.count));
  const peak = peakIndex(bars);
  const step = VIEW_W / Math.max(n, 1);
  const w = Math.max(step - GAP, 1);
  const axis = n ? [0, Math.floor((n - 1) / 2), n - 1] : [];

  return (
    <figure className="m-0 min-w-0">
      <div dir="ltr" className="relative pt-6" style={{ blockSize: heightPx + 24 }}>
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="block w-full border-b border-sx-line"
          style={{ blockSize: heightPx }}
          data-chart="bars"
        >
          {bars.map((b, i) => {
            const pct = barPct(b.count, max);
            if (pct === 0) return null;
            return (
              <path
                key={b.key}
                d={barPath(i * step + GAP / 2, w, pct)}
                fill={i === peak ? PEAK_FILL : BAR_FILL}
                data-peak={i === peak ? '' : undefined}
              >
                <title>{b.title}</title>
              </path>
            );
          })}
        </svg>
        {peak >= 0 ? (
          <span
            aria-hidden="true"
            className="absolute w-10 text-center font-heading text-label text-sx-black tabular-nums"
            style={{
              // Centred on the bar by a fixed-width box (the plot is LTR, so this never needs mirroring).
              insetInlineStart: `calc(${((peak + 0.5) / n) * 100}% - 20px)`,
              insetBlockEnd: `calc(${(barPct(bars[peak]?.count ?? 0, max) / 100) * heightPx}px + 4px)`,
            }}
          >
            {bars[peak]?.count}
          </span>
        ) : null}
      </div>
      <div
        dir="ltr"
        aria-hidden="true"
        className="flex justify-between pt-2 text-label text-sx-muted"
      >
        {axis.map((i) => (
          <span key={i}>{bars[i]?.label}</span>
        ))}
      </div>
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
            {bars.map((b) => (
              <tr key={b.key}>
                <td>{b.label}</td>
                <td>{b.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
