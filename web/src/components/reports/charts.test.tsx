// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Source } from '../../contracts/common.ts';
import { renderIntl } from '../../test/render.tsx';
import { axisIndices, DayChart, niceMax, peakIndex } from './day-chart.tsx';
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

const chart = (points: ReturnType<typeof days>) =>
  renderIntl(
    <DayChart
      points={points}
      label="Leads per day, last 30 days, days in GMT+4"
      heightPx={200}
      tableHeads={{ day: 'Day', value: 'Leads' }}
      bestLabel="Best day: 4"
      hint="Each bar is one day."
    />,
  ).container;

describe('DayChart', () => {
  it('draws one column per day that had leads, the best day in full red, the rest soft red', () => {
    const c = chart(thirty({ 2: 4, 5: 1, 9: 4, 29: 2 }));
    const cols = [...c.querySelectorAll('svg[data-chart="days"] [data-part="column"]')];
    expect(cols).toHaveLength(4);
    const best = cols.filter((p) => p.hasAttribute('data-peak'));
    expect(best).toHaveLength(1);
    expect(best[0]?.getAttribute('class')).toBe('fill-sx-red');
    expect(cols.filter((p) => p.getAttribute('class') === 'fill-sx-red-mid')).toHaveLength(3);
  });

  it('is one series with no line, no legend and no gradient: only the sentence that explains it', () => {
    const c = chart(thirty({ 2: 4 }));
    expect(c.querySelectorAll('svg path[fill="none"]')).toHaveLength(0);
    expect(c.querySelector('[data-part="legend"]')).toBeNull();
    expect(c.querySelector('linearGradient,radialGradient')).toBeNull();
    expect(c.querySelector('[data-part="hint"]')?.textContent).toBe('Each bar is one day.');
  });

  it('names the best day in words, right on its bar, and only when there is one', () => {
    expect(chart(thirty({ 2: 4, 9: 4 })).textContent).toContain('Best day: 4');
    expect(chart(thirty()).textContent).not.toContain('Best day');
  });

  it('keeps the plot left to right and gives screen readers a name and a table of every day', () => {
    const c = chart(thirty({ 0: 1 }));
    const svg = c.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toContain('GMT+4');
    expect(svg?.closest('[dir="ltr"]')).not.toBeNull();
    expect(c.querySelectorAll('.sr-only table tbody tr')).toHaveLength(30);
  });

  it('labels the dates weekly, counting back from the last day, thinning on narrow screens', () => {
    const c = chart(thirty());
    const spans = [...c.querySelectorAll('figure > div[aria-hidden="true"] > span')];
    expect(spans.map((s) => s.textContent)).toEqual([
      'day 1',
      'day 8',
      'day 15',
      'day 22',
      'day 29',
    ]);
    const hidden = spans.filter((s) => s.className.includes('max-sm:hidden'));
    expect(hidden.map((s) => s.textContent)).toEqual(['day 8', 'day 22']);
    expect(axisIndices(30)).toEqual([1, 8, 15, 22, 29]);
    expect(axisIndices(0)).toEqual([]);
  });

  it('the scale is whole leads: a round top, grid lines at 0, half and the top', () => {
    expect([0, 1, 2, 3, 4, 5, 9, 10, 12, 35, 101].map(niceMax)).toEqual([
      1, 1, 2, 4, 4, 6, 10, 10, 20, 40, 200,
    ]);
    const c = chart(thirty({ 2: 3 }));
    const scale = [...c.querySelectorAll('div[aria-hidden="true"].w-7 span')].map(
      (s) => s.textContent,
    );
    expect(scale).toEqual(['0', '2', '4']);
  });

  it('every day has a hover label with its day and leads, the empty days too', () => {
    const c = chart(thirty({ 2: 3 }));
    const labels = [...c.querySelectorAll('span[dir="auto"]')].map((s) => s.textContent);
    expect(labels).toHaveLength(30);
    expect(labels[2]).toBe('day 2: 3');
    expect(labels[0]).toBe('day 0: 0');
  });

  it('an empty month: no columns and no best day', () => {
    const c = chart(thirty());
    expect(c.querySelectorAll('[data-part="column"]')).toHaveLength(0);
    expect(peakIndex(thirty())).toBe(-1);
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
