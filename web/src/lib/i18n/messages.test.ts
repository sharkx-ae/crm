import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { errorStatus, healthState, leadStatus, role, source } from '../../contracts/common.ts';
import { CLIENT_MODULES, MESSAGE_MODULES } from './request.ts';
import { routing } from './routing.ts';

type Catalog = { [key: string]: string | Catalog };
const read = (locale: string, m: string) =>
  JSON.parse(readFileSync(join('messages', locale, `${m}.json`), 'utf8')) as Catalog;
const en = (m: string) => read('en', m);

const leaves = (node: Catalog, prefix = ''): [string, string][] =>
  Object.entries(node).flatMap(([k, v]) =>
    typeof v === 'string'
      ? [[`${prefix}${k}`, v] as [string, string]]
      : leaves(v, `${prefix}${k}.`),
  );
const allEnglish = () => MESSAGE_MODULES.flatMap((m) => leaves(en(m), `${m}.`));

describe('message catalogs', () => {
  it('has an English file for every registered module', () => {
    const files = readdirSync(join('messages', 'en')).map((f) => f.replace(/\.json$/, ''));
    for (const m of MESSAGE_MODULES) expect(files, m).toContain(m);
  });

  it('registers every English file, and the browser modules are a subset', () => {
    const files = readdirSync(join('messages', 'en')).map((f) => f.replace(/\.json$/, ''));
    for (const f of files) expect(MESSAGE_MODULES as readonly string[], f).toContain(f);
    for (const m of CLIENT_MODULES) expect(MESSAGE_MODULES as readonly string[], m).toContain(m);
  });

  it('errors.json has a message for every code in CONTRACTS §7', () => {
    const errors = en('errors');
    for (const code of Object.keys(errorStatus)) {
      expect(typeof errors[code], code).toBe('string');
    }
  });

  it('common.json names every status, source, role and health state of the contracts', () => {
    const common = en('common') as Record<string, Catalog>;
    const keys = (o: Catalog | undefined) => Object.keys(o ?? {}).sort();
    expect(keys(common.status)).toEqual([...leadStatus.options].sort());
    expect(keys(common.source)).toEqual([...source.options].sort());
    expect(keys(common.role)).toEqual([...role.options].sort());
    expect(keys(common.health)).toEqual([...healthState.options].sort());
  });

  it('keeps the naming rule: SHARKX in headlines, SharkX in body copy, sharkx only inside sharkx.ae', () => {
    for (const [key, text] of allEnglish()) {
      expect(text, key).not.toMatch(/\bsharkx\b(?!\.ae)/);
      expect(text, key).not.toMatch(/\bSharkx\b|\bShark X\b|\bShark-X\b/);
      expect(text, key).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u); // no emoji in UI copy
    }
  });

  it('only translates keys that exist in English', () => {
    for (const locale of routing.locales.filter((l) => l !== 'en')) {
      for (const f of readdirSync(join('messages', locale))) {
        const m = f.replace(/\.json$/, '');
        const known = new Set(leaves(en(m)).map(([k]) => k));
        for (const [k] of leaves(read(locale, m)))
          expect(known, `${locale}/${m}: ${k}`).toContain(k);
      }
    }
  });
});
