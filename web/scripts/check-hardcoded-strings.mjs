// Fails on hard-coded UI strings in .tsx (JSX text, aria-label/alt/title/placeholder/label …).
// Usage: node scripts/check-hardcoded-strings.mjs [dir=src]. Rules live in scripts/lib/hardcoded-strings.mjs.
import { readFileSync } from 'node:fs';
import { walk } from './lib/files.mjs';
import { findHardcoded } from './lib/hardcoded-strings.mjs';

const root = process.argv[2] ?? 'src';
const files = walk(root, /\.tsx$/).filter((f) => !/\.test\.tsx$/.test(f));

let failures = 0;
for (const file of files) {
  for (const { line, text, kind } of findHardcoded(readFileSync(file, 'utf8'), file)) {
    failures++;
    console.error(
      `${file}:${line}  hard-coded ${kind} "${text}" (move it to messages/en, or add i18n-ignore for a brand name)`,
    );
  }
}
if (failures) process.exit(1);
console.log(`hardcoded-strings: ${files.length} files clean`);
