/* One measurement, done in a child process so a machine's cores can be used.

   Speaks over the fork IPC channel: receives {level, seed}, replies with the
   measurement or null. Sending one job at a time rather than a fixed slice means
   the pool balances itself, which matters because measurement cost varies by
   orders of magnitude between boards of the same shape.

   Driven by tools/order.mjs; not useful on its own. */
import { loadPure, loadSolver } from '../tests/helpers.mjs';
import { analyse, TOO_DEAR, DEFAULT_BUDGET } from './measure.mjs';

const ctx = loadPure();
const solver = loadSolver();
const BUDGET = Number(process.env.ORDER_BUDGET) || DEFAULT_BUDGET;

function measure(level, seed){
  const tubes = ctx.Levels.make(level, seed);
  if (!tubes) return null;
  /* The committed table holds par for the board this level deals *now*, which is
     only the requested board when the seed matches the current order. Comparing
     against the level number instead would hand back the wrong par the moment an
     order exists, which is every run after the first. */
  let par = ctx.Levels.seedFor(level) === seed ? ctx.PARS[level] : null;
  if (par == null){
    const { colors } = ctx.Levels.shape(level);
    const got = solver.solve(tubes, colors, { nodeCap: 3_000_000, msCap: 20_000 });
    if (!got.exact || !Number.isInteger(got.par)) return null;
    par = got.par;
  }
  try {
    const a = analyse(tubes, par, BUDGET);
    return a == null ? null : { seed, par, hard: -a.logOdds, tight: a.tight };
  } catch (err) {
    if (err === TOO_DEAR) return null;
    throw err;
  }
}

process.on('message', job => {
  if (job === 'stop') return process.exit(0);
  let result = null;
  try {
    result = measure(job.level, job.seed);
  } catch (err) {
    process.send({ level: job.level, seed: job.seed, result: null, error: String(err && err.message || err) });
    return;
  }
  process.send({ level: job.level, seed: job.seed, result });
});
process.send('ready');
