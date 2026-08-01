/* Choose which board each level deals, so that difficulty actually rises.

   Measured difficulty and level number were uncorrelated (r = 0.05 over the
   first 120). Colour count climbs, which looks like a curve, but it is not one.
   Two separate problems sat underneath that:

     the boards within a shape were in seed order, which is arbitrary, so the 104
     twelve-colour levels spanned fourteen orders of magnitude in no order at all

     the shape itself sawtoothed, because the empty count alternates with the
     parity of the colour count and empties dominate: every extra empty adds
     legal moves and most of them are wrong, so the odd-colour levels came out
     far harder than the even-colour ones on either side of them

   The second is why level 16 was harder than everything up to about level 90.

   What is fixed and what is free:

     bottle count   fixed, and climbs with the level number, so the board grows
                    steadily and never shrinks
     colours        free within a bottle count, because 5 colours + 3 empties and
                    6 colours + 2 empties are both eight bottles and look the same
     seed           free

   So levels are grouped into bottle-count bands and filled from the measured
   difficulty of the boards that fit that many bottles. A band with plenty of
   levels (the fourteen-bottle one holds every level past fifteen) sorts boards of
   the shape its levels already used. A band with few measures a field of every
   shape it could wear and lets the numbers pick.

   Everything is measured properly; nothing is chosen on a proxy. An earlier
   version sifted a wide field on par first, which is backwards across shapes: a
   three-empty board has a shorter par than a two-empty one and a far narrower
   line, so the sift reliably nominated the hardest board in the band.

   Every measurement is independent, so they run across a pool of child
   processes, handed out one at a time. Cost varies by orders of magnitude
   between boards of the same shape, so a fixed slice per worker would leave most
   of the machine waiting on one unlucky board.

   Writes src/js/32-order.js as `level: [colours, empties, seed]`. Bump
   CONFIG.layout and regenerate the par table afterwards: the board behind a
   level number has changed.

   Run: node tools/order.mjs [levels] [field] [--jobs=N] */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { cpus } from 'node:os';
import { loadPure } from '../tests/helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const ctx = loadPure();
const args = process.argv.slice(2);
const nums = args.filter(a => /^\d+$/.test(a));
const LEVELS = Number(nums[0]) || 120;
const FIELD = Number(nums[1]) || 12;        /* candidate boards per level, per shape */
const JOBS = Number((args.find(a => a.startsWith('--jobs=')) || '').slice(7)) || Math.max(1, cpus().length - 2);
const BIG_BAND = 8;                         /* a band this size already owns enough boards to sort */

const keyOf = j => `${j.colors}/${j.empties}:${j.seed}`;

/* Hand `jobs` out to a pool of workers, one at a time, and resolve with a map
   from the job's key to its measurement (or null). */
