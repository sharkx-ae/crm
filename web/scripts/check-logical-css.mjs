// Fails if UI code uses physical-direction CSS (breaks Arabic RTL). Use ms-/me-/ps-/pe-/start-/end-/text-start.
// Usage: node scripts/check-logical-css.mjs [dir=src]. Patterns live in scripts/lib/logical-css.mjs.
import { readFileSync } from 'node:fs';
import { walk } from './lib/files.mjs';
import { findPhysical } from './lib/logical-css.mjs';

const root = process.argv[2] ?? 'src';
const files = walk(root, /\.(tsx|css)$/).filter((f) => !/\.test\.tsx$/.test(f));

let failures = 0;
for (const file of files) {
  const kind = file.endsWith('.css') ? 'css' : 'tsx';
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const { match, why } of findPhysical(line, kind)) {
        failures++;
        console.error(`${file}:${i + 1}  ${why} "${match}" (use a logical one)`);
      }
    });
}
if (failures) process.exit(1);
console.log(`logical-css: ${files.length} files clean`);
