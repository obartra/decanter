/* Does the built page still fit in its budget?

   Everything is inlined into one file so the whole game is a single download
   that works offline, which is the point of it. That also makes it very easy not
   to notice the download growing: nothing about adding a module tells you the
   page just got forty kilobytes heavier. This is the thing that says so.

   It builds first and measures the result, so it is measuring what would
   actually ship rather than whatever happens to be on disk.

   This used to also check that a committed dist/ matched the sources. dist/ is
   no longer committed — the deploy has always rebuilt from source, so the copy
   in git was never what shipped, and it cost a conflict on every branch that
   touched a source file.

   Run: node tools/verify-budget.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/* generous enough not to nag, tight enough to notice a mistake */
const BUDGET = { 'index.html': 220_000, 'bubble/index.html': 140_000, total: 900_000 };

/* Walks the whole tree, not just the top. It used to look only at the top level,
   which meant a page in a subfolder sailed past the budget entirely. Dotfiles
   are skipped because the build does not produce them. */
const walk = (dir = dist, base = '') => {
  const out = new Map();
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      for (const [k, v] of walk(p, `${base}${name}/`)) out.set(k, v);
    } else {
      out.set(`${base}${name}`, readFileSync(p).length);
    }
  }
  return out;
};

execFileSync(process.execPath, [join(root, 'tools/build.mjs')], { stdio: 'pipe' });
const built = walk();

let total = 0;
for (const [name, size] of built) {
  total += size;
  const cap = BUDGET[name];
  if (cap && size > cap) {
    console.error(`${name} is ${size} bytes, over its ${cap} budget`);
    process.exitCode = 1;
  }
}
if (total > BUDGET.total) {
  console.error(`the build is ${total} bytes, over its ${BUDGET.total} budget`);
  process.exitCode = 1;
} else {
  console.log(`built ${built.size} files, ${(total / 1024).toFixed(0)}KB of a ${(BUDGET.total / 1024).toFixed(0)}KB budget`);
}
