#!/usr/bin/env node
/* What easy, normal, hard and ultra are actually made of.

   The graded run is won by lasting 35 shots and clearing the board is a rare
   bonus ending. The sandbox behind Jabari mode inverts that: no shot limit, and
   clearing is the only win. Nothing else asks that question, which is why the
   four settings on the picker are read off this table rather than chosen for
   sounding like difficulty levels.

   THE FIRST ANSWER WAS THAT ONE DIAL CANNOT DO IT. Slowing the drops is the
   obvious lever and it is the weakest: clear rates climb steeply to about a row
   every sixteen and then flatten near half, however slow it gets, because past
   that the thing ending runs is no longer the feed. It is the board silting up
   with the player's own misses, and no amount of waiting fixes those. An "easy"
   built out of cadence alone tops out at a coin flip.

   So a setting is three numbers and a switch:

   - `colours` is the strongest. It decides how often a match is available at
     all, and four against six is the difference between nearly always and often
     not. This is what makes easy actually easy.
   - `rows` is what a clear costs: how much board there is to get rid of.
   - `every` is the pressure, and does most of its work at the hard end where it
     still bites.
   - the limit is off in all four, so clearing is the only way out.

   Ultra drops back to five rows rather than climbing to seven, and the table is
   why: six colours is punishing enough on its own, and seven rows of it is not a
   harder game, it is the same game lost sooner.

   Run: node tools/bubble-sandbox.mjs [--seeds=N] */
import { run } from './bubble-run.mjs';

const SEEDS = Number((process.argv.find(a => a.startsWith('--seeds=')) || '').slice(8)) || 60;
/* long enough that a run ends because the board did, not because we stopped */
const ENDLESS = 400;

/* what the picker offers, and it is the only place these live outside the game */
const PACES = [
  { name: 'Easy',   colours: 4, rows: 4, every: 20 },
  { name: 'Normal', colours: 5, rows: 5, every: 18 },
  { name: 'Hard',   colours: 5, rows: 6, every: 11 },
  { name: 'Ultra',  colours: 6, rows: 5, every: 16 }
];

const POLICIES = [[0, 'best play'], [0.15, 'good'], [0.30, 'competent']];
const pc = x => `${(x * 100).toFixed(0)}%`;

console.log(`${SEEDS} seeds, no shot limit, win = board cleared\n`);
console.log('pace     colours  rows  drop  ' +
            POLICIES.map(([, n]) => n.padStart(11)).join('') + '   median shots');
for (const p of PACES){
  const cells = [];
  let med = 0;
  for (const [miss, name] of POLICIES){
    const outs = [];
    for (let s = 1; s <= SEEDS; s++)
      outs.push(run(s, { every: p.every, length: ENDLESS, miss,
                         colours: p.colours, rows: p.rows }));
    cells.push(pc(outs.filter(o => o.how === 'cleared').length / outs.length).padStart(11));
    if (name === 'competent'){
      const shots = outs.map(o => o.shots).sort((a, b) => a - b);
      med = shots[shots.length >> 1];
    }
  }
  console.log(`${p.name.padEnd(9)}${String(p.colours).padStart(6)}${String(p.rows).padStart(6)}` +
              `${String(p.every).padStart(6)}  ${cells.join('')}${String(med).padStart(15)}`);
}

console.log(`\nA name is worth putting on a button when a competent player can feel the
difference between it and the one above. The numbers behind it are not on the
button, because they only mean anything together: quoting the drop cadence alone
would name the weakest of the three and read as the setting.`);
