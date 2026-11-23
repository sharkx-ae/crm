import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findHardcoded } from '../../../scripts/lib/hardcoded-strings.mjs';

const hits = (jsx: string) => findHardcoded(`export const A = () => (\n${jsx}\n);\n`);

describe('findHardcoded', () => {
  it('flags JSX text with letters', () => {
    expect(hits('<p>Hello there</p>')).toEqual([{ line: 2, text: 'Hello there', kind: 'text' }]);
  });

  it('flags text on its own line and reports that line', () => {
    const r = hits('<div>\n  <b>x</b>\n  Welcome back\n</div>');
    expect(r.map((h) => [h.line, h.text])).toEqual([
      [3, 'x'],
      [4, 'Welcome back'],
    ]);
  });

  it.each(['aria-label', 'alt', 'title', 'placeholder', 'aria-description', 'label'])(
    'flags a string %s',
    (attr) => {
      expect(hits(`<Thing ${attr}="Close it" />`)).toEqual([
        { line: 2, text: 'Close it', kind: 'attribute' },
      ]);
    },
  );

  it('flags a string literal in braces, as an attribute or as a child', () => {
    expect(hits(`<Thing label={'Name'} />`)).toHaveLength(1);
    expect(hits(`<p>{'Name'}</p>`)).toHaveLength(1);
  });

  it('allows catalog lookups, symbols, numbers and technical attributes', () => {
    expect(hits('<p>{t("title")}</p>')).toEqual([]);
    expect(hits('<p aria-label={t("close")} placeholder={t("name")} />')).toEqual([]);
    expect(hits('<span> · </span>')).toEqual([]);
    expect(hits('<span>— 12 / 40</span>')).toEqual([]);
    expect(hits('<a href="/login" className="a b" data-kind="Plain" role="img" />')).toEqual([]);
    expect(hits('<Thing label="" />')).toEqual([]);
  });

  it('honours i18n-ignore on the line or the line above', () => {
    expect(hits('<img alt="SHARKX" /> {/* i18n-ignore */}')).toEqual([]);
    expect(hits('{/* i18n-ignore */}\n<b>SharkX</b>')).toEqual([]);
    expect(hits('<Thing\n  label="SharkX" // i18n-ignore\n/>')).toEqual([]);
  });

  it('reads non-latin letters as text too', () => {
    expect(hits('<p>مرحبا</p>')).toHaveLength(1);
  });
});

describe('check-hardcoded-strings.mjs', () => {
  const run = (name: string, body: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'hardcoded-'));
    try {
      writeFileSync(join(dir, name), body);
      return spawnSync(process.execPath, ['scripts/check-hardcoded-strings.mjs', dir], {
        encoding: 'utf8',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('passes on a clean tree', () => {
    const r = run('a.tsx', 'export const A = () => <p>{t("x")}</p>;\n');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('1 files clean');
  }, 30_000);

  it('fails on a planted JSX string and names file and line', () => {
    const r = run('a.tsx', 'export const A = () => (\n  <p>Hello</p>\n);\n');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/a\.tsx:2 .*"Hello"/);
  }, 30_000);

  it('ignores test files', () => {
    const r = run('a.test.tsx', 'export const A = () => <p>Hello</p>;\n');
    expect(r.status).toBe(0);
  }, 30_000);
});