function measureAll(label, jobs){
  return new Promise((resolve, reject) => {
    const results = new Map();
    const queue = jobs.slice();
    const total = jobs.length;
    let done = 0;
    let settled = false;
    const workers = [];

    const finish = () => {
      if (settled) return;
      settled = true;
      for (const w of workers) if (w.connected) w.send('stop');
      process.stdout.write(`  ${label} ${done}/${total}\n`);
      resolve(results);
    };
    const feed = w => {
      const job = queue.shift();
      if (!job){
        w.idle = true;
        if (workers.every(x => x.idle)) finish();
        return;
      }
      w.idle = false;
      w.send(job);
    };

    if (!jobs.length) return resolve(results);
    for (let i = 0; i < Math.min(JOBS, jobs.length); i++){
      const w = fork(join(here, 'measure-worker.mjs'), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      w.idle = true;
      w.on('message', msg => {
        if (msg === 'ready') return feed(w);
        results.set(keyOf(msg.job), msg.result);
        done++;
        process.stdout.write(`  ${label} ${done}/${total}\r`);
        feed(w);
      });
      /* a worker that dies takes its job with it; the rest carry on, and a
         missing measurement is already handled as an unmeasurable board */
      w.on('exit', () => {
        w.idle = true;
        if (!settled && workers.every(x => x.idle) && !queue.length) finish();
        else if (!settled && queue.length && workers.every(x => !x.connected)) reject(new Error('every worker died'));
      });
      w.on('error', reject);
      workers.push(w);
    }
  });
}

/* Group levels by how many bottles they show, and collect every shape that can
   fill that many. The bottle count stays welded to the level number; which of
   its shapes gets used does not. */
const bands = new Map();
for (let level = 1; level <= LEVELS; level++){
  const { bottles } = ctx.Levels.baseShape(level);
  if (!bands.has(bottles)) bands.set(bottles, { bottles, levels: [], shapes: [] });
  bands.get(bottles).levels.push(level);
}
for (let level = 1; level <= LEVELS; level++){
  const { colors, empties, bottles } = ctx.Levels.baseShape(level);
  const band = bands.get(bottles);
  if (!band.shapes.some(s => s.colors === colors)) band.shapes.push({ colors, empties });
}
const plan = [...bands.values()].sort((a, b) => a.bottles - b.bottles);
function dominantShape(band){
  const tally = new Map();
  for (const level of band.levels){
    const { colors } = ctx.Levels.baseShape(level);
    tally.set(colors, (tally.get(colors) || 0) + 1);
  }
  const [colors] = [...tally].sort((a, b) => b[1] - a[1])[0];
  return band.shapes.find(s => s.colors === colors);
}
for (const band of plan) band.big = band.levels.length >= BIG_BAND;

/* a stride, not a run, so the candidate boards actually differ */
const seedsFor = (band, n, salt) =>
  Array.from({ length: n }, (_, c) => band.bottles * 7919 + salt * 131 + c * 977);

/* What each band will look at.

   A big band needs comfortably more boards than levels. Not only to absorb the
   ones too expensive to measure, but because those are disproportionately the
   hardest ones: without slack the top of the curve gets quietly truncated by its
   own measurement cost. It sticks to the shape most of its levels already used. Mixing its second shape
   in would mean measuring a hundred three-empty boards, which are both the most
   expensive to search and the ones the curve has least use for.

   A small band has nothing to sort, so it measures a field of every shape it
   could wear and lets the numbers decide which one each level gets. */
for (const band of plan){
  const want = band.big ? Math.ceil(band.levels.length * 2.2) : FIELD * band.levels.length;
  const shapes = band.big ? [dominantShape(band)] : band.shapes;
  band.field = shapes.flatMap((s, i) => seedsFor(band, Math.ceil(want / shapes.length), i)
    .map(seed => ({ ...s, seed })));
}

const sift = plan.flatMap(b => b.field);
console.log(`${plan.length} bands, ${JOBS} workers`);
console.log(`${sift.length} boards to measure`);
const measured = await measureAll('measured', sift);

const hardness = c => {
  const m = measured.get(keyOf(c));
  return m ? { ...c, ...m } : null;
};

const order = {};
const chosen = new Map();
const bandOf = new Map();
for (const band of plan) for (const level of band.levels) bandOf.set(level, band);
for (const band of plan) band.pool = band.field.map(hardness).filter(Boolean).sort((a, b) => a.hard - b.hard);

/* The whole game's range, taken from every board measured rather than from any
   one band, so the early levels have something to aim at before a single level
   has been assigned. An earlier version derived the target from the big band's
   assignment, which meant the big band had to be placed first, which meant it
   could not be told where the small bands were going to end up. That circularity
   is what put a dip at the boundary. */
const HARDEST = Math.max(...plan.flatMap(b => b.pool).map(c => c.hard), 0);
const targetFor = level => HARDEST * (level / LEVELS);

/* Fill the small bands in level order, not band by band. Each band can only
   offer boards of its own bottle count, so a band that starts easier than the
   last one ended puts a dip in the curve exactly where the board grows, which is
   the moment the game is claiming to get harder. Carrying a floor across bands
   costs a little accuracy against the target and buys monotonicity. */
let floor = 0;
const smallLevels = plan.filter(b => !b.big).flatMap(b => b.levels).sort((a, b) => a - b);
const taken = new Set();

for (const level of smallLevels){
  const band = bandOf.get(level);
  if (!band.pool.length) continue;
  const want = targetFor(level);
  let best = null, bestRising = null;
  for (const c of band.pool){
    const id = keyOf(c);
    if (taken.has(id)) continue;
    const miss = want == null ? c.hard : Math.abs(c.hard - want);
    if (!best || miss < best.miss) best = { miss, id, c };
    if (c.hard >= floor && (!bestRising || miss < bestRising.miss)) bestRising = { miss, id, c };
  }
  const pick = bestRising || best;
  if (!pick) continue;
  taken.add(pick.id);
  floor = Math.max(floor, pick.c.hard);
  order[level] = [pick.c.colors, pick.c.empties, pick.c.seed];
  chosen.set(level, pick.c);
}
for (const band of plan){
  if (band.big) continue;
  const got = band.levels.filter(l => chosen.has(l));
  if (!got.length){
    console.log(`${band.bottles} bottles: nothing could be measured, leaving this band alone`);
    continue;
  }
  console.log(`${band.bottles} bottles: `
    + got.map(l => `${l}:${chosen.get(l).colors}c 10^-${chosen.get(l).hard.toFixed(1)}`).join(', ')
    + ` from ${band.pool.length} of ${band.field.length} measured`);
}

/* Place the big bands last, spread across everything they measured from the
   floor the small bands reached up to the hardest board there is.

   Spread, not the easiest N: taking the front of a sorted pool is what a first
   version did, and widening the search then made the game *easier*, because 106
   levels drawn from the bottom of 234 boards sit lower than 106 drawn from the
   bottom of 128. Sampling the whole range is what turns more candidates into
   more range instead of less. */
for (const band of plan){
  if (!band.big) continue;
  const missed = band.field.length - band.pool.length;
  const n = band.levels.length;
  let usable = band.pool.filter(c => c.hard >= floor);
  if (usable.length < n) usable = band.pool.slice(-n);      /* not enough above the floor */
  if (usable.length < n){
    console.log(`${band.bottles} bottles: only ${usable.length} boards measured for ${n} levels, leaving this band alone`);
    continue;
  }
  band.levels.forEach((level, i) => {
    const c = usable[Math.round((i / (n - 1)) * (usable.length - 1))];
    order[level] = [c.colors, c.empties, c.seed];
    chosen.set(level, c);
  });
  const lo = chosen.get(band.levels[0]), hi = chosen.get(band.levels[n - 1]);
  console.log(`${band.bottles} bottles: spread ${n} levels over ${usable.length} boards`
    + `, 10^-${lo.hard.toFixed(1)} to 10^-${hi.hard.toFixed(1)}`
    + (missed ? `, ${missed} too expensive to measure` : ''));
}

/* The measurement behind the table, kept next to it so the curve is a committed
   fact rather than something a run printed once and lost. It does not ship; a
   test reads it and fails if the order stops rising. */
const levels = Object.keys(order).map(Number).sort((a, b) => a - b);
writeFileSync(join(root, 'docs/difficulty.json'), JSON.stringify({
  note: 'Generated by `npm run order`. hard is -log10(chance of playing par at random). See tools/measure.mjs.',
  levels: levels.map(level => {
    const c = chosen.get(level);
    return { level, colors: c.colors, empties: c.empties, seed: c.seed,
             par: c.par, hard: Number(c.hard.toFixed(3)), tight: Number(c.tight.toFixed(3)) };
  })
}, null, 1) + '\n');

const entries = Object.keys(order).map(Number).sort((a, b) => a - b)
  .map(l => `${l}:[${order[l]}]`).join(',');
writeFileSync(join(root, 'src/js/32-order.js'), `/* Generated by \`npm run order\`. Do not edit by hand.

   What each level deals, as [colours, empties, seed]. The bottle count still
   follows the level number, so the board grows steadily; within a bottle count
   the shape and the board are chosen so that difficulty rises with the level
   instead of sawtoothing. See tools/order.mjs and tools/difficulty.mjs. */
globalThis.ORDER = Object.freeze({${entries}});
`);
console.log(`\nwrote src/js/32-order.js for ${Object.keys(order).length} levels`);
console.log('now bump CONFIG.layout and run `npm run pars`, the boards have changed');
