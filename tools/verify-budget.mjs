/* Does the build still fit in its budget?

   What that question means changed when the page stopped being the download.
   It used to be one number — index.html was the entire game, so its size was
   the cost of opening it — and the budget was a cap on that one file.

   Now there are four numbers, and they are budgeted separately because they go
   wrong for different reasons and cost different things:

   - **The shells.** Every load revalidates these, forever, on every device. They
     are the only bytes that are never cached for free, so they are the ones that
     have to stay small. A shell that grows is a tax on every visit.
   - **The critical path.** Shell plus the app's own stylesheet and script: what
     a first paint actually waits for. This is the number that decides how long
     the game takes to open on a cold cache.
   - **Each game.** One stylesheet and one script at its own path, capped
     together, because a game doubling is the thing worth noticing and which half
     did it is not the point.
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

/* Each cap sits above what the build actually produces by however much that
   number is allowed to move without anyone thinking about it. That is not the
   same margin for all four, and the differences are the point.

   All four were re-based when the build gained a bundler, and it is worth saying
   why rather than leaving numbers that look like they drifted. Every one of them
   fell, some by a third, and none of it was code: the sources are written with
   more prose above a function than in it, which is the house style and is
   deliberate, and a concatenating build shipped every word of it to every
   player. A bundler does not, so what these caps measure is now much closer to
   what they were always meant to measure. They came down to match. Leaving them
   where they were would have left a check that could not fail until something
   had gone very wrong indeed.

   The shell cap has the most room in absolute terms and the least in meaning:
   nothing but markup belongs in a shell, so the 12,000 is not a size limit at
   all, it is what a stylesheet or a script getting inlined back into a page
   would trip. Markup alone will never approach it, which is why it is the one
   number the bundler did not move.

   The critical path is deliberately the tightest, at a few percent. It is what
   a first paint waits for, so being told about every addition is the behaviour
   wanted rather than a false alarm to be tuned away. Raising it should be a
   decision someone makes, not a step they skip — and it has been raised twice on
   those terms, once for the blast and once for the card shown before a replay.

   Raised a second time, on the same terms, for the card shown before a replay,
   and then brought back down, which is the outcome that entry was asking for
   rather than a third raise. Nothing on that card is reachable until somebody
   taps a medallion for a level they have already cleared, so on the critical
   path every byte of it was downloaded by every player and read by the ones who
   go back. It rides in a bundle of its own now, fetched right after the page
   opens: a deferred group is an entry point, so part of the app's own script and
   stylesheet can be held back and not only a whole game.

   Then the sources became modules and it came down again, twice over, which is
   why the number below is so much smaller than the paragraphs above describe.
   Two thirds of that is prose: a concatenating build shipped every word of the
   comments above every function to every player, and a bundler does not. The
   rest is the other game, which had been fetched after the page opens for a
   while and was quietly put back on the first paint by a codemod turning a
   late-bound global into an ordinary import. A test asserts that deferral
   directly now, in terms of which modules are in which bundle, because a cap is
   a bad place to notice such a thing: this one was rebased in the same change
   that broke it, which is exactly how a number stops being a check.

   The rule has not moved through any of it — a few percent over what the build
   actually produces — and the number falls out of it. A cap set to a saving
   instead would read as a bigger win and would fail on the next paragraph of
   prose anybody adds.

   Not all of the card left. 78-still.js draws the small bottles on the shelf
   the blast offers as well, and 05-still.css styles them, so both stay: that
   shelf is opened mid-run and cannot wait for a fetch, and those two were made
   shared in the first place because two hand-rolled copies of a small bottle
   drew a full one and a nearly empty one identically. Splitting them again to
   move about 3kb would be trading a defect this repo has already had for less
   than it costs to say so. The card's markup stays in the shell for a plainer
   reason: it is the shell's own budget above, which has room, and moving it
   would put a null guard on every line that reaches for the panel. */
/* Raised by a kilobyte and a half for the sandbox button, and worth saying what
   was tried first, because a budget its own author edits to fit is not a budget.

   Jabari mode's bubble workbench is about eight kilobytes. Seven of them are off
   this path: the picker, the paces, the result card and its stylesheet are a
   deferred group fetched on the press, and even the button's glyph lives with
   them, so a build nobody opens it in carries none of it. What is left and
   cannot leave is the button, the handover to the module, and two fields of
   state, because the button is on the map and the map is the first screen.

   The other thing tried was folding it into 86-jabari.js, which is where the
   rest of the beta lives. That file is on this path too, so it would have moved
   the bytes rather than removed them. */
const BUDGET = {
  shell: 12_000,
  critical: 200_000,
  /* This one exists to notice a game DOUBLING, and nothing finer.

     It was once about ten percent above the bubble game, which was the only one
     there was, and then re-based upwards as each new game came in larger than
     the last. All of that growth was prose rather than code — these were
     concatenated sources and the bulk of every one of them was the comment above
     the function — so the cap was really a limit on how much a game was allowed
     to explain itself, which is not what this check is for.

     A bundler ships none of that, and the games came out at 66kb, 57kb, 53kb and
     29kb, so the number is set from the largest with room above it. They still
     differ by more than any cap can usefully police: one tight enough to mean
     something for the workbench is unreachable for the bubble game. At 100,000
     it does the job it is for — the largest doubled is 132kb, well past it — and
     the shell and critical-path budgets above are the ones that actually protect
     a page load. */
  game: 100_000,
  total: 1_300_000
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
