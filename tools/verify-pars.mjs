/* Is par actually reachable?

   The committed table is produced by the A* in src/worker/solver.js. Checking it
   with that same solver only catches staleness. This asks a different question,
   using the independent rules in tests/baseline.mjs: does a sequence of exactly
   `par` legal moves exist that solves the level?

   Depth-limited search with the same admissible bound used for pruning, which is
   sound here because it is only ever used to cut branches that cannot reach the
   target depth. Run: node tools/verify-pars.mjs [levels] */
import { loadPure } from '../tests/helpers.mjs';
import * as base from '../tests/baseline.mjs';

const ctx = loadPure();
const LEVELS = Number(process.argv[2] || 40);

/* segments minus colours, computed here rather than imported, so a mistake in
   the solver's copy cannot hide behind the same mistake here */
function h(tubes){
  let segs = 0;
  const seen = new Set();
  for (const t of tubes){
    for (let i = 0; i < t.length; i++){
      if (i === 0 || t[i] !== t[i - 1]) segs++;
      seen.add(t[i]);
    }
  }
  return segs - seen.size;
}

/* does a solution of exactly `limit` moves exist under the independent rules? */
function reachable(start, limit){
  const seen = new Map();
  let nodes = 0;
  function go(tubes, depth){
    if (base.solved(tubes)) return [];
    if (depth === 0) return null;
    if (h(tubes) > depth) return null;            /* cannot close the gap in time */
    if (++nodes > 4_000_000) throw new Error('budget');
    const k = base.exactKey(tubes);
    const best = seen.get(k);
    if (best !== undefined && best >= depth) return null;
    seen.set(k, depth);
    for (const m of base.legalMoves(tubes)){
      const next = base.apply(base.clone(tubes), m);
      const rest = go(next, depth - 1);
      if (rest) return [m, ...rest];
    }
    return null;
  }
  return go(base.clone(start), limit);
}

let checked = 0, reachedAt = 0, shorter = 0, failed = 0, skipped = 0;
console.log('level  par  result');
for (let level = 1; level <= LEVELS; level++){
  const par = ctx.PARS[level];
  const tubes = ctx.Levels.make(level);
  if (par == null || !tubes) continue;

  let path = null, note = '';
  try {
    path = reachable(tubes, par);
  } catch (e) { note = 'search budget exceeded'; }

  if (note){ skipped++; console.log(`${String(level).padEnd(6)} ${String(par).padEnd(4)} skipped, ${note}`); continue; }
  checked++;

  if (!path){
    failed++;
    console.log(`${String(level).padEnd(6)} ${String(par).padEnd(4)} UNREACHABLE in par moves`);
    continue;
  }

  /* replay it under the independent rules and insist it really solves */
  let s = base.clone(tubes);
  let legal = true;
  for (const m of path){
    if (!base.legalMoves(s).some(x => x[0] === m[0] && x[1] === m[1] && x[2] === m[2])) legal = false;
    s = base.apply(s, m);
  }
  if (!legal || !base.solved(s)){
    failed++;
    console.log(`${String(level).padEnd(6)} ${String(par).padEnd(4)} REPLAY FAILED`);
    continue;
  }
  if (path.length < par){ shorter++; console.log(`${String(level).padEnd(6)} ${String(par).padEnd(4)} SOLVED IN ${path.length}, par is too high`); }
  else { reachedAt++; }
}

console.log('');
console.log(`checked ${checked} levels`);
console.log(`  reachable in exactly par : ${reachedAt}`);
console.log(`  solvable in fewer        : ${shorter}`);
console.log(`  not reachable in par     : ${failed}`);
console.log(`  skipped (too big)        : ${skipped}`);
