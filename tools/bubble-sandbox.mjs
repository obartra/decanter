#!/usr/bin/env node
/* How often can a bubble board actually be emptied, per drop cadence?

   The graded run is won by lasting 35 shots and the board being cleared is a
   rare bonus ending. The sandbox behind Jabari mode inverts that: no shot limit,
   and clearing is the only win. That is a different question and this is the
   only thing that asks it, which is why the four paces on the picker are read
   off this table rather than chosen for sounding like difficulty levels.

   The answer is more lopsided than it looks. Rows keep arriving forever, so
   emptying the board means out-clearing the feed indefinitely, and the cadence
   decides whether that is possible at all rather than merely hard. At the graded
   cadence of four it is not: nothing clears, in any policy, in any seed. The
   rate then climbs steeply to about a row every sixteen and flattens, because
   past that the thing ending runs is no longer the drops, it is the player's own
   misses filling the board. Slowing the feed further cannot fix those, which is
   why the top of the range is a plateau near half and not near everything.

   Runs come from tools/bubble-run.mjs, the same loop the graded harness plays,
   so the two tables describe one game.

   Run: node tools/bubble-sandbox.mjs [--seeds=N] */
import { POLICIES, run } from './bubble-run.mjs';

const SEEDS = Number((process.argv.find(a => a.startsWith('--seeds=')) || '').slice(8)) || 80;
/* Long enough that a run ends because the board did, not because we stopped. A
   winning run at the slow end takes a median of well over a hundred shots. */
const ENDLESS = 400;

/* the four on the picker, and the neighbours that show why they are the four */
const PACES = { 36: 'Easy', 24: 'Normal', 16: 'Hard', 10: 'Ultra' };
const CADENCES = [4, 8, 10, 12, 16, 20, 24, 30, 36, 40];

const pc = x => `${(x * 100).toFixed(0)}%`;

console.log(`${SEEDS} seeds, no shot limit, win = board cleared\n`);
console.log(`drop  ` + POLICIES.map(p => p.as.padStart(8)).join('') +
            '   median shots     pace');
for (const every of CADENCES){
  const cells = [];
  let med = 0;
  for (const p of POLICIES){
    const outs = [];
    for (let s = 1; s <= SEEDS; s++) outs.push(run(s, { every, length: ENDLESS, miss: p.miss }));
    cells.push(pc(outs.filter(o => o.how === 'cleared').length / outs.length).padStart(8));
    if (p.as === 'ok'){
      const shots = outs.map(o => o.shots).sort((a, b) => a - b);
      med = shots[shots.length >> 1];
    }
  }
  console.log(`${String(every).padStart(4)}  ${cells.join('')}   ${String(med).padStart(12)}` +
              `     ${PACES[every] || ''}`);
}

console.log(`\nA pace is worth having on the picker when its odds differ from the one
above it. Past about a row every twenty four they stop differing, which is
where the top of the range sits rather than at the slowest cadence that
would still work.`);
