#!/usr/bin/env node
/* How long does a run last, and is that a number worth putting stars on?

   This game has no par and cannot have one: the next bubble is dealt at random,
   so the board is not perfect information, and the aim discretises to about
   thirty landing cells across a run of thirty-odd shots. There is nothing to
   search. What there is instead is a distribution, and a threshold set at a
   percentile of it is a claim as exact as par is, about a different kind of game.

   Plays the real thing. The board comes from BubbleRules.dealBoard and the shots
   from BubbleAdvice.bestShot, which are the same deal the player is given and
   the same shot the hint button offers. A harness with its own copy of either
   measures a game nobody plays, which is what the first version of this did
   before both were pulled into the pure modules.

   Two policies, because one number cannot say what you need to know. Random aim
   is the floor; the gap between it and the greedy line is how much the run
   rewards playing well, and a level where that gap is small is a luck readout
   however hard it happens to be.

   Run: node tools/bubble-survival.mjs [--seeds=N] [--json] */
import { loadBubble } from '../tests/helpers.mjs';

const { BubbleConfig: C, BubbleGrid: G, BubbleShot: S, BubbleRules: R,
        BubbleAdvice: Adv } = loadBubble();

const args = process.argv.slice(2);
const SEEDS = Number((args.find(a => a.startsWith('--seeds=')) || '').slice(8)) || 300;
const AS_JSON = args.includes('--json');
const CAP = 800;

const rng = seed => { let s = seed >>> 0 || 1; return () => {
  s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };

/* One run, played to its end, returning how long it lasted and what ended it.
   The cadence is passed in so a candidate setting can be measured without
   editing the config the game ships with. */
function run(seed, { every, ramp, greedy }){
  const rnd = rng(seed);
  const b = R.dealBoard(5, rnd);
  const cadenceAt = shots => Math.max(C.ADVANCE_MIN, every - Math.floor(shots / ramp));

  let sinceDrop = 0;
  for (let shot = 1; shot <= CAP; shot++){
    const colours = R.liveColours(b);
    if (!colours.length) return { shots: shot - 1, how: 'cleared' };
    const colour = colours[Math.floor(rnd() * colours.length)];

    let landing = null;
    if (greedy){
      const best = Adv.bestShot(b, colour, S.resolveShot);
      landing = best && best.landing;
    } else {
      const a = (rnd() * 160 - 80) * Math.PI / 180;
      landing = S.resolveShot(b, C.MUZZLE, { x: Math.sin(a), y: -Math.cos(a) }).landing;
    }
    if (!landing) return { shots: shot - 1, how: 'blocked' };

    const res = R.resolveTurn(b, landing, colour);
    if (res.won) return { shots: shot, how: 'cleared' };
    if (res.lost) return { shots: shot, how: 'line' };

    if (++sinceDrop >= cadenceAt(shot)){
      sinceDrop = 0;
      G.advance(b, R.freshRow(b, rnd));
      R.remove(b, R.detach(b));
      if (R.isLost(b)) return { shots: shot, how: 'line' };
    }
  }
  return { shots: CAP, how: 'capped' };
}

const pct = (xs, p) => xs.slice().sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)];

function measure(opts){
  const outs = [];
  for (let s = 1; s <= SEEDS; s++) outs.push(run(s, opts));
  const shots = outs.map(o => o.shots);
  const how = {};
  for (const o of outs) how[o.how] = (how[o.how] || 0) + 1;
  const p10 = pct(shots, 0.1), p50 = pct(shots, 0.5), p90 = pct(shots, 0.9);
  return { ...opts, p10, p50, p90, max: Math.max(...shots),
           spread: +(p90 / Math.max(1, p10)).toFixed(2), how };
}

/* A ramp this large never fires inside a run, which is how "no ramp" is spelled
   without a second code path. */
const NO_RAMP = 10_000;
const SETTINGS = [];
for (const greedy of [false, true])
  for (const every of [10, 8, 5]) SETTINGS.push({ every, ramp: NO_RAMP, greedy });
for (const ramp of [30, 20, 12]) SETTINGS.push({ every: 10, ramp, greedy: true });
/* what the game actually ships with, last, because that is the row the star
   thresholds have to agree with */
SETTINGS.push({ every: C.ADVANCE_EVERY, ramp: C.RAMP_EVERY, greedy: true, shipped: true });

const rows = SETTINGS.map(measure);

if (AS_JSON){
  console.log(JSON.stringify(rows, null, 1));
} else {
  console.log(`${SEEDS} seeds per row, cap ${CAP} shots\n`);
  console.log('policy   every  ramp   p10  p50  p90  max  spread  outcomes');
  for (const r of rows){
    const ramp = r.ramp >= NO_RAMP ? '  -' : String(r.ramp).padStart(3);
    console.log(
      `${(r.greedy ? 'greedy' : 'random').padEnd(8)} ${String(r.every).padStart(4)}  ${ramp}  ` +
      `${String(r.p10).padStart(4)} ${String(r.p50).padStart(4)} ${String(r.p90).padStart(4)} ` +
      `${String(r.max).padStart(4)}   ${String(r.spread).padStart(5)}  ${JSON.stringify(r.how)}` +
      (r.shipped ? '   <- shipped' : ''));
  }

  /* The thresholds only mean anything against the shipped setting, so say
     plainly whether the shipped row still supports them. */
  const ship = rows[rows.length - 1];
  const { one, two, three } = C.STAR_SHOTS;
  console.log(`\nstar thresholds  1* ${one}   2* ${two}   3* ${three} (or cleared)`);
  console.log(`shipped run      p10 ${ship.p10}  p50 ${ship.p50}  p90 ${ship.p90}`);
  const near = (a, b) => Math.abs(a - b) <= Math.max(6, b * 0.2);
  console.log(near(one, ship.p10) && near(two, ship.p50) && near(three, ship.p90)
    ? 'thresholds still track the measured run'
    : 'thresholds have drifted from the measured run, re-set STAR_SHOTS');
}
