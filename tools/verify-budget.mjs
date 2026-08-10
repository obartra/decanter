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
   a first paint waits for, so being told about every addition is the behavior
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
/* Both raised again for the cellar doors, and the shell one needs its own
   sentence because the paragraph above says markup will never approach it. It
   just did. The doors put a FIFTH view in the app — the floor of casks standing
   in front of every chapter but the first — and a view is markup. That cap was
   set when there were four, so it was measuring four views and calling it a
   ceiling on inlining. 13,000 still trips what it was written to trip: a
   stylesheet or a script folded back into the page is tens of kilobytes, not
   two hundred bytes of section.

   What was tried first, since a budget its own author edits to fit is not a
   budget: the door view's comments were cut down to the two things not written
   anywhere else, which recovered 0.7kb and moved the rest into
   docs/design/17-casks.md where it belongs. That was worth doing on its own and
   it was not enough.

   The critical path takes about four kilobytes. The door SCREEN is not in that
   number — the cellar door's bundle is deferred, fetched after first paint with
   the bubble game's. What is here is the GATE, and a gate cannot be deferred:
   the map draws doors at first paint and `isUnlocked` is asked before anything
   is dealt. Deferring it would mean drawing a road that cannot place its own
   doors and then redrawing it, and an `isUnlocked` that answers "ask again",
   which is a race in the one function deciding whether a player may play. */
/* The critical path raised once more, by two kilobytes, for money reaching the
   gate. Two things went in: the end-of-run panel now decides whether the way on
   from this board is a door rather than the next level, and the map now puts
   the price of the board in the way on the door itself. Neither can be
   deferred, for the reason the paragraph above gives about the gate: the map
   draws doors at first paint, and the panel decides the way on at the end of
   every run, including the first.

   What was tried first, since a budget its own author edits to fit is not a
   budget. The comments on both were cut to what the design documents do not
   already say. The reasoning lives in 09-map.md and 17-casks.md and is linked
   rather than repeated, which recovered about a kilobyte and a half.
   And the door's priced state was folded into the buyable medallion rules that
   were already there instead of being restated: a door needs exactly two
   declarations of its own, because those are the two a door sets for itself and
   therefore wins at equal weight. That took a kilobyte of stylesheet down to
   four lines. Both were worth doing on their own, and neither was enough. */
/* The critical path raised once more, by two kilobytes, for counting how runs
   end. The game already worked out why every run was over and threw the answer
   away; keeping it per level is what turns the brick ceiling in
   tools/brick-core.mjs from a judgement about players into a measurement of
   them. It is about 1.3kb across the save, the panel that prints it and the one
   line in the app that files it.

   What was tried first, since a budget its own author edits to fit is not a
   budget. The comments on all three were cut to what
   docs/design/15-diagnostics.md does not already say, which recovered 0.1kb.
   There was no more to take: this is code rather than prose.

   What is worth doing and is NOT done here, because it is a change of its own
   rather than a way to fit this one in: the diagnostics panel should not be in
   the critical path at all. It is opened by holding the gold count for
   two-thirds of a second, which is about as far from first paint as a gesture
   gets, and it is five kilobytes. Deferring it would hand back more than twice
   what this took. It stays for now because main.js imports it and publishes it
   on the debug surface the browser specs drive, and because a panel fetched
   after load has to be proven to still open with the network gone, which is
   exactly the promise this file's neighbor asserts. */
/* Raised a second time, by two kilobytes, for the game offering to be told when
   a board is beating somebody. This is the second raise in a row and that is not
   a good look, so the arithmetic is here rather than implied.

   The feature is about forty lines across the panel, the save and the app: a
   count of how a level has gone, a rule for when that is worth mentioning, a
   line under the buttons and a handler that opens the card that already exists.
   The comments on all four were cut into docs/design/15-diagnostics.md first,
   which brought the shell back under its own cap and took about half a kilobyte
   off this one. What is left is code.

   HOW THIS GETS PAID BACK, and it is the same answer as last time: the
   diagnostics panel is five kilobytes reachable only by holding the gold count,
   and it does not belong on the critical path. Both raises together are four,
   so deferring it clears them and leaves a kilobyte over.

   What changed is that deferring it is now safer than when that was first
   written. The objection then was that a panel fetched after load might not have
   arrived on a first visit over a bad network, which is exactly when somebody
   wants it. This change gives it a second entry point that cannot be reached
   until a player has lost the same board five times, by which point a bundle
   fetched eagerly at load has certainly landed. The press-and-hold keeps the old
   exposure; the offer has none. */
const BUDGET = {
  shell: 13_000,
  critical: 214_000,
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

/* The lab is not shipped weight.

   It is a workbench: a page that opens the games in frames so a knob can be
   turned against the live modules. No player reaches it, nothing in the product
   links to it (tests/e2e/lab.spec.js pins that), and as of the same change that
   wrote this it is left out of the worker's precache too — so it is genuinely
   fetched only when somebody asks for it, rather than handed to every install.
   That last part is what makes this exclusion honest rather than convenient: it
   was precached until now, and a page every install downloads is shipped weight
   whatever we call it.

   Counting it here made the number answer a different question from the one it
   asks, and in the direction that matters: the workbench getting better would
   eat the headroom the game needs to grow.

   Its own bundle is still capped by the per-game check above, so this is not a
   corner of dist/ where size stops being measured. It is measured against the
   thing it is. */
const shipped = f => !f.startsWith('lab/') && !/^assets\/lab-[0-9a-f]+\.(js|css)$/.test(f);
let total = 0;
for (const [f, size] of built) if (shipped(f)) total += size;
if (total > BUDGET.total)
  fail(`the build is ${kb(total)}, over its ${kb(BUDGET.total)} budget`);

if (failed) process.exitCode = 1;
else {
  console.log(`${shells.length} shells, largest ${kb(Math.max(...shells.map(f => built.get(f))))} of ${kb(BUDGET.shell)}`);
  console.log(`critical path ${kb(critical)} of ${kb(BUDGET.critical)}`);
  console.log(`${built.size} files, ${kb(total)} of ${kb(BUDGET.total)}`);
}
