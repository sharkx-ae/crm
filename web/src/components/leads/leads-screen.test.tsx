// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import errors from '../../../messages/en/errors.json';
import leads from '../../../messages/en/leads.json';
import type { ClientLeadRow, LeadsPage, StaffLeadRow } from '../../contracts/leads.ts';
import { DEFAULT_FILTERS, type LeadFilters } from '../../lib/leads-url.ts';
import { renderIntl } from '../../test/render.tsx';
import { chooseOption, optionLabels } from '../../test/select.ts';
import { ProjectProvider } from '../shell/project-context.tsx';
import { ToastProvider } from '../ui/toast.tsx';
import { ClientMarkCell } from './client-mark-cell.tsx';
import { LeadsScreen } from './leads-screen.tsx';

vi.mock('../../lib/i18n/navigation.ts', () => ({
  Link: ({ href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest} />
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/p/x/leads',
}));
vi.mock('../../lib/actions/leads.ts', () => ({ markLead: vi.fn(), leadReasons: vi.fn() }));

const P = '11111111-1111-4111-8111-111111111111';
const project = {
  id: P,
  name: 'Lumière Aesthetics',
  city: 'Dubai',
  industry: 'Aesthetic clinic',
  color: '#e70101',
  timezone: 'Asia/Dubai',
};
const AGO = new Date(Date.now() - 5 * 60_000).toISOString();

const client = (n: number, status: ClientLeadRow['status'] = 'new'): ClientLeadRow => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  name: `Lead ${n}`,
  phone: '+971504127781',
  phoneDisplay: '+971 50 412 7781',
  email: null,
  source: 'meta',
  campaign: `Campaign ${n}`,
  status,
  reason: null,
  createdAt: AGO,
  answers: {},
});
const staff = (n: number, status: ClientLeadRow['status'] = 'new'): StaffLeadRow => ({
  ...client(n, status),
  ownerId: null,
  ownerName: n % 2 ? 'Aisha Rahman' : null,
});

const counts = { all: 6, unreviewed: 2, mql: 2, sql: 1, not_qualified: 1 };
const staffPage = (over: Partial<Extract<LeadsPage, { view: 'staff' }>> = {}): LeadsPage => ({
  view: 'staff',
  counts,
  total: 6,
  sources: ['meta', 'google'],
  rows: [staff(1), staff(2, 'mql')],
  owners: [{ id: P, name: 'Aisha Rahman', active: true }],
  ...over,
});
const clientPage = (over: Partial<Extract<LeadsPage, { view: 'client' }>> = {}): LeadsPage => ({
  view: 'client',
  counts,
  total: 6,
  sources: ['meta'],
  rows: [client(1), client(2, 'sql')],
  ...over,
});

const onChange = vi.fn();
function setup(data: LeadsPage, filters: Partial<LeadFilters> = {}, withMark = false) {
  return renderIntl(
    <ToastProvider>
      <ProjectProvider value={project}>
        <LeadsScreen
          data={data}
          filters={{ ...DEFAULT_FILTERS, ...filters }}
          onChange={onChange}
          hrefFor={(id) => `/p/x/leads?lead=${id}`}
          renderMark={withMark ? (row) => <ClientMarkCell row={row} projectId={P} /> : undefined}
        />
      </ProjectProvider>
    </ToastProvider>,
    { extra: { leads, errors } },
  );
}
const tabNames = () => screen.getAllByRole('tab').map((t) => t.textContent);
const headers = () => screen.getAllByRole('columnheader').map((h) => h.textContent);

beforeEach(() => onChange.mockClear());

