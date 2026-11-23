import { describe, expect, it } from 'vitest';
import { pickModules, withFallback } from './merge.ts';

describe('withFallback', () => {
  const en = { a: 'A', nested: { x: 'X', y: 'Y' }, only: 'en' };

  it('keeps every English key a locale lacks and lets the locale win where it has one', () => {
    expect(withFallback(en, { a: 'ألف', nested: { x: 'س' } })).toEqual({
      a: 'ألف',
      nested: { x: 'س', y: 'Y' },
      only: 'en',
    });
  });

  it('does not mutate its inputs', () => {
    const own = { nested: { x: 'S' } };
    withFallback(en, own);
    expect(en.nested.x).toBe('X');
    expect(own).toEqual({ nested: { x: 'S' } });
  });

  it('is the English catalog for an empty locale', () => {
    expect(withFallback(en, {})).toEqual(en);
  });
});

describe('pickModules', () => {
  const messages = { common: { a: 1 }, ui: { b: 2 }, leads: { c: 3 } };

  it('hands the browser only the listed modules', () => {
    expect(pickModules(messages, ['common', 'ui'])).toEqual({ common: { a: 1 }, ui: { b: 2 } });
  });

  it('skips a module that does not exist yet', () => {
    expect(pickModules(messages, ['common', 'team'])).toEqual({ common: { a: 1 } });
  });
});
