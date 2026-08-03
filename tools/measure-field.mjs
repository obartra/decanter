#!/usr/bin/env node
/* Measure the field of benches, choose forty of them, and write the two
   committed tables: src/measure/js/pure/32-order.js and src/measure/js/pure/35-pars.js.

   The same job tools/order.mjs and tools/pars.mjs do for the pour game, in one
   file, because here they are one job. Over there par is milliseconds and
   difficulty is minutes, so difficulty is measured across a pool of child
   processes and par is solved afterwards in a separate pass. Here a whole board
   — every reachable position, the exact distance from each of them to the
   target, and one optimal line walked — costs about a millisecond, so the entire
   field fits in one process in a few seconds and par falls out of the same
   sweep. Splitting it would mean writing the two tables from two different
   measurements, which is the exact way the other game's par table and ordering
   once came to disagree about what a level even was.

   WHAT THE MEASUREMENT FOUND, and what this acts on:

   - Two-vessel boards have a choice score of EXACTLY ZERO, right across the
     field of the earlier variant that had a tap and a drain: every step of every
     optimal line has one move that keeps par reachable, so a long par there is a
     handle being turned. In the pour-only variant this game actually ships, it
     is not even long — a two-vessel bench has at most two reachable positions
     and the longest par over every such bench up to capacity 24 is ONE. They are
     not dealt; see MeasureConfig.VESSELS.
   - More vessels makes a board EASIER. Every extra vessel is another route to
     the target, so par falls as the count rises. The count is not a difficulty
     knob and is not used as one.
   - Measured to a ceiling of 16, three-vessel boards averaged a choice of 0.04
     and four-vessel 0.21, which is low, and par topped out at 12. That ceiling
     was the problem rather than the mechanic: the long lines need a large vessel
     against small ones, and 16 leaves no room for the ratio. Re-measured to 24,
     the field is both longer and branchier.
   - So boards are selected on par AND choice, never on par alone. Sorting the
     field by par and taking a spread gives a curve full of two-move boards with
     one line through them.

   Run: node tools/measure-field.mjs [--levels=N] [--seeds=N] */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../tests/helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find(a => a.startsWith(`--${name}=`));
  return hit ? Number(hit.slice(name.length + 3)) : fallback;
};
const LEVELS = arg('levels', 40);
/* Per vessel count. Twenty thousand is about a minute and yields a field of
   five and a half thousand boards worth having, which is enough to fill every
   par from 3 to 16 several times over. Three thousand runs in ten seconds and
   gives a curve that stops at 16 with one board holding the top of it. */
const SEEDS = arg('seeds', 20000);

/* The shipped modules, not a copy of them. The measurement has to be about the
   game as played; see the note on MeasureSearch.survey for why the rules are not
   restated here the way the pour game's harness restates its own. */
const { MeasureConfig: C, MeasureLevels: L, MeasureSearch: S } =
  loadGame('measure');

/* A board worth putting a level number on.

   MIN_PAR is 3 rather than 2 because a two-pour board is a demonstration, not a
   puzzle, and there are tens of thousands of them: left in, they fill the first
   third of the curve.

   MIN_CHOICE is the floor that stops this becoming a par-only sort. A board
   where fewer than a quarter of the steps offer a real decision is a board being
   recited. It is deliberately not higher: choice counts steps with more than one
   correct option, so a genuinely narrow board — one where every step has several
   plausible pours and only one that works — scores low on it and is exactly the
   kind of board this game is for. `tight` is what separates those two, and it is
   the tie break below rather than a filter. */
const MIN_PAR = 3;
const MIN_CHOICE = 0.25;

const field = [];
const seenBoards = new Set();
for (const vessels of C.VESSELS){
  for (let seed = 1; seed <= SEEDS; seed++){
    const board = L.fromSeed(vessels, seed);
    /* Two seeds can deal the same bench. Keeping both would let one board hold
       two level numbers, which is a level that is not a new puzzle. */
    const id = `${board.caps.join(',')}>${board.target}`;
    if (seenBoards.has(id)) continue;
    seenBoards.add(id);
    const m = S.survey(board.caps, board.start, board.target);
    if (!m || m.par == null || m.par < MIN_PAR) continue;
    if (m.choice < MIN_CHOICE) continue;
    field.push({ vessels, seed, ...board, ...m });
  }
}

