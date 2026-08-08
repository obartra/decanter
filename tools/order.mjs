/* Choose which board each level deals, so that difficulty actually rises.

   Difficulty here is `slips`: how many wrong turns uniformly random play is
   expected to take along the line. A run is allowed a fixed number of wrong
   turns whatever its length, so that is the number to compare against, and it is
   the reason this is not the odds of playing a perfect line. See tools/difficulty-core.mjs.

   Measured difficulty and level number were uncorrelated (r = 0.05 over the
   first 120). Color count climbs, which looks like a curve, but it is not one.
   Two separate problems sat underneath that:

     the boards within a shape were in seed order, which is arbitrary, so the 104
     twelve-color levels spanned fourteen orders of magnitude in no order at all

     the shape itself sawtoothed, because the empty count alternates with the
     parity of the color count and empties dominate: every extra empty adds
     legal moves and most of them are wrong, so the odd-color levels came out
     far harder than the even-color ones on either side of them

   The second is why level 16 was harder than everything up to about level 90.

   What is fixed and what is free:

     bottle count   fixed, and climbs with the level number, so the board grows
                    steadily and never shrinks
     colors        free within a bottle count, because 5 colors + 3 empties and
                    6 colors + 2 empties are both eight bottles and look the same
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

   Writes src/js/pure/32-order.js as `level: [colors, empties, seed]`. Bump
   CONFIG.layout and regenerate the par table afterwards: the board behind a
   level number has changed.

   Run: node tools/order.mjs [levels] [field] [--jobs=N] */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { cpus } from 'node:os';
import { loadPure } from '../tests/helpers.mjs';
import { ceilingFor } from './brick-core.mjs';

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

/* Where the vessel is granted, which is where the brick ceiling is allowed to
   relax. Read off the chapter list rather than written down, so moving the grant
   moves the ceiling with it. See tools/brick-core.mjs. */
const VESSEL_LEVEL = (() => {
  for (let i = 0; i < ctx.Chapters.count; i++){
    const c = ctx.Chapters.at(i);
    if (c && c.grant === 'vessel') return i * ctx.CONFIG.sectionSize + 1;
  }
  return Infinity;
})();
const ceiling = level => ceilingFor(level, VESSEL_LEVEL);
const relaxed = [];     /* levels that had to take a board over their ceiling */
const fits = (c, level) => c.brick != null && c.brick <= ceiling(level);

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
      const w = fork(join(here, 'difficulty-worker.mjs'), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
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
  /* Wider than it needs to be for the sort alone, because the brick ceiling
     throws most of a field away before the curve gets to choose from it: only
     about a quarter of twelve-color boards come in under the pre-vessel ceiling,
     and those have to land inside a hardness window a single point wide. The
     boards are cheap to measure at this shape, about a second each, so the field
     is where to spend. */
  const want = band.big ? Math.ceil(band.levels.length * 6) : FIELD * band.levels.length;
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
  /* Three passes over the same pool, narrowest first. A board under the ceiling
     and above the floor is what we want; a board under the ceiling anywhere is
     worth taking a dip for; a board over the ceiling is a failure that gets
     named rather than absorbed, because a level quietly shipped over its ceiling
     is exactly the thing this whole measurement exists to notice. */
  let best = null, bestRising = null, fallback = null;
  for (const c of band.pool){
    const id = keyOf(c);
    if (taken.has(id)) continue;
    const miss = want == null ? c.hard : Math.abs(c.hard - want);
    if (!fallback || (c.brick ?? 1) < (fallback.c.brick ?? 1)) fallback = { miss, id, c };
    if (!fits(c, level)) continue;
    if (!best || miss < best.miss) best = { miss, id, c };
    if (c.hard >= floor && (!bestRising || miss < bestRising.miss)) bestRising = { miss, id, c };
  }
  const pick = bestRising || best || fallback;
  if (!pick) continue;
  if (!fits(pick.c, level)) relaxed.push({ level, brick: pick.c.brick, ceiling: ceiling(level) });
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
    + got.map(l => `${l}:${chosen.get(l).colors}c ${chosen.get(l).hard.toFixed(1)} slips`).join(', ')
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
  /* One spread across the band, paced by the index as before, but each level
     takes the nearest board that clears its own ceiling.

     The pacing is the part that matters. An earlier version cut the band at the
     ceiling step and spread each run of levels over its own sub-pool, which let
     the first six levels walk the whole hardness range and leave one board for
     the hundred after them. The index is what keeps a level near the difficulty
     its position calls for, so it stays in charge and the ceiling only decides
     which of the boards near that difficulty is allowed.

     Monotone by construction: every pick is at or above the floor, and the floor
     becomes the pick. */
  let bandFloor = floor;
  for (let i = 0; i < n; i++){
    const level = band.levels[i];
    const target = usable[Math.round((i / (n - 1)) * (usable.length - 1))].hard;
    let pick = null, fallback = null;
    for (const c of usable){
      if (taken.has(keyOf(c)) || c.hard < bandFloor) continue;
      if (!fallback || (c.brick ?? 1) < (fallback.brick ?? 1)) fallback = c;
      if (!fits(c, level)) continue;
      if (!pick || Math.abs(c.hard - target) < Math.abs(pick.hard - target)) pick = c;
    }
    /* Nothing under the ceiling anywhere above the floor: take the least
       brickable board there is rather than dropping the level, and name it. */
    if (!pick) pick = fallback;
    if (!pick) continue;
    taken.add(keyOf(pick));
    bandFloor = pick.hard;
    order[level] = [pick.colors, pick.empties, pick.seed];
    chosen.set(level, pick);
    if (!fits(pick, level)) relaxed.push({ level, brick: pick.brick, ceiling: ceiling(level) });
  }
  const placed = band.levels.filter(l => chosen.has(l)).length;
  console.log(`${band.bottles} bottles: placed ${placed} of ${n} levels from ${usable.length} boards`);
  const lo = chosen.get(band.levels[0]), hi = chosen.get(band.levels[n - 1]);
  if (lo && hi) console.log(`${band.bottles} bottles: ${lo.hard.toFixed(1)} to ${hi.hard.toFixed(1)} slips`
    + (missed ? `, ${missed} too expensive to measure` : ''));
}

