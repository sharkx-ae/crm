import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  type LeadFilters,
  leadsApiParams,
  leadsSearch,
  PAGE_STEP,
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
        { tab: 'mql', q: ' sara ', source: 'meta', owner: OWNER, limit: '60' },
        staff,
      ),
    ).toEqual({ tab: 'mql', q: 'sara', source: 'meta', owner: OWNER, limit: 60 });
    expect(parseLeadFilters({ owner: 'unassigned' }, staff).owner).toBe('unassigned');
  });

  it('drops values the contract refuses instead of failing', () => {
    expect(
      parseLeadFilters({ tab: 'won', source: 'fax', owner: 'everyone', limit: '5000' }, staff),
    ).toEqual(DEFAULT_FILTERS);
    expect(parseLeadFilters({ limit: 'abc' }, staff).limit).toBe(PAGE_STEP);
  });

  it('takes the first of a repeated parameter and never lets a client filter by owner', () => {
    expect(parseLeadFilters({ tab: ['sql', 'mql'] }, staff).tab).toBe('sql');
    expect(parseLeadFilters({ owner: OWNER }, { client: true }).owner).toBe('');
    expect(parseLeadFilters({ owner: 'unassigned' }, { client: true }).owner).toBe('');
  });
});

describe('leadsSearch', () => {
  it('leaves the defaults out', () => {
    expect(leadsSearch(DEFAULT_FILTERS)).toBe('');
    expect(leadsSearch(at({ tab: 'sql', q: 'botox' }))).toBe('?tab=sql&q=botox');
  });

  it('a changed filter starts over at 20 rows; a changed limit does not', () => {
    const grown = at({ tab: 'mql', limit: 60 });
    expect(leadsSearch(grown, { tab: 'sql' })).toBe('?tab=sql');
    expect(leadsSearch(grown, { source: 'meta' })).toBe('?tab=mql&source=meta');
    expect(leadsSearch(grown, { limit: 80 })).toBe('?tab=mql&limit=80');
    // the same value again is not a change
    expect(leadsSearch(grown, { tab: 'mql' })).toBe('?tab=mql&limit=60');
  });

  it('carries the open lead unless told to drop it', () => {
    expect(leadsSearch(at({ tab: 'sql' }), {}, 'L1')).toBe('?tab=sql&lead=L1');
    expect(leadsSearch(at({ tab: 'sql' }), { lead: null }, 'L1')).toBe('?tab=sql');
    expect(leadsSearch(at({}), { lead: 'L2' }, 'L1')).toBe('?lead=L2');
  });
});

describe('leadsApiParams', () => {
  it('sends the tab and the filters set; the export sends no limit', () => {
    const f = at({ tab: 'mql', q: 'a b', source: 'meta', owner: 'unassigned', limit: 40 });
    expect(leadsApiParams('P', f, { withLimit: true }).toString()).toBe(
      'projectId=P&tab=mql&q=a+b&source=meta&owner=unassigned&limit=40',
    );
    expect(leadsApiParams('P', f, { withLimit: false }).has('limit')).toBe(false);
    expect(leadsApiParams('P', DEFAULT_FILTERS, { withLimit: false }).toString()).toBe(
      'projectId=P&tab=all',
    );
  });
});
