/* Choose which board each level deals, so that difficulty actually rises.

   Measured difficulty and level number were uncorrelated (r = 0.05 over the
   first 120). Colour count climbs, which looks like a curve, but within a colour
   count the boards were in seed order, which is arbitrary: the twelve-colour
   levels alone spanned fourteen orders of magnitude in how likely par is, and
   the three tightest boards in the whole table sat at levels 3, 4 and 8.

   The shape of a level is left alone, so the colour count still climbs and the
   game still looks like it is ramping. Only the seed moves. Two strategies,
   because the two halves have different problems:

     levels sharing a shape with many others   sort the boards they already had
                                               by measured difficulty
     levels in a small shape group             search other seeds for a board
                                               that fits the intended curve

   The first is free: the boards exist and only their order changes. The second
   costs a measurement per candidate, which is affordable because those groups
   are small.

   Every measurement is independent, so they run across a pool of child
   processes, handed out one at a time. Cost varies by orders of magnitude
   between boards of the same shape, so a fixed slice per worker would leave most
   of the machine waiting on one unlucky board.

   Writes src/js/32-order.js. Regenerate pars afterwards: the board behind a
   level number has changed.

   Run: node tools/order.mjs [levels] [candidates] [--jobs=N] */
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
const LEVELS = Number(nums[0] || 120);
const CANDIDATES = Number(nums[1]) || 24;   /* per level, and only for small groups */
const JOBS = Number((args.find(a => a.startsWith('--jobs=')) || '').slice(7)) || Math.max(1, cpus().length - 2);
const BIG_GROUP = 8;                 /* a group this size is worth sorting alone */

/* Hand `jobs` out to a pool of workers, one at a time, and resolve with a map
   from `${level}:${seed}` to the measurement (or null). */
function measureAll(jobs){
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
      process.stdout.write(`  measured ${done}/${total}\n`);
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

    for (let i = 0; i < Math.min(JOBS, jobs.length); i++){
      const w = fork(join(here, 'measure-worker.mjs'), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      w.idle = true;
      w.on('message', msg => {
        if (msg === 'ready') return feed(w);
        results.set(`${msg.level}:${msg.seed}`, msg.result);
        done++;
        process.stdout.write(`  measured ${done}/${total}\r`);
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

/* group levels by the shape they are dealt */
const groups = new Map();
for (let level = 1; level <= LEVELS; level++){
  const { colors, empties } = ctx.Levels.shape(level);
  const key = `${colors}/${empties}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(level);
}

/* every measurement anyone will need, collected first so the pool sees the whole
   job list at once and stays busy across group boundaries */
const jobs = [];
const plan = [];
const candidateSeeds = level =>
  /* a stride, not a run, so the candidate boards actually differ */
  Array.from({ length: CANDIDATES }, (_, c) => (c === 0 ? level : level + c * 977));

for (const [key, levels] of groups){
  const sort = levels.length >= BIG_GROUP;
  plan.push({ key, levels, sort });
  for (const level of levels){
    if (sort) jobs.push({ level, seed: level });
    else for (const seed of candidateSeeds(level)) jobs.push({ level, seed });
  }
}

console.log(`${jobs.length} measurements across ${plan.length} shapes, ${JOBS} workers`);
const measured = await measureAll(jobs);
const got = (level, seed) => measured.get(`${level}:${seed}`);

const order = {};

/* Sort the big groups first. Their boards are fixed, so what they end up
   with is the curve everything else has to fit against. */
const anchors = [];
for (const { key, levels, sort } of plan){
  if (!sort) continue;
  const scored = [];
  for (const level of levels){
    const m = got(level, level);
    if (m) scored.push({ level, ...m });
  }
  if (scored.length < levels.length){
    console.log(`shape ${key}: ${levels.length - scored.length} of ${levels.length} boards could not be measured, leaving this shape alone`);
    continue;
  }
  scored.sort((a, b) => a.hard - b.hard);
  levels.forEach((level, i) => {
    order[level] = scored[i].level;
    anchors.push({ level, hard: scored[i].hard });
  });
  console.log(`shape ${key}: sorted ${levels.length} boards, 10^-${scored[0].hard.toFixed(1)} to 10^-${scored[scored.length - 1].hard.toFixed(1)}`);
}
anchors.sort((a, b) => a.level - b.level);

/* How hard level `n` ought to be, read off the curve the sorted groups already
   describe. Below the first anchor it ramps from nothing, which is the case that
   matters: the small groups are all early levels.

   Choosing against this rather than against each shape's own spread is the
   difference between a curve and a set of unrelated ramps. Spreading within a
   shape gave level 8 a board harder than most of the twelve-colour ones, because
   every candidate of that shape was hard and being mid-pool said nothing about
   how it compared to the rest of the game. */
function targetFor(level){
  if (!anchors.length) return null;
  const first = anchors[0], last = anchors[anchors.length - 1];
  if (level <= first.level) return first.hard * (level / first.level);
  if (level >= last.level) return last.hard;
  for (let i = 1; i < anchors.length; i++){
    const a = anchors[i - 1], b = anchors[i];
    if (level <= b.level){
      const t = (level - a.level) / (b.level - a.level);
      return a.hard + t * (b.hard - a.hard);
    }
  }
  return last.hard;
}

for (const { key, levels, sort } of plan){
  if (sort) continue;
  /* too few boards to sort, so go looking for ones that fit */
  const pool = [];
  for (const level of levels)
    for (const seed of candidateSeeds(level)){
      const m = got(level, seed);
      if (m) pool.push(m);
    }
  if (!pool.length){
    console.log(`shape ${key}: no candidate could be measured, leaving this shape alone`);
    continue;
  }
  /* earliest level picks first, and a board is only dealt once */
  const taken = new Set();
  const chosen = [];
  for (const level of [...levels].sort((a, b) => a - b)){
    const want = targetFor(level);
    let best = null;
    for (const c of pool){
      if (taken.has(c.seed)) continue;
      const miss = want == null ? c.hard : Math.abs(c.hard - want);
      if (!best || miss < best.miss) best = { miss, c };
    }
    if (!best) break;
    taken.add(best.c.seed);
    order[level] = best.c.seed;
    chosen.push(`${level}→10^-${best.c.hard.toFixed(1)} (wanted ${want == null ? '?' : want.toFixed(1)})`);
  }
  console.log(`shape ${key}: ${chosen.join(', ')} from ${pool.length} of ${levels.length * CANDIDATES} candidates`);
}

const entries = Object.keys(order).map(Number).sort((a, b) => a - b)
  .map(l => `${l}:${order[l]}`).join(',');
writeFileSync(join(root, 'src/js/32-order.js'), `/* Generated by \`npm run order\`. Do not edit by hand.

   Which board each level deals. The shape still comes from the level number, so
   the colour count climbs as before; this only chooses which board of that shape
   you get, so that difficulty rises with the level instead of being scattered.
   See tools/order.mjs and tools/difficulty.mjs. */
globalThis.ORDER = Object.freeze({${entries}});
`);
console.log(`\nwrote src/js/32-order.js for ${Object.keys(order).length} levels`);
console.log('now run `npm run pars`, the board behind a level number has changed');
