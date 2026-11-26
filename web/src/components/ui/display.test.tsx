// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { renderIntl } from '../../test/render.tsx';
import { Avatar } from './avatar.tsx';
import { Phone, UserText } from './bidi.tsx';
import { Card } from './card.tsx';
import { Chip, type ChipTone } from './chip.tsx';
import { Dots } from './dots.tsx';
import { EmptyState } from './empty-state.tsx';
import { ICON_NAMES, Icon } from './icons.tsx';
import { Kpi, KpiStrip, MAX_KPI_TILES } from './kpi.tsx';
import { PageActions } from './page-actions.tsx';
import { Skeleton } from './skeleton.tsx';

describe('Icon', () => {
  it('has the mockup set of 47 icons plus the sort arrows, every one drawable', () => {
    expect(ICON_NAMES).toHaveLength(48);
    for (const name of ICON_NAMES) {
      const { container, unmount } = renderIntl(<Icon name={name} />);
      expect(container.querySelector('svg')?.childElementCount, name).toBeGreaterThan(0);
      unmount();
    }
  });

  it('is decorative, sized by prop, and mirrors only when told to', () => {
    const { container } = renderIntl(
      <>
        <Icon name="arrow" />
        <Icon name="arrow" size="sm" flip />
        <Icon name="arrow" size="lg" />
      </>,
    );
    const [a, b, c] = Array.from(container.querySelectorAll('svg')) as SVGElement[];
    expect(a?.getAttribute('aria-hidden')).toBe('true');
    expect(a?.getAttribute('class')).toContain('size-[18px]');
    expect(a?.getAttribute('class')).not.toContain('rtl:');
    expect(b?.getAttribute('class')).toContain('size-[15px]');
    expect(b?.getAttribute('class')).toContain('rtl:-scale-x-100');
    expect(c?.getAttribute('class')).toContain('size-[22px]');
  });
});

describe('Chip', () => {
  const tones: ChipTone[] = ['new', 'mql', 'sql', 'nq', 'ok', 'warn', 'bad', 'off', 'tag'];

  it('always carries text, and a dot for every tone but tag', () => {
    for (const tone of tones) {
      const { container, unmount } = renderIntl(<Chip tone={tone}>Label</Chip>);
      expect(screen.getByText('Label')).toBeTruthy();
      const dots = container.querySelectorAll('span[aria-hidden="true"]');
      expect(dots, tone).toHaveLength(tone === 'tag' ? 0 : 1);
      unmount();
    }
  });

  it('uses brand fills: SQL red, MQL red wash, bad red wash', () => {
    renderIntl(
      <>
        <Chip tone="sql">SQL</Chip>
        <Chip tone="mql">MQL</Chip>
        <Chip tone="bad">Broken</Chip>
      </>,
    );
    expect(screen.getByText('SQL').className).toContain('bg-sx-red ');
    expect(screen.getByText('MQL').className).toContain('bg-sx-red-soft');
    expect(screen.getByText('Broken').className).toContain('bg-sx-red-soft');
  });
});

describe('Card', () => {
  it('is padded by default and unpadded with flush', () => {
    renderIntl(
      <>
        <Card data-testid="a" />
        <Card data-testid="b" flush />
      </>,
    );
    expect(screen.getByTestId('a').className).toContain('p-4');
    expect(screen.getByTestId('a').className).toContain('rounded-card');
    expect(screen.getByTestId('b').className).not.toContain('p-4');
    expect(screen.getByTestId('b').className).toContain('overflow-hidden');
  });
});

