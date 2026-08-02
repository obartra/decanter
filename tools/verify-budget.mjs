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

/* Generous enough not to nag, tight enough to notice a mistake.

   Raised deliberately when the app page started carrying both games. Some of its
   levels are the bubble game, so its sources ship inside it: 198k to 285k, which
   is the cost of the second game and is meant to be paid once rather than
   discovered later. The numbers are set about ten percent above what the build
   actually produces, so the next accidental forty kilobytes still fails.

   Raised again, and this time the headroom had already gone: the page was 311.6k
   against a 315k cap, so it was inside one percent of failing and the next change
   of any size was going to be the one that tripped it, whatever it was. It
   happened to be this one, at 317.9k. Nothing here is minified, so the growth is
   the recording's loader, the sound preference reaching both games, and roughly
   1.4k of pure indentation from six modules moving inside an IIFE to stop them
   declaring into the page's shared scope.

   350k restores the ten percent, and forty kilobytes on top of today's build
   still fails it. When this needs raising a third time the question to ask first
   is whether the comments should ship at all: they are a large share of this
   page and they are downloaded by every player.

   `bubble/index.html` is the standalone page at /bubble/ and holds one game, so
   it did not move. */
const BUDGET = { 'index.html': 350_000, 'bubble/index.html': 140_000, total: 1_100_000 };

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
