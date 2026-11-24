import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV } from './config.ts';
import { ROUTE_KEYS, type RouteKey } from './routes.ts';

// Web plan §2.3: the layout cannot protect a page, so every page under (app) must call guardRoute with its own key.
const appDir = new URL('../../app/[locale]/(app)/', import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  '$1',
);

const pages = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return pages(p);
    return name === 'page.tsx' ? [p] : [];
  });

/** The route key a page belongs to: its first path segment that names a route. */
const keyOf = (file: string): RouteKey | null =>
  relative(appDir, file)
    .split(sep)
    .find((seg): seg is RouteKey => (ROUTE_KEYS as string[]).includes(seg)) ?? null;

describe('(app) pages', () => {
  const all = pages(appDir);
  const guarded = all.filter((f) => !f.includes('[...rest]'));

  it('finds the pages', () => {
    expect(guarded.length).toBeGreaterThanOrEqual(2);
  });

  it.each(guarded)('%s calls guardRoute with its own key', (file) => {
    const key = keyOf(file);
    expect(key, `${file}: put the page under a route-key folder`).not.toBeNull();
    expect(readFileSync(file, 'utf8')).toMatch(new RegExp(`guardRoute\\(\\s*'${key}'`));
  });

  it('every ready nav item has a page', () => {
    for (const nav of Object.values(NAV)) {
      for (const g of nav.agency)
        for (const i of g.items.filter((x) => x.ready))
          expect(existsSync(join(appDir, i.key, 'page.tsx')), i.key).toBe(true);
      for (const g of nav.project)
        for (const i of g.items.filter((x) => x.ready))
          expect(existsSync(join(appDir, 'p', '[projectId]', i.key, 'page.tsx')), i.key).toBe(true);
    }
  });
});
