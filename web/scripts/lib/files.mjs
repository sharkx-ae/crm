// Shared by the lint scripts: every source file under a directory that matches `pattern`.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function walk(dir, pattern, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, pattern, out);
    else if (pattern.test(name)) out.push(p);
  }
  return out;
}
