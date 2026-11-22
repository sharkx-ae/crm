import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { errorStatus } from '../../contracts/common.ts';
import { MESSAGE_MODULES } from './request.ts';

const en = (m: string) =>
  JSON.parse(readFileSync(join('messages', 'en', `${m}.json`), 'utf8')) as Record<string, unknown>;

describe('message catalogs', () => {
  it('has an English file for every registered module', () => {
    const files = readdirSync(join('messages', 'en')).map((f) => f.replace(/\.json$/, ''));
    for (const m of MESSAGE_MODULES) expect(files, m).toContain(m);
  });

  it('errors.json has a message for every code in CONTRACTS §7', () => {
    const errors = en('errors');
    for (const code of Object.keys(errorStatus)) {
      expect(typeof errors[code], code).toBe('string');
    }
  });

  it('keeps the naming rule: SHARKX in headlines, SharkX in body copy, never lowercase sharkx', () => {
    const text = JSON.stringify(en('auth')) + JSON.stringify(en('errors'));
    expect(text).not.toMatch(/\bsharkx\b/);
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u); // no emoji in UI copy
  });
});
