import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  type LeadFilters,
  leadsApiParams,
  leadsSearch,
  parseLeadFilters,
} from './leads-url.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const staff = { client: false };
const at = (over: Partial<LeadFilters>): LeadFilters => ({ ...DEFAULT_FILTERS, ...over });

describe('parseLeadFilters', () => {
  it('reads every filter, and defaults when the address is empty', () => {
    expect(parseLeadFilters({}, staff)).toEqual(DEFAULT_FILTERS);
    expect(
      parseLeadFilters(
        { tab: 'mql', q: ' sara ', source: 'meta', owner: OWNER, page: '3', size: '50' },
        staff,
      ),
    ).toEqual(at({ tab: 'mql', q: 'sara', source: 'meta', owner: OWNER, page: 3, size: 50 }));
    expect(parseLeadFilters({ owner: 'unassigned' }, staff).owner).toBe('unassigned');
  });

  it('drops values the contract refuses instead of failing', () => {
    expect(
      parseLeadFilters(
        { tab: 'won', source: 'fax', owner: 'everyone', page: '0', size: '5000' },
        staff,
      ),
    ).toEqual(DEFAULT_FILTERS);
    for (const page of ['0', '-2', '1.5', 'abc', '', '1e3']) {
      expect(parseLeadFilters({ page }, staff).page, page).toBe(1);
    }
    for (const size of ['5', '40', '200', 'abc', '']) {
      expect(parseLeadFilters({ size }, staff).size, size).toBe(20);
    }
  });

  it('ignores an old ?limit= link', () => {
    expect(parseLeadFilters({ limit: '60' }, staff)).toEqual(DEFAULT_FILTERS);
    expect(parseLeadFilters({ limit: '50', size: '10' }, staff).size).toBe(10);
  });

  it('takes the first of a repeated parameter and never lets a client filter by owner', () => {
    expect(parseLeadFilters({ tab: ['sql', 'mql'] }, staff).tab).toBe('sql');
    expect(parseLeadFilters({ page: ['4', '2'] }, staff).page).toBe(4);
    expect(parseLeadFilters({ owner: OWNER }, { client: true }).owner).toBe('');
    expect(parseLeadFilters({ owner: 'unassigned' }, { client: true }).owner).toBe('');
  });
});

describe('leadsSearch', () => {
  it('leaves the defaults out', () => {
    expect(leadsSearch(DEFAULT_FILTERS)).toBe('');
    expect(leadsSearch(at({ tab: 'sql', q: 'botox' }))).toBe('?tab=sql&q=botox');
    expect(leadsSearch(at({ page: 2 }))).toBe('?page=2');
    expect(leadsSearch(at({ size: 50 }))).toBe('?size=50');
    expect(leadsSearch(at({ page: 3, size: 10 }))).toBe('?page=3&size=10');
  });

  it('a changed tab, search, filter or page size goes back to page 1', () => {
    const third = at({ tab: 'mql', page: 3, size: 50 });
    expect(leadsSearch(third, { tab: 'sql' })).toBe('?tab=sql&size=50');
    expect(leadsSearch(third, { source: 'meta' })).toBe('?tab=mql&source=meta&size=50');
    expect(leadsSearch(third, { owner: 'unassigned' })).toBe('?tab=mql&owner=unassigned&size=50');
    expect(leadsSearch(third, { q: 'sara' })).toBe('?tab=mql&q=sara&size=50');
    expect(leadsSearch(third, { size: 100 })).toBe('?tab=mql&size=100');
    expect(leadsSearch(third, { size: 20 })).toBe('?tab=mql');
  });

  it('changing the page keeps the filters; the same value again is not a change', () => {
    const third = at({ tab: 'mql', page: 3, size: 50 });
    expect(leadsSearch(third, { page: 4 })).toBe('?tab=mql&page=4&size=50');
    expect(leadsSearch(third, { page: 1 })).toBe('?tab=mql&size=50');
    expect(leadsSearch(third, { tab: 'mql' })).toBe('?tab=mql&page=3&size=50');
    expect(leadsSearch(third, { size: 50 })).toBe('?tab=mql&page=3&size=50');
  });

  it('carries the open lead unless told to drop it', () => {
    expect(leadsSearch(at({ tab: 'sql' }), {}, 'L1')).toBe('?tab=sql&lead=L1');
    expect(leadsSearch(at({ tab: 'sql' }), { lead: null }, 'L1')).toBe('?tab=sql');
    expect(leadsSearch(at({}), { lead: 'L2' }, 'L1')).toBe('?lead=L2');
    expect(leadsSearch(at({ page: 2 }), { lead: 'L2' }, 'L1')).toBe('?page=2&lead=L2');
  });
});

describe('leadsApiParams', () => {
  it('sends the filters set, and the page as page and limit; the export sends no paging', () => {
    const f = at({
      tab: 'mql',
      q: 'a b',
      source: 'meta',
      owner: 'unassigned',
      page: 2,
      size: 50,
    });
    expect(leadsApiParams('P', f, { withPaging: true }).toString()).toBe(
      'projectId=P&tab=mql&q=a+b&source=meta&owner=unassigned&page=2&limit=50',
    );
    const exported = leadsApiParams('P', f, { withPaging: false });
    expect(exported.has('limit')).toBe(false);
    expect(exported.has('page')).toBe(false);
    expect(leadsApiParams('P', DEFAULT_FILTERS, { withPaging: false }).toString()).toBe(
      'projectId=P&tab=all',
    );
    expect(leadsApiParams('P', DEFAULT_FILTERS, { withPaging: true }).toString()).toBe(
      'projectId=P&tab=all&page=1&limit=20',
    );
  });
});

describe('sorting in the address', () => {
  it('reads a known column, drops an unknown one, and a client cannot sort by owner', () => {
    expect(parseLeadFilters({ sort: 'source', dir: 'desc' }, staff)).toMatchObject({
      sort: 'source',
      dir: 'desc',
    });
    expect(parseLeadFilters({ sort: 'owner', dir: 'asc' }, staff).sort).toBe('owner');
    expect(parseLeadFilters({ sort: 'owner', dir: 'asc' }, { client: true }).sort).toBe('');
    expect(parseLeadFilters({ sort: 'nope' }, staff).sort).toBe('');
  });

  it('a new sort goes back to page 1 and reaches the api', () => {
    const third = at({ page: 3 });
    expect(leadsSearch(third, { sort: 'received', dir: 'desc' })).toBe('?sort=received&dir=desc');
    expect(
      leadsApiParams('p', at({ sort: 'lead', dir: 'asc' }), { withPaging: true }).get('sort'),
    ).toBe('lead');
  });
});
