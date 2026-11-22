import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Structure test (plan §4.2): every export of every 'use server' file is a defineAction(...), so no Server Action
// can skip input validation, the session check or can(). It covers John's actions too.
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const serverFiles = files('src').filter((f) =>
  /^\s*(['"])use server\1/.test(readFileSync(f, 'utf8')),
);

const EXPORT =
  /^export\s+(?:async\s+)?(const|let|var|function|class|type|interface|default)?\s*([\w$]*)/gm;

describe('server actions', () => {
  it('finds the action files', () => {
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  it.each(serverFiles)('%s exports only defineAction(...)', (file) => {
    const src = readFileSync(file, 'utf8');
    const bad: string[] = [];
    for (const m of src.matchAll(EXPORT)) {
      const kind = m[1];
      const name = m[2] ?? '';
      if (kind === 'type' || kind === 'interface') continue; // erased at build
      if (kind !== 'const') {
        bad.push(`${kind ?? 'export'} ${name}`);
        continue;
      }
      const decl = src
        .slice(m.index ?? 0)
        .split('\n')
        .slice(0, 2)
        .join(' ');
      if (!new RegExp(`const\\s+${name}\\s*=\\s*defineAction\\s*\\(`).test(decl)) bad.push(name);
    }
    expect(bad, `${file}: export only const x = defineAction(...)`).toEqual([]);
    expect(/export\s*\{/.test(src), `${file}: no re-export lists`).toBe(false);
  });
});

// Signed-in actions must declare the can() action they need (S3: every action calls can() first). Sign-in, reset and
// accept-invite (auth 'none') and code/logout (auth 'pending') have no role yet. Acting on oneself is the only
// other exception, and it is named here so adding one is a visible decision.
const SELF_ONLY = ['updateMe'];

describe('server action authorisation', () => {
  it.each(serverFiles)('%s: every signed-in action declares its can() action', (file) => {
    const src = readFileSync(file, 'utf8');
    const missing: string[] = [];
    for (const m of src.matchAll(/export const (\w+) = defineAction\(/g)) {
      const name = m[1] ?? '';
      const rest = src.slice((m.index ?? 0) + m[0].length);
      const end = rest.search(/\n\s*async\s*\(|,\s*async\s*\(/);
      const spec = rest.slice(0, end < 0 ? rest.length : end);
      const auth = /auth:\s*'(none|pending|session)'/.exec(spec)?.[1] ?? 'session';
      if (auth !== 'session' || SELF_ONLY.includes(name)) continue;
      if (!/\baction:/.test(spec)) missing.push(name);
    }
    expect(missing, `${file}: add action: '<can() action>' to`).toEqual([]);
  });
});
