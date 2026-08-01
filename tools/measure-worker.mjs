/* One measurement, done in a child process so a machine's cores can be used.

   Speaks over the fork IPC channel: receives a job, replies with a result.
   Sending one job at a time rather than a fixed slice means the pool balances
   itself, which matters because cost varies by orders of magnitude between
   boards of the same shape.

   A job names a board outright, as colours, empties and seed, rather than a
   level. Candidate boards are compared across shapes, so a level number would
   only be a detour through a lookup that is itself what the caller is trying to
   decide.

   Every candidate is measured properly. An earlier version sifted a much wider
   field on par first, on the theory that a shorter line multiplies fewer odds
   together. Across shapes that is backwards: a board with three empties has a
   shorter par than one with two, and a far narrower line, so sifting on par
   reliably picked the hardest board in the band and called it the easiest.

   Driven by tools/order.mjs; not useful on its own. */
import { loadPure, loadSolver } from '../tests/helpers.mjs';
import { analyse, TOO_DEAR, DEFAULT_BUDGET } from './measure.mjs';

const ctx = loadPure();
const solver = loadSolver();
const BUDGET = Number(process.env.ORDER_BUDGET) || DEFAULT_BUDGET;

function measure({ colors, empties, seed }){
  const tubes = ctx.Levels.deal(colors, empties, seed);
  if (!tubes) return null;
  const got = solver.solve(tubes, colors, { nodeCap: 3_000_000, msCap: 20_000 });
  if (!got.exact || !Number.isInteger(got.par)) return null;
  try {
    const a = analyse(tubes, got.par, BUDGET);
    /* `slips` rather than `logOdds`: a run's budget for wrong turns is fixed,
       so what matters is how many it will take, not the odds of taking none */
    return a == null ? null : { par: got.par, hard: a.slips, logOdds: -a.logOdds, tight: a.tight };
  } catch (err) {
    if (err === TOO_DEAR) return null;
    throw err;
  }
}

process.on('message', job => {
  if (job === 'stop') return process.exit(0);
  let result = null, error;
  try {
    result = measure(job);
  } catch (err) {
    error = String(err && err.message || err);
  }
  process.send({ job, result, error });
});
process.send('ready');
