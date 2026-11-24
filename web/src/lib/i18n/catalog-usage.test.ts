import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A component that asks for a key the English catalog lacks does not fail anywhere: next-intl logs MISSING_MESSAGE
// and renders the key itself. This reads every literal `t('key')` next to its `useTranslations('namespace')` /
// `getTranslations('namespace')` and checks the key exists. Dynamic keys (`t(error.code)`) cannot be checked here.
const webRoot = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const srcDir = join(webRoot, 'src');
const msgDir = join(webRoot, 'messages', 'en');

type Tree = { [k: string]: string | Tree };
const catalogs: Tree = Object.fromEntries(
  readdirSync(msgDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [
      f.replace(/\.json$/, ''),
      JSON.parse(readFileSync(join(msgDir, f), 'utf8')) as Tree,
    ]),
);

const has = (path: string): boolean => {
  let node: string | Tree | undefined = catalogs;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return false;
    node = node[part];
  }
  return typeof node === 'string';
};

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const BINDING =
  /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*['"]([\w.]+)['"]\s*\)/g;

function usedKeys(file: string): { key: string; namespaces: string[] }[] {
  const text = readFileSync(file, 'utf8');
  const byVar = new Map<string, string[]>();
  for (const m of text.matchAll(BINDING)) {
    byVar.set(m[1] as string, [...(byVar.get(m[1] as string) ?? []), m[2] as string]);
  }
  const found: { key: string; namespaces: string[] }[] = [];
  for (const [name, namespaces] of byVar) {
    for (const m of text.matchAll(new RegExp(`\\b${name}\\(\\s*['"]([\\w.]+)['"]`, 'g'))) {
      found.push({ key: m[1] as string, namespaces });
    }
  }
  return found;
}

describe('catalog usage', () => {
  const all = sources(srcDir).flatMap((file) =>
    usedKeys(file).map((u) => ({ file: file.slice(srcDir.length + 1), ...u })),
  );

  it('actually finds the translations to check (guards against the scan matching nothing)', () => {
    expect(all.length).toBeGreaterThan(30);
    expect(all.some((u) => u.namespaces.includes('ui') && u.key === 'close')).toBe(true);
  });

  it('every literal key a component translates exists in the English catalog', () => {
    // Two translators with the same variable name in one file (different namespaces) accept a key from either.
    const missing = all
      .filter((u) => !u.namespaces.some((ns) => has(`${ns}.${u.key}`)))
      .map((u) => `${u.file}: ${u.namespaces.join(' | ')} → ${u.key}`);
    expect(missing).toEqual([]);
  });

  it('ui.notification and ui.notifications exist (the toast viewport and announcements)', () => {
    expect(has('ui.notification')).toBe(true);
    expect(has('ui.notifications')).toBe(true);
  });
});
