#!/usr/bin/env node
/* Measure a field of cellar floors, choose sixty of them, and write the two
   committed tables: src/casks/js/32-boards.js and src/casks/js/35-pars.js.

   Both from one measurement, in one pass, the way tools/measure-field.mjs does
   and for the same reason: writing a board table and a par table from two
   separate measurements is precisely how the pour game's ordering and its par
   table once came to disagree about what a level even was.

   ---- HOW THIS SEARCHES, AND THE TWO WAYS IT USED TO ----

   Sliding is reversible, so the move graph is UNDIRECTED (the argument is at the
   top of src/casks/js/25-search.js). One multi-source sweep outward from every
   state in which the gilt cask is already at the door therefore gives the exact
   distance to the door for EVERY state in the layout's reachable component, in
   one search — and the state furthest from the door is provably the hardest
   start that layout can offer. Not the hardest found. The hardest there is.

   That is generation run backwards, and it replaced two earlier approaches:

     Rejection sampling. Deal a board, solve it, keep it if par clears a bar,
     otherwise deal another. About three seconds a board and a ceiling of par 19,
     because it can only ever return the first acceptable board rather than the
     best one, and the boards it is sampling from are mostly trivial to begin
     with. Abandoned.

     The backward sweep, done naively. Correct, and the right idea, but it
     re-derived the geometry on every visit: once to walk the component and again
     to sweep it, rebuilding the occupancy grid and every cask's run each time.
     CasksSearch.component now keeps the neighbour lists it built while walking
     and the sweep reuses them, and states are keyed by a packed string rather
     than a joined one.

   ---- WHAT THE MEASUREMENT FOUND, AND WHAT THIS ACTS ON ----

   - Random layouts are mostly TRIVIAL. The median board is worth three to six
     moves. So the field is drawn deliberately rather than uniformly.
   - DENSE FLOORS ARE WHERE THE INTERESTING BOARDS LIVE, and they are cheaper to
     measure as well: less room to move means a smaller component. Hence the
     weighting in FIELD below.
   - A SECOND HORIZONTAL CASK ON THE EXIT ROW is never dealt. It can wall the
     gilt cask in from the far side, which does not make a board hard, it makes
     it unsolvable. CasksRules.wellFormed says the same thing where a test can
     read it.
   - Boards are chosen on par AND on how much of a decision each step of it is.
     Sorting the field on length alone fills the early game with boards that have
     exactly one line through them.

   The rules and the sweep are the shipped modules, never a copy. There is no
   second implementation of this game to cross-check against, so a tool with its
   own idea of what a slide is would not be a check, it would be a second place
   for the same mistake to live. What is NOT shipped is the placement below: a
   way of drawing candidate layouts is not a rule of the game and the page never
   needs one, because the page reads a table.

   Run: node tools/casks-field.mjs [--levels=N] [--seeds=N] */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFrom } from '../tests/helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find(a => a.startsWith(`--${name}=`));
  return hit ? Number(hit.slice(name.length + 3)) : fallback;
};
const LEVELS = arg('levels', 60);
/* Layouts drawn per unit of the weighting below. 400 is about ten minutes and
   draws twenty thousand layouts, which yields a field of several thousand
   distinct boards filling every par from 1 into the thirties. 30 runs in about a
   minute and gives a shorter curve of the same shape, which is what to use while
   changing anything here. */
const SEEDS = arg('seeds', 400);

const { CasksConfig: C, CasksRules: R, CasksSearch: S, CasksLevels: L } =
  loadFrom('src/casks/js', ['00-config.js', '20-rules.js', '25-search.js', '30-levels.js']);

/* A cap on the component, not a budget, and the single number that decides what
   this costs to run.

   An open floor can reach well over a hundred thousand positions, and those are
   the layouts least worth the seconds: everything has somewhere to go, so almost
   nothing blocks anything and par is small. A layout that trips this is dropped
   rather than measured badly — the sweep only ever answers about a component it
   walked in full.

   The number is a cost decision. At 40,000 about half the draws tripped it
   anyway, at roughly 47ms a layout; at 24,000 rather more of them do, at roughly
   33ms. Dropping a layout early is far cheaper than measuring it, so a lower cap
   is paid for twice over — and what it loses is the open floors, which are the
   ones with nothing in them. */
const COMPONENT_CAP = 24000;

/* Par 1 is kept. A board whose answer is "slide the gilt cask to the door" is
   not a puzzle, but it is the one board that teaches the control, and there is
   nowhere better than level one to put it. Below that there is nothing: par 0
   is a board that is already open. */
const MIN_PAR = 1;

/* The field, as (extra casks, share of three-cell casks) pairs and how heavily
   each is sampled. Density is the whole story — see the header — so the weight
   climbs with the count and falls away again at fourteen casks, where a floor is
   so full that most layouts cannot move at all and the ones that can are short.

   The long-cask share is two values rather than one because they produce
   genuinely different rooms: a floor of two-cell casks is a sliding puzzle with
   a lot of small pieces, and a floor with a third of them three cells long has
   long obstructions that have to be routed around rather than nudged. */
