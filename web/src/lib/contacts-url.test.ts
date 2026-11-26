import { describe, expect, it } from 'vitest';
import {
  contactsApiParams,
  contactsSearch,
  DEFAULT_FILTERS,
  parseContactsAddress,
} from './contacts-url.ts';

const ID = '11111111-1111-4111-8111-111111111111';

describe('parseContactsAddress', () => {
  it('reads search, page, size and the open contact, and defaults the rest', () => {
    expect(parseContactsAddress({})).toEqual({ filters: DEFAULT_FILTERS, contactId: null });
    expect(parseContactsAddress({ q: ' sara ', page: '2', size: '50', contact: ID })).toEqual({
      filters: { q: 'sara', page: 2, size: 50 },
      contactId: ID,
    });
  });

  it('drops a page, a size or a contact id the contract refuses, and ignores an old ?limit=', () => {
    expect(parseContactsAddress({ page: '0', size: '5000', limit: '40', contact: 'nope' })).toEqual(
      { filters: DEFAULT_FILTERS, contactId: null },
    );
    expect(parseContactsAddress({ page: 'x' }).filters.page).toBe(1);
    expect(parseContactsAddress({ size: '40' }).filters.size).toBe(20);
  });
});

describe('contactsSearch', () => {
  it('omits defaults, and drops the drawer on null', () => {
    expect(contactsSearch(DEFAULT_FILTERS)).toBe('');
    expect(contactsSearch(DEFAULT_FILTERS, { q: 'sara' }, ID)).toBe(`?q=sara&contact=${ID}`);
    expect(contactsSearch({ q: 'sara', page: 2, size: 50 }, { contact: null }, ID)).toBe(
      '?q=sara&page=2&size=50',
    );
  });

  it('a changed search or page size goes back to page 1; a page change keeps them', () => {
    const third = { q: 'sara', page: 3, size: 50 } as const;
    expect(contactsSearch(third, { q: 'other' }, ID)).toBe(`?q=other&size=50&contact=${ID}`);
    expect(contactsSearch(third, { size: 10 })).toBe('?q=sara&size=10');
    expect(contactsSearch(third, { page: 4 })).toBe('?q=sara&page=4&size=50');
    expect(contactsSearch(third, { q: 'sara' })).toBe('?q=sara&page=3&size=50');
  });
});

describe('contactsApiParams', () => {
  it('always sends page and limit (the size) and only sends a search when there is one', () => {
    const p = '00000000-0000-4000-8000-000000000001';
    expect(contactsApiParams(p, DEFAULT_FILTERS).toString()).toBe(`projectId=${p}&page=1&limit=20`);
    const params = contactsApiParams(p, { q: 'sara', page: 3, size: 50 });
    expect(params.get('q')).toBe('sara');
    expect(params.get('page')).toBe('3');
    expect(params.get('limit')).toBe('50');
  });
});