const byPar = new Map();
for (const f of field){
  if (!byPar.has(f.par)) byPar.set(f.par, []);
  byPar.get(f.par).push(f);
}
/* Within a par, the narrowest line first: `tight` is the average share of the
   options at a step that are correct, so a low tight is a board where most of
   what you could do is wrong. Choice breaks the tie, because a board with a real
   branch in it is a board where being right was a decision.

   The last key is the size of the largest vessel, smallest first, and it is
   there for the short boards. At par three there are a hundred and fifty boards
   tied on the first two keys and the choice between them was arbitrary, which
   handed the opening levels a twenty-two unit tower to solve in three pours. A
   small bench is easier to read and there is no reason to hand out a large one
   until the puzzle needs it. */
for (const list of byPar.values()){
  list.sort((a, b) => a.tight - b.tight || b.choice - a.choice || a.caps[0] - b.caps[0]);
}
const pars = [...byPar.keys()].sort((a, b) => a - b);

const mix = n => field.filter(f => f.vessels === n).length;
console.log(`${field.length} boards worth having, from ${seenBoards.size} distinct benches`);
console.log(`  ${mix(3)} of three vessels, ${mix(4)} of four`);
console.log(`par ${pars[0]} to ${pars[pars.length - 1]} across ${pars.length} values\n`);
console.log('  par  boards   best tight   best choice');
for (const par of pars){
  const list = byPar.get(par);
  console.log(`  ${String(par).padStart(3)}  ${String(list.length).padStart(6)}   ${list[0].tight.toFixed(3).padStart(10)}   ${list[0].choice.toFixed(2).padStart(11)}`);
}

/* Hand the level numbers out along the sorted pars, so the curve is
   non-decreasing by construction rather than by luck. Spare slots go to the
   short boards, at the front: a player meeting this bench for the first time
   needs a few three-pour boards to learn what a pour does, and by par nine they
   need a new board rather than a fifth one of the same length. */
const share = Math.floor(LEVELS / pars.length);
const spare = LEVELS - share * pars.length;
const picked = [];
pars.forEach((par, i) => {
  const want = share + (i < spare ? 1 : 0);
  picked.push(...byPar.get(par).slice(0, want));
});
/* A par value can run out of boards before its share is filled. Top up from the
   longest boards there are rather than from the shortest, so a short field
   shortens the curve at neither end and simply repeats its hardest boards. */
for (let par = pars.length - 1; picked.length < LEVELS && par >= 0; par--){
  for (const f of byPar.get(pars[par])){
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
console.log('\n  level   vessels                 measure   par   choice   tight   dead');
for (const [i, f] of picked.entries()){
  console.log(`  ${String(i + 1).padStart(5)}   ${f.caps.join(', ').padEnd(20)} ${String(f.target).padStart(6)}` +
    `   ${String(f.par).padStart(3)}   ${f.choice.toFixed(2).padStart(6)}   ${f.tight.toFixed(3).padStart(5)}   ${f.dead.toFixed(2)}`);
}

const orderEntries = picked.map((f, i) => `${i + 1}:[${f.vessels},${f.seed}]`).join(',');
writeFileSync(join(root, 'src/measure/js/pure/32-order.js'), `/* Generated by \`npm run measure:field\`. Do not edit by hand.

   What each level deals, as [vessels, seed], which MeasureLevels.fromSeed turns
   back into a bench and a target. Chosen on par AND on how much of a decision
   each step of that par is: sorting the field on length alone fills the first
   half of the game with two-pour boards that have one line through them. See
   tools/measure-field.mjs.

   Regenerating this moves every level, so 35-pars.js has to be regenerated with
   it. The tool writes both, in one pass, from one measurement, for that reason. */
export const MeasureOrder = Object.freeze({${orderEntries}});
`);

const parEntries = picked.map((f, i) => `${i + 1}:${f.par}`).join(',');
writeFileSync(join(root, 'src/measure/js/pure/35-pars.js'), `/* Generated by \`npm run measure:field\`. Do not edit by hand.

   The exact minimum for every level, from a breadth first search over the whole
   reachable state space. Levels are deterministic in the level number, so these
   are fixed properties of a board rather than something worth rediscovering on
   every visit, and a slow phone shows the same number as a fast laptop.

   \`last\` travels in the same object rather than as a second global, because a
   par table and the level it ends at are one fact and publishing them separately
   invites them to disagree. Past \`last\` a level is still dealt and still
   playable, it has simply been measured by nobody — and 45-score.js gives it NO
   STARS rather than full marks. That is the opposite of what the other game's
   Rules.rate() does with a missing par, and the inversion is deliberate: see
   45-score.js, which explains which way round it is and why. */
export const MeasurePars = Object.freeze({ last: ${picked.length}, par: Object.freeze({${parEntries}}) });
`);

console.log(`\nwrote src/measure/js/pure/32-order.js and src/measure/js/pure/35-pars.js for ${picked.length} levels`);
