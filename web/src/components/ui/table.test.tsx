// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderIntl } from '../../test/render.tsx';
import { ClickRow } from './click-row.tsx';
import { Table, Td, Th } from './table.tsx';

const push = vi.hoisted(() => vi.fn());
vi.mock('../../lib/i18n/navigation.ts', () => ({ useRouter: () => ({ push }) }));

beforeEach(() => push.mockClear());

describe('Table', () => {
  it('is a labelled table with a red header of column headers', () => {
    renderIntl(
      <Table aria-label="Clients">
        <thead>
          <tr>
            <Th>Client</Th>
            <Th num>New today</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td strong>Lumière</Td>
            <Td num>4</Td>
          </tr>
        </tbody>
      </Table>,
    );
    expect(screen.getByRole('table', { name: 'Clients' })).toBeTruthy();
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(2);
    for (const h of headers) {
      expect(h.getAttribute('scope')).toBe('col');
      expect(h.className).toContain('bg-sx-red');
      expect(h.className).toContain('text-white');
    }
  });

  it('aligns numbers to the end but never the first column, and bolds the strong cell', () => {
    renderIntl(
      <Table aria-label="t">
        <tbody>
          <tr>
            <Td num>12</Td>
            <Td num>7</Td>
            <Td strong>Name</Td>
          </tr>
        </tbody>
      </Table>,
    );
    expect(screen.getByText('7').className).toContain('text-end');
    expect(screen.getByText('7').className).toContain('tabular-nums');
    expect(screen.getByText('12').className).toContain('first:text-start');
    expect(screen.getByText('Name').className).toContain('font-heading');
  });

  it('scrolls inside its own container instead of widening the page', () => {
    const { container } = renderIntl(
      <Table aria-label="t">
        <tbody />
      </Table>,
    );
    expect(container.firstElementChild?.className).toContain('overflow-x-auto');
  });
});

describe('ClickRow', () => {
  const row = (extra?: { fresh?: boolean }) =>
    renderIntl(
      <Table aria-label="Clients">
        <tbody>
          <ClickRow href="/p/abc/overview" data-testid="row" {...extra}>
            <Td>
              {/* jsdom cannot navigate: stop the real link from trying */}
              <a href="/p/abc/overview" onClick={(e) => e.preventDefault()}>
                Lumière
              </a>
            </Td>
            <Td>
              <button type="button">Menu</button>
            </Td>
            <Td>plain</Td>
          </ClickRow>
        </tbody>
      </Table>,
    );

  it('opens the row target when any plain cell is clicked', async () => {
    row();
    await userEvent.click(screen.getByText('plain'));
    expect(push).toHaveBeenCalledExactlyOnceWith('/p/abc/overview');
  });

  it('leaves clicks on inner controls and links to those controls', async () => {
    row();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('link', { name: 'Lumière' }));
    expect(push).not.toHaveBeenCalled();
  });

  it('leaves modified clicks to the browser (open in a new tab)', async () => {
    row();
    const user = userEvent.setup(); // one instance, so the held key carries into the click
    await user.keyboard('{Control>}');
    await user.click(screen.getByText('plain'));
    await user.keyboard('{/Control}');
    await user.keyboard('{Meta>}');
    await user.click(screen.getByText('plain'));
    await user.keyboard('{/Meta}');
    expect(push).not.toHaveBeenCalled();
  });

  it('ignores a click another handler already claimed', async () => {
    const onClick = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    renderIntl(
      <Table aria-label="t">
        <tbody>
          <ClickRow href="/x" onClick={onClick}>
            <Td>cell</Td>
          </ClickRow>
        </tbody>
      </Table>,
    );
    await userEvent.click(screen.getByText('cell'));
    expect(onClick).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps a real link in the first cell for keyboards and screen readers', () => {
    row();
    const first = screen.getByTestId('row').querySelector('td:first-child a');
    expect(first?.getAttribute('href')).toBe('/p/abc/overview');
  });

  it('marks a fresh row with the red edge', () => {
    row({ fresh: true });
    expect(screen.getByTestId('row').className).toContain('before:bg-sx-red');
  });

  it('does not mark an ordinary row', () => {
    row();
    expect(screen.getByTestId('row').className).not.toContain('before:bg-sx-red');
  });
});
