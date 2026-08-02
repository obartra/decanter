/* Does the build still fit in its budget?

   What that question means changed when the page stopped being the download.
   It used to be one number — index.html was the entire game, so its size was
   the cost of opening it — and the budget was a cap on that one file.

   Now there are three numbers, and they are budgeted separately because they go
   wrong for different reasons and cost different things:

   - **The shells.** Every load revalidates these, forever, on every device. They
     are the only bytes that are never cached for free, so they are the ones that
     have to stay small. A shell that grows is a tax on every visit.
   - **The critical path.** Shell plus the app's own stylesheet and script: what
     a first paint actually waits for. This is the number that decides how long
     the game takes to open on a cold cache.
   - **The whole build.** What an install costs once. Generous, because it is
     paid once and then cached by name, but not unbounded.

   Nothing about adding a module tells you which of these just moved, which is
   what this is for. It builds first and measures the result, so it is measuring
   what would actually ship.

   Run: node tools/verify-budget.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/* Set about ten percent above what the build actually produces, so the next
   accidental forty kilobytes still fails while ordinary work does not nag.

   The shell cap is deliberately tight. Nothing but markup belongs in there —
   the moment a stylesheet or a script gets inlined back into a page, this is
   what says so. */
const BUDGET = {
  shell: 12_000,
  critical: 230_000,
  game: 95_000,
  total: 1_500_000
};

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
const kb = n => (n / 1024).toFixed(1) + 'kb';

let failed = false;
const fail = msg => { console.error(msg); failed = true; };

/* every page, not just the top one: a shell in a subfolder used to sail past a
   check that only looked at the root */
const shells = [...built.keys()].filter(f => f.endsWith('index.html'));
for (const f of shells){
  if (built.get(f) > BUDGET.shell)
    fail(`${f} is ${kb(built.get(f))}, over its ${kb(BUDGET.shell)} shell budget`);
}

/* The app's own bundles, found by name rather than listed, so this keeps
   measuring the right files as their hashes change. */
const appCss = [...built.keys()].find(f => /^assets\/app-[0-9a-f]+\.css$/.test(f));
const appJs = [...built.keys()].find(f => /^assets\/app-[0-9a-f]+\.js$/.test(f));
if (!appCss || !appJs) fail('the app bundles are missing, so there is nothing to measure');

const critical = built.get('index.html') + (built.get(appCss) || 0) + (built.get(appJs) || 0);
if (critical > BUDGET.critical)
  fail(`the critical path is ${kb(critical)}, over its ${kb(BUDGET.critical)} budget`);

/* Each game is one stylesheet and one script, capped together: a game that
   doubles in size is the thing worth noticing, and which half did it is not the
   point. Without this only the whole-build cap would ever complain, and by then
   the number is too big to attribute to anything. Names come from the pages that
   were built, so a third and fourth game are covered the moment they exist. */
for (const shell of shells){
  const game = shell.replace('/index.html', '');
  if (game === 'index.html') continue;
  const parts = [...built.keys()].filter(f => new RegExp(`^assets/${game}-[0-9a-f]+\\.(js|css)$`).test(f));
  if (!parts.length){ fail(`${game} has a page but no bundles`); continue; }
  const size = parts.reduce((n, f) => n + built.get(f), 0);
  if (size > BUDGET.game) fail(`${game} is ${kb(size)}, over its ${kb(BUDGET.game)} budget`);
}

let total = 0;
for (const size of built.values()) total += size;
if (total > BUDGET.total)
  fail(`the build is ${kb(total)}, over its ${kb(BUDGET.total)} budget`);

if (failed) process.exitCode = 1;
else {
  console.log(`${shells.length} shells, largest ${kb(Math.max(...shells.map(f => built.get(f))))} of ${kb(BUDGET.shell)}`);
  console.log(`critical path ${kb(critical)} of ${kb(BUDGET.critical)}`);
  console.log(`${built.size} files, ${kb(total)} of ${kb(BUDGET.total)}`);
}
