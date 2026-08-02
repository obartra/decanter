/* Is the committed dist/ the one the sources build?

   dist/ is committed, and it is what `npm run serve` shows and what a reviewer
   reads. The deploy rebuilds from source, so a stale dist cannot reach players,
   but it can absolutely reach the person testing a change: this session had an
   hour of "I am not seeing your fix" that was exactly this.

   Also enforces a size budget. Everything is inlined into one page, so the whole
   game is a single download, and it is easy not to notice that growing.

   Run: node tools/verify-dist.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/* generous enough not to nag, tight enough to notice a mistake */
const BUDGET = { 'index.html': 220_000, 'bubble/index.html': 140_000, total: 900_000 };

/* Walks the whole tree, not just the top. It used to look only at the top level,
   which meant a stale page in a subfolder sailed through both the freshness
   check and the budget. Dotfiles are skipped because the build does not produce
   them and a stray .DS_Store would fail the check on a machine where nothing is
   wrong. */
const snapshot = (dir = dist, base = '') => {
  const out = new Map();
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      for (const [k, v] of snapshot(p, `${base}${name}/`)) out.set(k, v);
    } else {
      out.set(`${base}${name}`, readFileSync(p));
    }
  }
  return out;
};

const before = snapshot();
execFileSync(process.execPath, [join(root, 'tools/build.mjs')], { stdio: 'pipe' });
const after = snapshot();

const problems = [];
for (const [name, body] of after) {
  const was = before.get(name);
  if (!was) { problems.push(`${name} is missing from the committed dist`); continue; }
  /* the build stamp is a hash of the sources, so a mismatch anywhere shows up
     here too; comparing bytes says which file actually moved */
  if (!was.equals(body)) problems.push(`${name} differs from what the sources build`);
}
for (const name of before.keys()) {
  if (!after.has(name)) problems.push(`${name} is committed but the build does not produce it`);
}

if (problems.length) {
  console.error('dist is not what the sources build:\n  ' + problems.join('\n  '));
  console.error('\nrun `npm run build` and commit the result');
  process.exitCode = 1;
} else {
  console.log(`dist matches the sources (${after.size} files)`);
}

let total = 0;
for (const [name, body] of after) {
  total += body.length;
  const cap = BUDGET[name];
  if (cap && body.length > cap) {
    console.error(`${name} is ${body.length} bytes, over its ${cap} budget`);
    process.exitCode = 1;
  }
}
if (total > BUDGET.total) {
  console.error(`dist is ${total} bytes, over its ${BUDGET.total} budget`);
  process.exitCode = 1;
} else {
  console.log(`dist is ${(total / 1024).toFixed(0)}KB of a ${(BUDGET.total / 1024).toFixed(0)}KB budget`);
}