const FIELD = [];
for (const [count, weight] of [[5, 1], [6, 1], [7, 1], [8, 2], [9, 4], [10, 5], [11, 5], [12, 4], [13, 2]]){
  for (const longShare of [0.25, 0.45]) FIELD.push({ count, longShare, weight });
}

/* Copied rather than imported, exactly as every game here copies its own stream.
   A shared RNG would be a piece of one game that another could not change
   without moving somebody else's levels. */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashSeed(n){
  let x = Math.imul(n + 0x9e3779b9, 2654435761) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13; x = Math.imul(x, 3266489917) >>> 0;
  x ^= x >>> 16; return x >>> 0;
}

/* One candidate layout, plus somewhere legal for everything to stand.

   The starting position handed back is only a seed for the sweep: it says which
   component of the layout's state graph to look at, and the sweep then chooses
   the start that actually ships. So this does not have to be a good board and is
   not trying to be one.

   Placement is by rejection against the occupancy so far, with a try budget,
   because a floor of thirteen casks is dense enough that the last few have very
   few places to go and a scheme that placed them in order would bias every board
   toward the same corner. A layout that comes up short of its count is dropped
   rather than shipped smaller, so the density weighting above means what it
   says. */
function layout(rng, { count, longShare }){
  const casks = [{ len: C.GILT_LEN, horiz: true, fixed: C.EXIT_ROW }];
  const pos = [0];
  const taken = new Array(C.W * C.H).fill(false);
  taken[C.EXIT_ROW * C.W] = true;
  taken[C.EXIT_ROW * C.W + 1] = true;

  const fits = (cask, p) => {
    const b = R.boxOf(cask, p);
    for (let r = b.r; r < b.r + b.h; r++){
      for (let c = b.c; c < b.c + b.w; c++){
        if (r < 0 || r >= C.H || c < 0 || c >= C.W || taken[r * C.W + c]) return false;
      }
    }
    return true;
  };

  for (let tries = 0; casks.length <= count && tries < 500; tries++){
    const horiz = rng() < 0.5;
    const len = rng() < longShare ? 3 : 2;
    const cask = { len, horiz, fixed: Math.floor(rng() * (horiz ? C.H : C.W)) };
    /* Never a second horizontal cask on the exit row: it can wall the gilt one
       in from the far side, which is unsolvable rather than hard. */
    if (horiz && cask.fixed === C.EXIT_ROW) continue;
    const p = Math.floor(rng() * (R.span(cask) + 1));
    if (!fits(cask, p)) continue;
    const b = R.boxOf(cask, p);
    for (let r = b.r; r < b.r + b.h; r++){
      for (let c = b.c; c < b.c + b.w; c++) taken[r * C.W + c] = true;
    }
    casks.push(cask); pos.push(p);
  }
  return casks.length === count + 1 ? { casks, pos } : null;
}

/* ---- the measurement ---- */
const started = Date.now();
const field = [];
const seen = new Set();
let drawn = 0, short = 0, capped = 0, hopeless = 0;

for (const spec of FIELD){
  const draws = SEEDS * spec.weight;
  for (let s = 1; s <= draws; s++){
    drawn++;
    const seed = hashSeed(s * 7919 + spec.count * 131 + Math.round(spec.longShare * 100));
    const made = layout(mulberry32(seed), spec);
    if (!made){ short++; continue; }
    const best = S.hardest(made.casks, made.pos, COMPONENT_CAP);
    if (!best){ capped++; continue; }
    if (best.par < MIN_PAR){ hopeless++; continue; }
    const text = L.encode(made.casks, best.pos);
    /* Two draws can land on the same layout, and the sweep then chooses the same
       start from it. Keeping both would let one board hold two level numbers,
       which is a level that is not a new puzzle. */
    if (seen.has(text)) continue;
    seen.add(text);
    field.push({ text, casks: made.casks.length, ...best });
  }
}

const byPar = new Map();
for (const f of field){
  if (!byPar.has(f.par)) byPar.set(f.par, []);
  byPar.get(f.par).push(f);
}
/* Within a par: the narrowest line first, since `tight` is the average share of
   the moves at a step that are correct and a low tight is a board where most of
   what you could do is wrong. Choice breaks the tie, because a board with a real
   branch in it is a board where being right was a decision.

   The last key is the number of casks, fewest first, and it exists for the short
   boards. At par one there are dozens of boards tied on the first two keys and
   the choice between them was arbitrary, which handed level one a floor of
   fourteen casks to demonstrate a single slide on. A crowded room is harder to
   read and there is no reason to hand one over until the puzzle needs it. */
