// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Source } from '../../contracts/common.ts';
import { renderIntl } from '../../test/render.tsx';
import { BAR_FILL, BarChart, barPct, PEAK_FILL, peakIndex } from './bar-chart.tsx';
import { foldSources, MAX_ROWS, RankedBars, type RankedRow } from './ranked-bars.tsx';

const days = (counts: number[]) =>
  counts.map((count, i) => ({
    key: `d${i}`,
    label: `day ${i}`,
    count,
    title: `day ${i}: ${count}`,
  }));
const thirty = (overrides: Record<number, number> = {}) =>
  days(Array.from({ length: 30 }, (_, i) => overrides[i] ?? 0));

const chart = (bars: ReturnType<typeof days>) =>
  renderIntl(
    <BarChart
      bars={bars}
      label="Leads per day, last 30 days, days in GMT+4"
      heightPx={200}
      tableHeads={{ day: 'Day', value: 'Leads' }}
    />,
  ).container;

describe('BarChart', () => {
  it('draws one bar per non-zero day, the earliest peak in red and the rest grey', () => {
    const c = chart(thirty({ 2: 4, 5: 1, 9: 4, 29: 2 }));
    const paths = [...c.querySelectorAll('svg[data-chart="bars"] path')];
    expect(paths).toHaveLength(4);
    const red = paths.filter((p) => p.getAttribute('fill') === PEAK_FILL);
    expect(red).toHaveLength(1);
    expect(red[0]?.textContent).toBe('day 2: 4');
    expect(paths.filter((p) => p.getAttribute('fill') === BAR_FILL)).toHaveLength(3);
    expect(c.textContent).toContain('4'); // the peak's direct label
  });

  it('keeps the plot left to right and gives screen readers a name and a table of every day', () => {
    const c = chart(thirty({ 0: 1 }));
    const svg = c.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toContain('GMT+4');
    expect(svg?.closest('[dir="ltr"]')).not.toBeNull();
    expect(c.querySelectorAll('table.sr-only tbody tr')).toHaveLength(30);
  });

  it('labels the axis with the first, middle and last day', () => {
    const c = chart(thirty());
    const axis = [...c.querySelectorAll('figure > div[aria-hidden="true"] span')].map(
      (s) => s.textContent,
    );
    expect(axis).toEqual(['day 0', 'day 14', 'day 29']);
  });

  it('an empty month: no bars, no peak', () => {
    const c = chart(thirty());
    expect(c.querySelectorAll('svg path')).toHaveLength(0);
    expect(peakIndex(thirty())).toBe(-1);
  });

  it('bar heights: none for 0, at least 3%, full for the peak', () => {
    expect(barPct(0, 10)).toBe(0);
    expect(barPct(1, 100)).toBe(3);
    expect(barPct(5, 10)).toBe(50);
    expect(barPct(10, 10)).toBe(100);
  });
});

const src = (pairs: [Source, number][]) => pairs.map(([source, count]) => ({ source, count }));
const label = (r: RankedRow) => (r.kind === 'source' ? r.source : `Other (${r.sources} sources)`);

describe('Leads by source', () => {
  it('up to five sources are shown as they are', () => {
    const rows = foldSources(
      src([
        ['tiktok', 4],
        ['website', 3],
        ['whatsapp', 3],
        ['meta', 2],
        ['youtube', 1],
      ]),
    );
    expect(rows.map(label)).toEqual(['tiktok', 'website', 'whatsapp', 'meta', 'youtube']);
  });

  it('six or more fold into the top four plus "Other", and still add up', () => {
    const input = src([
      ['meta', 6],
      ['tiktok', 3],
      ['google', 2],
      ['whatsapp', 2],
      ['snapchat', 1],
      ['website', 1],
    ]);
    const rows = foldSources(input);
    expect(rows).toHaveLength(MAX_ROWS);
    expect(rows.at(-1)).toEqual({ kind: 'other', sources: 2, count: 2 });
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(15);
  });

  it('renders direct values, the top bar red, the others grey, widths as logical sizes', () => {
    const { container } = renderIntl(
      <RankedBars
        rows={foldSources(
          src([
            ['meta', 4],
            ['google', 2],
          ]),
        )}
        labelOf={label}
        format={String}
      />,
    );
    const items = [...container.querySelectorAll('li')];
    expect(items.map((li) => li.textContent)).toEqual(['meta4', 'google2']);
    const fills = items.map((li) => li.querySelector('[style]') as HTMLElement);
    expect(fills[0]?.className).toContain('bg-sx-red');
    expect(fills[1]?.className).toContain('bg-sx-faint');
    expect(fills[0]?.style.inlineSize).toBe('100%');
    expect(fills[1]?.style.inlineSize).toBe('50%');
  });
});
