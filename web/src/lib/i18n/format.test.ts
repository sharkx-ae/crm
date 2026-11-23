import { describe, expect, it } from 'vitest';
import { createFormat, EMPTY, type Translate, zoneLabel } from './format.ts';

const DUBAI = 'Asia/Dubai';
const CASA = 'Africa/Casablanca';
const AT = '2026-11-22T10:05:00.000Z'; // 14:05 in Dubai (UTC+4), 11:05 in Casablanca (UTC+1)
const at = (locale: 'en' | 'ar' | 'fr', timeZone = DUBAI, now = '2026-11-22T12:00:00.000Z') =>
  createFormat({ locale, timeZone }, () => new Date(now));

// The catalogs' ICU messages, spelled out so the formatter's choice of key and value is what is tested.
const t: Translate = (key, v) => `${key}:${v ? Object.values(v).join(',') : ''}`;

describe('dates in the project zone', () => {
  it('formats en-GB date, time and date-time', () => {
    const f = at('en');
    expect(f.date(AT)).toBe('22 Nov 2026');
    expect(f.time(AT)).toBe('14:05');
    expect(f.dateTime(AT)).toBe('22 Nov 2026, 14:05');
  });

  it('shows the same instant differently in Dubai and Casablanca', () => {
    expect(at('en', DUBAI).time(AT)).toBe('14:05');
    expect(at('en', CASA).time(AT)).toBe('11:05');
    // 21:30 UTC on the 22nd is already the 23rd in Dubai, still the 22nd in Casablanca
    expect(at('en', DUBAI).date('2026-11-22T21:30:00.000Z')).toBe('23 Nov 2026');
    expect(at('en', CASA).date('2026-11-22T21:30:00.000Z')).toBe('22 Nov 2026');
  });

  it('localises the month and keeps 24 h and Western digits in fr and ar', () => {
    expect(at('fr').date(AT)).toBe('22 nov. 2026');
    expect(at('fr').time(AT)).toBe('14:05');
    expect(at('ar').date(AT)).toContain('نوفمبر');
    expect(at('ar').date(AT)).toMatch(/22.*2026/);
    expect(at('ar').time(AT)).toBe('14:05');
  });

  it('answers — for empty or malformed input', () => {
    const f = at('en');
    for (const bad of [null, undefined, '', 'not a date']) {
      expect(f.date(bad)).toBe(EMPTY);
      expect(f.dateTime(bad)).toBe(EMPTY);
      expect(f.time(bad)).toBe(EMPTY);
      expect(f.dayLabel(bad)).toBe(EMPTY);
      expect(f.ago(bad, t)).toBe(EMPTY);
    }
    expect(EMPTY).toBe('—');
  });
});

describe('dayLabel', () => {
  it('says Today, Yesterday, then the short date', () => {
    const f = at('en', DUBAI, '2026-11-22T12:00:00.000Z');
    expect(f.dayLabel('2026-11-22T01:00:00.000Z')).toBe('Today');
    expect(f.dayLabel('2026-11-21T09:00:00.000Z')).toBe('Yesterday');
    expect(f.dayLabel('2026-11-10T09:00:00.000Z')).toBe('10 Nov');
  });

  it('counts calendar days in the project zone, not 24 h blocks', () => {
    // 22 Nov 22:30 in Casablanca (21:30Z) vs now = 23 Nov 06:00 there: yesterday
    expect(at('en', CASA, '2026-11-23T05:00:00.000Z').dayLabel('2026-11-22T21:30:00.000Z')).toBe(
      'Yesterday',
    );
    // the same two instants in Dubai (01:30 on the 23rd, now 09:00 on the 23rd): today
    expect(at('en', DUBAI, '2026-11-23T05:00:00.000Z').dayLabel('2026-11-22T21:30:00.000Z')).toBe(
      'Today',
    );
  });

  it('localises the words', () => {
    expect(at('fr').dayLabel('2026-11-22T01:00:00.000Z')).toBe('Aujourd’hui');
    expect(at('ar').dayLabel('2026-11-22T01:00:00.000Z')).toBe('اليوم');
  });
});

describe('ago and duration pick the catalog key', () => {
  const f = at('en', DUBAI, '2026-11-22T12:00:00.000Z');
  const minutesAgo = (m: number) =>
    new Date(Date.parse('2026-11-22T12:00:00.000Z') - m * 60_000).toISOString();

  it.each([
    [0, 'now:'],
    [-5, 'now:'], // a clock a little ahead is still "just now"
    [1, 'min:1'],
    [59, 'min:59'],
    [60, 'h:1'],
    [3 * 60, 'h:3'],
    [23 * 60, 'h:23'],
    [24 * 60, 'd:1'],
    [2 * 24 * 60, 'd:2'],
  ])('ago(%i min) → %s', (m, expected) => {
    expect(f.ago(minutesAgo(m), t)).toBe(expected);
  });

  it.each([
    [0, 'min:0'],
    [12, 'min:12'],
    [12.4, 'min:12'],
    [60, 'h:1'],
    [65, 'hMin:1,5'],
    [150, 'hMin:2,30'],
  ])('duration(%d) → %s', (m, expected) => {
    expect(f.duration(m, t)).toBe(expected);
  });

  it('duration is — for empty or negative', () => {
    for (const bad of [null, undefined, Number.NaN, -1]) expect(f.duration(bad, t)).toBe(EMPTY);
  });
});

describe('numbers', () => {
  it('formats numbers with Western digits and thousands separators', () => {
    expect(at('en').number(12345)).toBe('12,345');
    expect(at('ar').number(12345)).toBe('12,345');
    expect(at('fr').number(12345).replace(/\s/g, ' ')).toBe('12 345');
  });

  it('formats a ratio as a percent with one decimal', () => {
    expect(at('en').percent(0.125)).toBe('12.5%');
    expect(at('en').percent(0.5)).toBe('50.0%');
    expect(at('fr').percent(0.125).replace(/\s/g, ' ')).toBe('12,5 %');
    expect(at('ar').percent(0.125)).toMatch(/12\.5/);
  });

  it('answers — for null, undefined and NaN', () => {
    for (const bad of [null, undefined, Number.NaN]) {
      expect(at('en').number(bad)).toBe(EMPTY);
      expect(at('en').percent(bad)).toBe(EMPTY);
    }
  });
});

describe('zoneLabel', () => {
  it('gives the short zone name for the agency view', () => {
    expect(zoneLabel(DUBAI, 'en')).toBe('GST');
    expect(zoneLabel(CASA, 'en')).toBe('GMT+1');
    expect(at('en').zoneLabel(CASA)).toBe('GMT+1');
    expect(at('en', CASA).zoneLabel()).toBe('GMT+1');
  });
});
