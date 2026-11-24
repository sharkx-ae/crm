import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const css = read('../../app/globals.css');
const tokens = JSON.parse(read('../../../../skills/sharkx-brand-guidelines/assets/tokens.json'));

// Normalise #rgb, #rrggbb, #rrggbbaa and rgb()/rgba() to "r,g,b,a" so notations compare equal.
function norm(value: string): string | null {
  const v = value.trim().toLowerCase();
  const hex = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (hex) {
    const n = Number.parseInt(hex[1] as string, 16);
    const a = hex[2] ? Math.round((Number.parseInt(hex[2], 16) / 255) * 100) / 100 : 1;
    return `${n >> 16},${(n >> 8) & 255},${n & 255},${a}`;
  }
  const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/);
  if (rgb) return `${rgb[1]},${rgb[2]},${rgb[3]},${rgb[4] ?? 1}`;
  return null;
}

function collect(node: unknown, out: Set<string>) {
  if (typeof node === 'string') {
    const n = norm(node);
    if (n) out.add(n);
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collect(v, out);
  }
}
const brandColors = new Set<string>();
collect(tokens.color, brandColors);

const declared = [...css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => ({
  name: m[1] as string,
  value: (m[2] as string).trim(),
}));

describe('globals.css tokens', () => {
  const colors = declared.filter((d) => d.name.startsWith('color-sx-'));

  it('declares the palette', () => {
    expect(colors.length).toBeGreaterThanOrEqual(15);
  });

  it.each(colors)('--$name ($value) is in tokens.json', ({ value }) => {
    const alias = value.match(/^var\((--[a-z0-9-]+)\)$/);
    if (alias) {
      expect(declared.map((d) => `--${d.name}`)).toContain(alias[1]);
      return;
    }
    const n = norm(value);
    expect(n, `not a colour literal: ${value}`).not.toBeNull();
    expect(brandColors.has(n as string), `${value} is not a tokens.json colour`).toBe(true);
  });

  it('shadows are the two elevations of tokens.json', () => {
    // Compare the numbers only, so rgba(…, 0.10) and rgb(… / 0.1) are the same shadow.
    const numbers = (s: string) => (s.match(/\d*\.?\d+/g) ?? []).map(Number).join(',');
    const elevation = Object.values(tokens.elevation as Record<string, string>).map(numbers);
    const shadows = declared.filter((x) => x.name.startsWith('shadow-sx'));
    expect(shadows).toHaveLength(2);
    for (const d of shadows) expect(elevation).toContain(numbers(d.value));
  });

  it('is light only: no dark theme, no light-dark(), no unloaded font', () => {
    expect(css).not.toMatch(/light-dark\(/);
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).not.toMatch(/color-scheme:[^;]*dark/);
    expect(css).not.toMatch(/Manrope/);
    expect(css).toMatch(/color-scheme:\s*light;/);
  });

  it('uses the brand font stacks and the mockup geometry', () => {
    const get = (n: string) => declared.find((d) => d.name === n)?.value;
    expect(get('font-sans')).toMatch(/^"Sharp Sans",\s*"Segoe UI"/);
    expect(get('font-ar')).toMatch(/^"GE Flow"/);
    expect(get('radius-card')).toBe('16px');
    expect(get('radius-btn')).toBe('12px');
    expect(get('rail-w')).toBe('72px');
    expect(get('side-w')).toBe('248px');
    expect(get('top-h')).toBe('56px');
  });

  it('keeps the 3px red focus ring', () => {
    expect(css).toMatch(/outline:\s*3px solid var\(--color-sx-red\)/);
  });

  it('gives every focusable element the brand ring by default, below the utilities', () => {
    // Without a baseline a bare link (the first cell of a table row) shows the browser's 1px outline.
    const base = css.match(/@layer base\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(base, 'a baseline rule inside @layer base').toMatch(/:focus-visible\s*\{/);
    for (const el of ['a[href]', 'button', 'input', 'select', 'textarea'])
      expect(base).toContain(el);
    expect(base).toMatch(/outline:\s*3px solid var\(--color-sx-red\)/);
    // programmatic focus targets (dialog, toast viewport, tab panel) are not tab stops and draw no ring
    expect(base).toContain('[tabindex]:not([tabindex="-1"])');
    // Unlayered, it would beat every Tailwind utility (the Tabs' inset ring offset, outline-none on menu items).
    const unlayered = css.replace(/@layer base\s*\{[\s\S]*?\n\}/, '');
    expect(unlayered).not.toMatch(/:where\([\s\S]*?\)\s*:focus-visible/);
  });

  it('keeps reduced motion above the animate utilities, with the reason on record', () => {
    // !important is load-bearing here (see the comment in globals.css). Each one carries its own biome-ignore with a
    // reason, so Biome's warning stays silent and nobody "fixes" it by deleting the declaration.
    const lines = css.replaceAll('\r\n', '\n').split('\n');
    const important = lines.flatMap((line, i) =>
      /^\s*[a-z-]+:\s*[^;]*!important/.test(line) ? [i] : [],
    );
    expect(important.length, 'animation and transition').toBe(2);
    expect(css).toMatch(/animation:\s*none !important/);
    expect(css).toMatch(/transition:\s*none !important/);
    for (const i of important) {
      expect(lines[i - 1], `line ${i + 1} needs a biome-ignore with a reason`).toMatch(
        /biome-ignore lint\/complexity\/noImportantStyles: \S/,
      );
    }
  });
});
