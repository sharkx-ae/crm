import { describe, expect, it } from 'vitest';
import {
  contactsApiParams,
  contactsSearch,
  DEFAULT_FILTERS,
  parseContactsAddress,
} from './contacts-url.ts';

const ID = '11111111-1111-4111-8111-111111111111';

describe('parseContactsAddress', () => {
  it('reads search, limit and the open contact, and defaults the rest', () => {
    expect(parseContactsAddress({})).toEqual({ filters: DEFAULT_FILTERS, contactId: null });
    expect(parseContactsAddress({ q: ' sara ', limit: '40', contact: ID })).toEqual({
      filters: { q: 'sara', limit: 40 },
      contactId: ID,
    });
  });

  it('drops a limit or a contact id the contract refuses', () => {
    expect(parseContactsAddress({ limit: '5000', contact: 'nope' })).toEqual({
      filters: DEFAULT_FILTERS,
      contactId: null,
    });
  });
});

describe('contactsSearch', () => {
  it('omits defaults, resets the page when the search changes, and drops the drawer on null', () => {
    expect(contactsSearch(DEFAULT_FILTERS)).toBe('');
    expect(contactsSearch(DEFAULT_FILTERS, { q: 'sara' }, ID)).toBe(`?q=sara&contact=${ID}`);
    expect(contactsSearch({ q: 'sara', limit: 40 }, { q: 'other' }, ID)).toBe(
      `?q=other&contact=${ID}`,
    );
    expect(contactsSearch({ q: 'sara', limit: 40 }, { contact: null }, ID)).toBe(
      '?q=sara&limit=40',
    );
  });
});

describe('contactsApiParams', () => {
  it('always sends the limit and only sends a search when there is one', () => {
    const p = '00000000-0000-4000-8000-000000000001';
    expect(contactsApiParams(p, DEFAULT_FILTERS).toString()).toBe(`projectId=${p}&limit=20`);
    expect(contactsApiParams(p, { q: 'sara', limit: 40 }).get('q')).toBe('sara');
  });
});
