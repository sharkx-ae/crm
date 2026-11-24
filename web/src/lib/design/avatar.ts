// Pure helpers behind Avatar and the project switcher.

// Project colours are brand tokens only, cycled by position: red, black, blackTint60, redTint60, blackTint40.
export const PROJECT_COLORS = ['#e70101', '#1c0f0f', '#776f6f', '#f16767', '#a49f9f'] as const;

export const INK = '#1c0f0f';
export const WHITE = '#ffffff';

/** First letters of the first two words ("Nova Skin Casablanca" → "NS"); one word gives one letter. */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((word) => Array.from(word).find((ch) => /[\p{L}\p{N}]/u.test(ch)))
    .filter((ch): ch is string => ch !== undefined)
    .slice(0, 2);
  return letters.length === 0 ? '?' : letters.join('').toLocaleUpperCase();
}

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** Text colour for a square filled with `hex`: brand ink or white, whichever reads better (white on #f16767 fails AA). */
export function onColor(hex: string): typeof INK | typeof WHITE {
  return contrast(hex, WHITE) >= contrast(hex, INK) ? WHITE : INK;
}

/** The colour for the nth client, cycling through the brand tokens. */
export const projectColor = (index: number): string =>
  PROJECT_COLORS[
    ((index % PROJECT_COLORS.length) + PROJECT_COLORS.length) % PROJECT_COLORS.length
  ] ?? PROJECT_COLORS[0];
