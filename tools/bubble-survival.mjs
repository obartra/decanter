#!/usr/bin/env node
/* How often does a run reach each star, and is that a game worth grading?

   This game has no par and cannot have one: the next bubble is dealt at random,
   so the board is not perfect information, and the aim discretizes to about
   thirty landing cells across a run of thirty-odd shots. There is nothing to
   search. What it has instead is a fixed length and a pass rate, and a threshold
   quoted as "three in four competent runs get this far" is a claim as exact as
   par is, about a different kind of game.

   The runs themselves are played by tools/bubble-run.mjs, which the difficulty
   test uses too, so the table printed here and the assertion that guards it
   cannot come to different conclusions. This file is the tables and the verdict
   and nothing else.

   Run: node tools/bubble-survival.mjs [--seeds=N] [--json] */
import { loadBubble } from '../tests/helpers.mjs';
import { POLICIES, HUMAN, measure } from './bubble-run.mjs';

const { BubbleConfig: C } = loadBubble();

const args = process.argv.slice(2);
const SEEDS = Number((args.find(a => a.startsWith('--seeds=')) || '').slice(8)) || 300;
const AS_JSON = args.includes('--json');

/* ---- what the game ships with ---- */
const shipped = POLICIES.map(p =>
  measure({ seeds: SEEDS, every: C.ADVANCE_EVERY, length: C.RUN_SHOTS, miss: p.miss, as: p.as }));

/* ---- the sweep it was chosen out of ----

   Run past the shipped length on purpose, so the table shows where each cadence
   would put a longer run as well and the choice can be second-guessed without
   editing anything.

   On fewer seeds than the rows above, and deliberately. This is sixteen rows of
   context for a decision already made, where those four are what the verdict is
   read off; giving both the full count makes the tool slow enough that nobody
   runs it, and a difficulty tool nobody runs is how the thresholds drifted in
   the first place. */
const MARKS = [20, 25, 30, 35, 40];
const SWEEP_SEEDS = Math.min(SEEDS, 80);
const sweep = [];
for (const every of [4, 5, 6, 8])
  for (const p of POLICIES)
    sweep.push(measure({ seeds: SWEEP_SEEDS, every, length: 40, miss: p.miss, as: p.as }));

const pc = x => `${(x * 100).toFixed(0)}%`;

if (AS_JSON){
  const strip = r => ({ every: r.every, length: r.length, as: r.as,
                        median: r.median, at: r.at });
  console.log(JSON.stringify({ seeds: SEEDS, shipped: shipped.map(strip),
                               sweep: sweep.map(strip) }, null, 1));
} else {
  const { one, two, three } = C.STAR_SHOTS;
  console.log(`${SEEDS} seeds per row\n`);

  console.log(`shipped: a row every ${C.ADVANCE_EVERY} shots, run of ${C.RUN_SHOTS}\n`);
  console.log(`player   median   1* (${one})   2* (${two})   3* (finished ${three})   forced`);
  for (const r of shipped){
    console.log(`${r.as.padEnd(8)}${String(r.median).padStart(5)}   ` +
      `${pc(r.at.one).padStart(8)}${pc(r.at.two).padStart(9)}${pc(r.at.three).padStart(15)}` +
      `${pc(r.forced).padStart(9)}`);
  }
  /* Said out loud because it is the least obvious thing about this game and
     nothing else would ever report it: on most turns the color in hand cannot
     clear anything, so most shots are being placed rather than played. */
  console.log(`\n"forced" is the share of turns where no shot clears anything with the` +
    `\ncolor in hand. Those shots are placements, not decisions.`);

  console.log(`\nthe sweep it came out of, ${SWEEP_SEEDS} seeds: share of runs reaching each shot\n`);
  console.log(`drop  player   ` + MARKS.map(n => `${n}`.padStart(6)).join(''));
  for (const r of sweep){
    if (r.as === POLICIES[0].as) console.log();
    console.log(`${String(r.every).padStart(4)}  ${r.as.padEnd(8)}` +
      MARKS.map(n => pc(r.rate(n)).padStart(6)).join(''));
  }

  /* The thresholds only mean anything against the shipped setting, so say
     plainly whether the shipped rows still support them. These are the same
     three claims the difficulty test asserts, printed here rather than thrown,
     and the bands are the same numbers: a tool that passes while the test fails
     is a tool nobody believes the second time. */
  const human = shipped.filter(r => HUMAN.includes(r.as));
  const luck = shipped.find(r => r.as === 'random');
  const worst = k => Math.min(...human.map(r => r.at[k]));
  const best = k => Math.max(...human.map(r => r.at[k]));

  const claims = [
    [luck.at.one <= 0.30,
      `the first star sits above aiming at nothing (${pc(luck.at.one)} of those seeds reach ${one})`],
    [worst('one') >= 0.85,
      `a competent run reaches the first star (${pc(worst('one'))} at worst), which is what opens the next level`],
    [luck.at.two <= 0.05,
      `the second star is out of reach of aiming at nothing (${pc(luck.at.two)} reach ${two})`],
    [worst('three') >= 0.15 && best('three') <= 0.85,
      `finishing the run is worth playing for and not a formality (${pc(worst('three'))} to ${pc(best('three'))})`]
  ];
  console.log();
  for (const [ok, said] of claims) console.log(`${ok ? 'yes ' : 'NO  '} ${said}`);
  console.log(claims.every(([ok]) => ok)
    ? '\nthe thresholds still describe the game being played'
    : '\nthe thresholds have drifted from the game being played, re-set STAR_SHOTS or the cadence');
}
