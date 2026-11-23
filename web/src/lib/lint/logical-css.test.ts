import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findPhysical } from '../../../scripts/lib/logical-css.mjs';

const flagged = (line: string, kind?: 'css' | 'tsx') =>
  findPhysical(line, kind).map((h) => h.match);

describe('findPhysical', () => {
  it.each([
    ['<div className="ml-2 flex">', 'ml-2'],
    ['<div className="md:-mr-1">', '-mr-1'],
    ['<div className="pl-[3px]">', 'pl-[3px]'],
    ['<div className="absolute left-0 top-0">', 'left-0'],
    ['<div className="border-r border-sx-border">', 'border-r'],
    ['<div className="rounded-tl-lg">', 'rounded-tl-lg'],
    ['<p className="text-left">', 'text-left'],
    ['<img className="float-right">', 'float-right'],
    ['  margin-left: 8px;', 'margin-left:'],
    ['  padding-right: 8px;', 'padding-right:'],
    ['  border-left: 1px solid red;', 'border-left:'],
    ['  border-top-left-radius: 4px;', 'border-top-left-radius:'],
    ['  text-align: right;', 'text-align: right'],
    ['  float: left;', 'float: left'],
    ['<div style={{ marginLeft: 8 }}>', 'marginLeft'],
    ['<div style={{ paddingRight: 8 }}>', 'paddingRight'],
    ['<div style={{ borderTopRightRadius: 4 }}>', 'borderTopRightRadius'],
    ["<div style={{ left: '50%' }}>", '{ left:'],
    ['<div style={{ width: 1, right: 0 }}>', ', right:'],
    ["<div style={{ textAlign: 'left' }}>", "textAlign: 'left'"],
    ['<div className="-translate-x-1/2">', '-translate-x-1/2'],
    ['<div className="translate-x-4">', 'translate-x-4'],
  ])('flags %s', (line, match) => {
    expect(flagged(line).some((m) => m.includes(match))).toBe(true);
  });

  it('flags a bare left/right declaration in css only', () => {
    expect(flagged('  left: 0;', 'css')).toEqual(['left:']);
    expect(flagged('.a { color: red; right: 4px }', 'css')).toEqual(['; right:']);
    expect(flagged('type Edge = { left: number; right: number };', 'tsx')).toEqual([]);
  });

  it.each([
    '<div className="ms-2 me-1 ps-4 pe-4 start-0 end-0 text-start text-end">',
    '<div className="border-s border-e rounded-s-lg rounded-ss-lg">',
    '<div className="-translate-x-1/2 rtl:translate-x-1/2">',
    '<div className="rtl:-scale-x-100">',
    '  margin-inline-start: 8px;',
    '  inset-inline-end: 0;',
    '  text-align: start;',
    '<div style={{ marginInlineStart: 8 }}>',
    "t('wrong', { left: d.attemptsLeft })",
    'const x = cond ? left : right;',
    'type Edge = { left: number; right: number };',
    '<div className="border-red-500 rounded-lg border-b border-t">',
    '<div className="copyright-note leftover">',
    '<div className="-translate-x-1/2" /> {/* logical-ignore */}',
  ])('allows %s', (line) => {
    expect(flagged(line)).toEqual([]);
  });
});

describe('check-logical-css.mjs', () => {
  const run = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'logical-css-'));
    try {
      for (const [name, body] of Object.entries(files)) {
        mkdirSync(join(dir, name, '..'), { recursive: true });
        writeFileSync(join(dir, name), body);
      }
      return spawnSync(process.execPath, ['scripts/check-logical-css.mjs', dir], {
        encoding: 'utf8',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('passes on a clean tree', () => {
    const r = run({ 'a.tsx': 'export const A = () => <div className="ms-2 text-start" />;\n' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('1 files clean');
  }, 30_000);

  it('fails on a planted ml-2 and names file and line', () => {
    const r = run({ 'a.tsx': 'export const A = () => (\n  <div className="ml-2" />\n);\n' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/a\.tsx:2 .*"ml-2"/);
  }, 30_000);

  it('fails on a planted physical property in css', () => {
    const r = run({ 'nested/x.css': '.a {\n  margin-left: 4px;\n}\n' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('margin-left');
  }, 30_000);
});
