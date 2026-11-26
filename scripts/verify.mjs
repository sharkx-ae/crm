// Pre-push gate. Run before every push to master (the working branch; main is release-only):
//   node scripts/verify.mjs   (add --all for both apps)
// 1) refuses if you are behind origin/master (run `git pull --rebase` first)
// 2) runs `pnpm verify` (typecheck + lint + tests) only in the app(s) you changed
// 3) checks the generated contracts copy is in sync
// Exit code 0 = safe to push. CI re-runs everything on every push to master as a backstop.
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const all = process.argv.includes('--all');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const step = (msg) => console.log(`\n▶ ${msg}`);
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor !== 26) console.warn(`! Node ${process.versions.node}: this project needs Node 26 (nvm use).`);

step('Checking you are up to date with origin/master');
try {
  git('fetch', 'origin', 'master', '--quiet');
  const behind = Number(git('rev-list', '--count', 'HEAD..origin/master'));
  if (behind > 0) fail(`You are ${behind} commit(s) behind origin/master. Run: git pull --rebase`);
  console.log('  up to date');
} catch {
  console.warn('  could not reach origin (offline?). Continuing without the freshness check.');
}

let changed = new Set();
try {
  const committed = git('diff', '--name-only', 'origin/master...HEAD').split('\n');
  const working = git('status', '--porcelain').split('\n').map((l) => l.slice(3).replace(/^"|"$/g, ''));
  changed = new Set([...committed, ...working].filter(Boolean));
} catch {
  /* no origin/master yet: treat as everything changed */
}
const touches = (prefix) => [...changed].some((f) => f.startsWith(prefix));
const apps = [];
if (all || changed.size === 0 || touches('api/')) apps.push('api');
if (all || changed.size === 0 || touches('web/') || touches('api/src/contracts/')) apps.push('web');

step('Contracts copy in sync');
const sync = spawnSync('node', [join('scripts', 'sync-contracts.mjs'), '--check'], { cwd: root, stdio: 'inherit' });
if (sync.status !== 0) fail('Run `node scripts/sync-contracts.mjs`, commit the result, then re-run.');

for (const app of apps) {
  step(`pnpm verify in ${app}/ (typecheck, lint, tests)`);
  const r = spawnSync('pnpm', ['verify'], { cwd: join(root, app), stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    const hint = app === 'api' ? ' (api tests need Postgres: cd api && docker compose up -d)' : '';
    fail(`${app} failed. Fix it before pushing${hint}.`);
  }
}

if (!apps.length) console.log('\nNo app code changed: nothing to test.');
console.log(`\n✔ Safe to push${apps.length ? ` (checked: ${apps.join(', ')})` : ''}: git push origin master`);