if (relaxed.length){
  console.log(`\n${relaxed.length} levels could not be kept under their ceiling:`);
  for (const r of relaxed)
    console.log(`  level ${String(r.level).padStart(3)}  bricks ${(r.brick * 100).toFixed(1)}% against a ceiling of ${(r.ceiling * 100).toFixed(0)}%`);
  console.log('  widen the field and run again, or accept them and move the ceiling on purpose');
}

/* The measurement behind the table, kept next to it so the curve is a committed
   fact rather than something a run printed once and lost. It does not ship; a
   test reads it and fails if the order stops rising. */
const levels = Object.keys(order).map(Number).sort((a, b) => a - b);
writeFileSync(join(root, 'docs/difficulty.json'), JSON.stringify({
  note: 'Generated by `npm run order`. hard is `slips`, the wrong turns random play is expected to take along the line; brick is the share of ordinary playouts that run out of pours. See tools/difficulty-core.mjs and tools/brick-core.mjs.',
  levels: levels.map(level => {
    const c = chosen.get(level);
    return { level, colors: c.colors, empties: c.empties, seed: c.seed,
             par: c.par, hard: Number(c.hard.toFixed(3)), tight: Number(c.tight.toFixed(3)),
             brick: Number(c.brick.toFixed(3)) };
  })
}, null, 1) + '\n');

const entries = Object.keys(order).map(Number).sort((a, b) => a - b)
  .map(l => `${l}:[${order[l]}]`).join(',');
writeFileSync(join(root, 'src/js/pure/32-order.js'), `/* Generated by \`npm run order\`. Do not edit by hand.

   What each level deals, as [colors, empties, seed]. The bottle count still
   follows the level number, so the board grows steadily; within a bottle count
   the shape and the board are chosen so that difficulty rises with the level
   instead of sawtoothing. See tools/order.mjs and tools/difficulty.mjs. */
export const ORDER = Object.freeze({${entries}});
`);
console.log(`\nwrote src/js/pure/32-order.js for ${Object.keys(order).length} levels`);
console.log('now bump CONFIG.layout and run `npm run pars`, the boards have changed');
