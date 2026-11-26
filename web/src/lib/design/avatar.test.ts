import { describe, expect, it } from 'vitest';
import { INK, initials, onColor, PROJECT_COLORS, projectColor, WHITE } from './avatar.ts';

describe('initials', () => {
  it.each([
    ['Lumière Aesthetics', 'LA'],
    ['Nova Skin Casablanca', 'NS'],
    ['Pearl', 'P'],
    ['  oasis   fit studio ', 'OF'],
    ['Dr. Lina Haddad', 'DL'],
    ['Falcon & Sons', 'FS'],
  ])('%s → %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it('works for Arabic names and falls back to ? for nothing', () => {
    expect(initials('لينا حداد')).toBe('لح');
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});

describe('onColor', () => {
  it('uses white on the dark and saturated tokens', () => {
    for (const hex of ['#e70101', '#1c0f0f', '#776f6f']) expect(onColor(hex)).toBe(WHITE);
  });

  it('uses ink on the light tints, where white would fail AA', () => {
    for (const hex of ['#f16767', '#a49f9f', '#fde6e6', '#ffffff']) expect(onColor(hex)).toBe(INK);
  });
});

describe('projectColor', () => {
  it('cycles through the five brand tokens', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(projectColor)).toEqual([
      ...PROJECT_COLORS,
      '#e70101',
      '#1c0f0f',
    ]);
  });

  it('never throws on a negative index', () => {
    expect(projectColor(-1)).toBe('#a49f9f');
  });
});