describe('LeadsScreen, staff', () => {
  it('ribbon tabs with the api counts, in the staff order', () => {
    setup(staffPage());
    expect(tabNames()).toEqual(['6All', '2Unreviewed', '2MQL', '1SQL', '1Not qualified']);
  });

  it('table with an Owner column; unassigned shows as such; rows link to the drawer', () => {
    setup(staffPage());
    expect(headers()).toEqual(['Lead', 'Source', 'Campaign', 'Status', 'Owner', 'Received']);
    expect(screen.getByText('Aisha Rahman', { selector: 'bdi' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Lead 1' }).getAttribute('href')).toBe(
      `/p/x/leads?lead=${staff(1).id}`,
    );
    expect(screen.getAllByText('5 min ago', { selector: 'td' })).toHaveLength(2);
  });

  it('toolbar: source and owner selects (with Unassigned); no inline mark column', async () => {
    setup(staffPage());
    expect(await optionLabels(screen.getByLabelText('Owner'))).toEqual([
      'All owners',
      'Unassigned',
      'Aisha Rahman',
    ]);
    expect(await optionLabels(screen.getByLabelText('Source'))).toEqual([
      'All sources',
      'Meta Lead Ads',
      'Google Ads',
    ]);
    expect(screen.queryByText('Mark as')).toBeNull();
  });

  it('asks for the new filter through onChange; nothing is filtered here', async () => {
    setup(staffPage());
    await userEvent.click(screen.getByRole('tab', { name: /MQL/ }));
    expect(onChange).toHaveBeenCalledWith({ tab: 'mql' });
    await chooseOption(screen.getByLabelText('Owner'), 'Unassigned');
    expect(onChange).toHaveBeenCalledWith({ owner: 'unassigned' });
    // two rows were given, two are shown, whatever the tab says
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('unreviewed rows carry the red edge, others do not', () => {
    setup(staffPage());
    const [fresh, quiet] = screen.getAllByRole('row').slice(1);
    expect(fresh?.className).toContain('before:bg-sx-red');
    expect(quiet?.className).not.toContain('before:bg-sx-red');
  });
});

describe('LeadsScreen, client', () => {
  it('tabs start with Waiting for review; no Owner column or owner filter', () => {
    setup(clientPage());
    expect(tabNames()).toEqual(['2Waiting for review', '6All', '2MQL', '1SQL', '1Not qualified']);
    expect(headers()).toEqual(['Lead', 'Source', 'Campaign', 'Status', 'Received']);
    expect(screen.queryByLabelText('Owner')).toBeNull();
    expect(screen.getByLabelText('Source')).toBeTruthy();
  });

  it('inline Mark as column: buttons on a waiting lead, "Open to change" on a marked one', () => {
    setup(clientPage(), {}, true);
    expect(headers().at(-1)).toBe('Mark as');
    const [waiting, marked] = screen.getAllByRole('row').slice(1);
    expect(
      within(waiting as HTMLElement).getByRole('button', { name: /Mark Lead 1 as MQL/ }),
    ).toBeTruthy();
    expect(within(waiting as HTMLElement).queryByRole('button', { name: 'New' })).toBeNull();
    expect(within(marked as HTMLElement).getByText('Open to change')).toBeTruthy();
  });

  it('shows nothing staff-only anywhere', () => {
    const { container } = setup(clientPage(), {}, true);
    for (const word of ['Owner', 'Unassigned', 'Aisha']) {
      expect(container.textContent).not.toContain(word);
    }
  });
});

describe('empty states, paging', () => {
  it('a client with no leads at all', () => {
    setup(
      clientPage({
        counts: { all: 0, unreviewed: 0, mql: 0, sql: 0, not_qualified: 0 },
        total: 0,
        rows: [],
        sources: [],
      }),
    );
    expect(screen.getByText('No leads yet')).toBeTruthy();
    expect(screen.getByText(/appear here the moment a form is submitted/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('filtered to nothing: No leads match, with a Clear button that resets the filters', async () => {
    setup(staffPage({ rows: [], total: 0 }), { q: 'zzz' });
    expect(screen.getByText('No leads match')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onChange).toHaveBeenCalledWith({ tab: 'all', q: '', source: '', owner: '' });
  });

  it('Show 20 more asks for 20 more rows, and says how many are left when fewer remain', async () => {
    setup(
      staffPage({
        total: 50,
        counts: { ...counts, all: 50 },
        rows: Array.from({ length: 20 }, (_, i) => staff(i + 1)),
      }),
      { limit: 20 },
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show 20 more' }));
    expect(onChange).toHaveBeenCalledWith({ limit: 40 });
  });

  it('fewer than 20 left shows that number; nothing left shows no button', () => {
    const rows = Array.from({ length: 45 }, (_, i) => staff(i + 1));
    setup(staffPage({ total: 50, rows }), { limit: 60 });
    expect(screen.getByRole('button', { name: 'Show 5 more' })).toBeTruthy();
  });

  it('at 200 the button is replaced by the cap line', () => {
    const rows = Array.from({ length: 200 }, (_, i) => staff(i + 1));
    setup(staffPage({ total: 320, counts: { ...counts, all: 320 }, rows }), { limit: 200 });
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull();
    expect(
      screen.getByText('Showing the newest 200. Use search or filters, or export.'),
    ).toBeTruthy();
  });

  it('everything shown: no button, no cap line', () => {
    setup(staffPage({ total: 2 }));
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull();
    expect(screen.queryByText(/Showing the newest/)).toBeNull();
  });
});