describe('Kpi', () => {
  it('shows the figure and its label, and turns the figure red when hot', () => {
    renderIntl(
      <>
        <Kpi label="New today" value={12} />
        <Kpi label="Connections to fix" value={3} hot />
      </>,
    );
    expect(screen.getByText('12').className).not.toContain('text-sx-red');
    expect(screen.getByText('3').className).toContain('text-sx-red');
    expect(screen.getByText('New today')).toBeTruthy();
  });

  it('drops everything past the sixth tile at runtime (backstop for what the type cannot see)', () => {
    const eight = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
      <Kpi key={n} label={`Tile ${n}`} value={n * 10} />
    ));
    // `as never`: an unbounded array is exactly what the type forbids; this is the runtime path.
    renderIntl(<KpiStrip>{eight as never}</KpiStrip>);
    expect(MAX_KPI_TILES).toBe(6);
    expect(screen.getAllByText(/^Tile \d$/)).toHaveLength(6);
    expect(screen.queryByText('Tile 7')).toBeNull();
  });

  it('unwraps fragments, so a fragment cannot smuggle a seventh tile in', () => {
    // A fragment of tiles: it must count as three tiles, not as one child.
    const group = (
      <>
        <Kpi label="Tile 5" value={5} />
        <Kpi label="Tile 6" value={6} />
        <Kpi label="Tile 7" value={7} />
      </>
    );
    renderIntl(
      <KpiStrip>
        <Kpi label="Tile 1" value={1} />
        <Kpi label="Tile 2" value={2} />
        <Kpi label="Tile 3" value={3} />
        <Kpi label="Tile 4" value={4} />
        {group}
      </KpiStrip>,
    );
    expect(screen.getAllByText(/^Tile \d$/)).toHaveLength(6);
    expect(screen.queryByText('Tile 7')).toBeNull();
  });

  it('accepts one to six tiles, including conditional ones, and rejects a seventh at compile time', () => {
    const waiting = false as boolean;
    renderIntl(
      <>
        <KpiStrip>
          <Kpi label="Only" value={1} />
        </KpiStrip>
        <KpiStrip>
          <Kpi label="A" value={1} />
          {waiting && <Kpi label="Waiting" value={2} hot />}
          <Kpi label="B" value={3} />
        </KpiStrip>
        <KpiStrip>
          <Kpi label="T1" value={1} />
          <Kpi label="T2" value={2} />
          <Kpi label="T3" value={3} />
          <Kpi label="T4" value={4} />
          <Kpi label="T5" value={5} />
          <Kpi label="T6" value={6} />
        </KpiStrip>
      </>,
    );
    expect(screen.queryByText('Waiting')).toBeNull();
  });

  it('types the strip as one to six tiles: a seventh does not compile', () => {
    type Children = ComponentProps<typeof KpiStrip>['children'];
    const tile = <Kpi label="x" value={1} />;
    const six: Children = [tile, tile, tile, tile, tile, tile];
    // @ts-expect-error seven tiles do not fit: `tsc` (part of the gate) fails if this ever compiles
    const seven: Children = [tile, tile, tile, tile, tile, tile, tile];
    expect([six, seven]).toHaveLength(2); // the assertions are the two declarations above
  });

  it('lets the first tile be the one large figure', () => {
    renderIntl(<Kpi label="Leads" value={64} />);
    expect(screen.getByText('64').parentElement?.className).toContain(
      'first:[&>span:first-child]:text-hero',
    );
  });
});

describe('EmptyState', () => {
  it('shows title, one sentence and an action', () => {
    renderIntl(
      <EmptyState
        title="No leads yet"
        body="They appear here."
        action={<button type="button">Add</button>}
      />,
    );
    expect(screen.getByText('No leads yet')).toBeTruthy();
    expect(screen.getByText('They appear here.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });

  it('works with a title alone', () => {
    const { container } = renderIntl(<EmptyState title="Nothing here yet" />);
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });
});

describe('Avatar', () => {
  it('shows initials and is hidden from assistive tech', () => {
    renderIntl(<Avatar name="Aisha Rahman" />);
    const el = screen.getByText('AR');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.className).toContain('rounded-full');
  });

  it('is a square for a client, with ink letters on a light tint and white on a dark one', () => {
    renderIntl(
      <>
        <Avatar name="Falcon Properties" shape="square" color="#f16767" />
        <Avatar name="Lumière Aesthetics" shape="square" color="#e70101" />
      </>,
    );
    expect(screen.getByText('FP').style.color).toBe('rgb(28, 15, 15)');
    expect(screen.getByText('FP').style.backgroundColor).toBe('rgb(241, 103, 103)');
    expect(screen.getByText('LA').style.color).toBe('rgb(255, 255, 255)');
    expect(screen.getByText('LA').className).toContain('rounded-lg');
  });
});

describe('Skeleton, Dots, PageActions', () => {
  it('Skeleton is decorative and stops pulsing for reduced motion', () => {
    const { container } = renderIntl(<Skeleton className="h-8 w-40" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.className).toContain('motion-reduce:animate-none');
    expect(el.className).toContain('h-8');
  });

  it('Dots speak one summary instead of one dot each', () => {
    renderIntl(<Dots label="2 connected, 1 to fix" states={['ok', 'ok', 'bad', 'off']} />);
    const group = screen.getByRole('img', { name: '2 connected, 1 to fix' });
    expect(group.querySelectorAll('i')).toHaveLength(4);
    expect(group.querySelectorAll('i[aria-hidden="true"]')).toHaveLength(4);
    expect(group.querySelectorAll('i')[2]?.className).toContain('bg-sx-bad');
  });

  it('PageActions sits at the inline end', () => {
    const { container } = renderIntl(
      <PageActions>
        <button type="button">Export</button>
      </PageActions>,
    );
    expect((container.firstElementChild as HTMLElement).className).toContain('ms-auto');
  });
});

describe('Phone and UserText', () => {
  it('Phone is an isolated left-to-right run with tabular digits', () => {
    renderIntl(<Phone>+971 50 412 7781</Phone>);
    const el = screen.getByText('+971 50 412 7781');
    expect(el.tagName.toLowerCase()).toBe('bdi');
    expect(el.getAttribute('dir')).toBe('ltr');
    expect(el.className).toContain('tabular-nums');
  });

  it('UserText is an isolated run aligned by its own text', () => {
    renderIntl(<UserText>Lina Haddad</UserText>);
    const el = screen.getByText('Lina Haddad');
    expect(el.tagName.toLowerCase()).toBe('bdi');
    expect(el.getAttribute('dir')).toBe('auto');
  });
});
