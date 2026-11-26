import { describe, expect, it } from 'vitest';
import { lastPage, pageItems, parsePage, parsePageSize, rowRange } from './paging.ts';

describe('parsePage', () => {
  it('reads a whole number from 1 up, and drops anything else to page 1', () => {
    expect(parsePage('1')).toBe(1);
    expect(parsePage('12')).toBe(12);
    expect(parsePage(['3', '9'])).toBe(3);
    for (const bad of [undefined, '', '0', '-1', '2.5', 'abc', '1e3', ' 2', '99999999']) {
      expect(parsePage(bad), String(bad)).toBe(1);
    }
  });
});

describe('parsePageSize', () => {
  it('accepts 10, 20, 50 and 100; anything else is 20', () => {
    for (const ok of ['10', '20', '50', '100']) expect(parsePageSize(ok)).toBe(Number(ok));
    for (const bad of [undefined, '', '0', '5', '40', '200', 'abc']) {
      expect(parsePageSize(bad), String(bad)).toBe(20);
    }
  });
});

describe('lastPage and rowRange', () => {
  it('rounds up, and an empty list still has a page 1', () => {
    expect(lastPage(0, 20)).toBe(1);
    expect(lastPage(20, 20)).toBe(1);
    expect(lastPage(21, 20)).toBe(2);
    expect(lastPage(64, 20)).toBe(4);
    expect(lastPage(64, 100)).toBe(1);
  });

  it('reads "1–20 of 64", the partial last page, and nothing', () => {
    expect(rowRange(1, 20, 20)).toEqual({ from: 1, to: 20 });
    expect(rowRange(4, 20, 4)).toEqual({ from: 61, to: 64 });
    expect(rowRange(2, 50, 14)).toEqual({ from: 51, to: 64 });
    expect(rowRange(1, 20, 0)).toEqual({ from: 0, to: 0 });
  });
});

describe('pageItems', () => {
  it('shows every page when there are few', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('is compact in the middle: 1 … 4 5 6 … 12', () => {
    expect(pageItems(5, 12)).toEqual([1, 'gap', 4, 5, 6, 'gap', 12]);
  });

  it('keeps the ends solid, and shows a page instead of a gap that would hide just one', () => {
    expect(pageItems(1, 12)).toEqual([1, 2, 'gap', 12]);
    expect(pageItems(12, 12)).toEqual([1, 'gap', 11, 12]);
    expect(pageItems(3, 12)).toEqual([1, 2, 3, 4, 'gap', 12]);
    expect(pageItems(10, 12)).toEqual([1, 'gap', 9, 10, 11, 12]);
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