for (const list of byPar.values()){
  list.sort((a, b) => a.tight - b.tight || b.choice - a.choice || a.casks - b.casks);
}
const pars = [...byPar.keys()].sort((a, b) => a - b);

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`THE CELLAR DOOR — ${field.length} distinct boards from ${drawn} layouts in ${secs}s`);
console.log(`  ${short} could not be placed, ${capped} over the component cap, ${hopeless} with no way out`);
console.log(`par ${pars[0]} to ${pars[pars.length - 1]} across ${pars.length} values\n`);
console.log('  par  boards   casks   best tight   best choice   component');
for (const par of pars){
  const list = byPar.get(par);
  console.log(`  ${String(par).padStart(3)}  ${String(list.length).padStart(6)}   ${String(list[0].casks).padStart(5)}   ` +
    `${list[0].tight.toFixed(3).padStart(10)}   ${list[0].choice.toFixed(2).padStart(11)}   ${String(list[0].component).padStart(9)}`);
}

/* Hand the level numbers out along the sorted pars, so the curve is
   non-decreasing BY CONSTRUCTION rather than by luck. Spare slots go to the
   short boards at the front: somebody meeting a cellar floor for the first time
   needs a few boards to learn what a slide is, and by par fifteen they need a
   different board rather than a fifth one of the same length. */
const share = Math.floor(LEVELS / pars.length);
const spare = LEVELS - share * pars.length;
const picked = [];
pars.forEach((par, i) => {
  picked.push(...byPar.get(par).slice(0, share + (i < spare ? 1 : 0)));
});
/* A par can run out of boards before its share is filled. Top up from the
   longest boards there are rather than the shortest, so a thin field shortens
   the curve at neither end and simply repeats its hardest rooms. */
for (let i = pars.length - 1; picked.length < LEVELS && i >= 0; i--){
  for (const f of byPar.get(pars[i])){
    if (picked.length >= LEVELS) break;
    if (!picked.includes(f)) picked.push(f);
  }
}
picked.sort((a, b) => a.par - b.par || b.tight - a.tight);

const curve = picked.map(p => p.par);
const steps = curve.slice(1).map((p, i) => p - curve[i]);
console.log(`\n${picked.length} levels`);
console.log('par curve: ' + curve.join(' '));
console.log(`steps that go down: ${steps.filter(s => s < 0).length} of ${steps.length}`);
console.log('\n  level   casks   par   choice   tight   component   board');
for (const [i, f] of picked.entries()){
  console.log(`  ${String(i + 1).padStart(5)}   ${String(f.casks).padStart(5)}   ${String(f.par).padStart(3)}   ` +
    `${f.choice.toFixed(2).padStart(6)}   ${f.tight.toFixed(3).padStart(5)}   ${String(f.component).padStart(9)}   ${f.text}`);
}

/* ---- the two tables ---- */
const boardEntries = picked.map((f, i) => `${i + 1}:'${f.text}'`).join(',');
writeFileSync(join(root, 'src/casks/js/32-boards.js'), `/* Generated by \`npm run casks:field\`. Do not edit by hand.

   The floor of every level, four characters per cask — axis, length, the row or
   column it is pinned to, and where it starts. CasksLevels.parse reads it and
   CasksLevels.encode wrote it, so the format is defined once and the tool cannot
   spell it differently from the page.

   These are not seeds. A random scattering of casks is overwhelmingly likely to
   be trivial and finding out costs a sweep of the layout's whole reachable
   component, so the boards themselves are measured offline and shipped. The
   opposite of what src/measure/js does, and the reason is cost rather than
   principle; the note at the top of 30-levels.js sets it out.

   Every board here is the state PROVABLY FURTHEST from the door in its layout's
   reachable component, which is the hardest start that layout can offer.
   Regenerating this moves every level, so 35-pars.js has to be regenerated with
   it. The tool writes both, in one pass, from one measurement, for that reason. */
globalThis.CasksBoards = Object.freeze({${boardEntries}});
`);

const parEntries = picked.map((f, i) => `${i + 1}:${f.par}`).join(',');
writeFileSync(join(root, 'src/casks/js/35-pars.js'), `/* Generated by \`npm run casks:field\`. Do not edit by hand.

   The exact minimum for every level, from a multi-source breadth first sweep
   over the whole reachable component of that level's layout. Boards are a
   shipped table rather than a seed, so par is a fixed property of a level and is
   never recomputed in the page: a slow phone shows the same number as a fast
   laptop, and the number both show is the one the levels were chosen against.

   \`last\` travels in the same object rather than as a second global, because a
   par table and the level it ends at are one fact and publishing them separately
   invites them to disagree. A board with no par here is not an unmeasured board,
   it is these two tables having come apart — and 45-score.js gives it NO STARS
   rather than full marks. That is the opposite of what the pour game's
   Rules.rate() does with a missing par, and the inversion is deliberate: see
   45-score.js, which explains which way round it is and why. */
globalThis.CasksPars = Object.freeze({ last: ${picked.length}, par: Object.freeze({${parEntries}}) });
`);

console.log(`\nwrote src/casks/js/32-boards.js and src/casks/js/35-pars.js for ${picked.length} levels`);
