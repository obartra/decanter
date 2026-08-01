/* Loads the browser-free source modules into a sandbox so they can be tested
   in Node without a DOM. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const read = p => readFileSync(join(root, p), 'utf8');

/* every module that touches neither document nor window */
const PURE = ['00-config.js', '10-rng.js', '20-rules.js', '30-levels.js', '32-order.js', '35-pars.js', '40-progress.js'];

export function loadPure(extra = []){
  const ctx = vm.createContext({ console, Math, Date, JSON, Set, Map, Object, Array, Number, String, Infinity });
  ctx.globalThis = ctx;
  for (const f of PURE.concat(extra)) vm.runInContext(read(`src/js/${f}`), ctx, { filename: f });
  return ctx;
}
/* the solver is written as a worker, so give it a stub `self` and call it directly */
export function loadSolver(){
  const stub = {};
  new Function('self', read('src/worker/solver.js') + '\nself.__internals={rawMoves,moveList,astar,anySolution,segs,keyOf};')(stub);
  return {
    internals: stub.__internals,
    solve(tubes, colors, opts = {}){
      let out;
      stub.postMessage = m => { out = m; };
      stub.onmessage({ data: { id: 1, tubes: tubes.map(t => t.slice()), cap: opts.cap || 4,
                               colors, nodeCap: opts.nodeCap || 400000, msCap: opts.msCap || 8000 } });
      return out;
    }
  };
}

/* ---- a tiny test runner, no dependencies ---- */
const suites = [];
export const describe = (name, fn) => suites.push({ name, fn, tests: [] });
let current = null;
export const it = (name, fn) => current.tests.push({ name, fn });

export function assert(cond, msg){
  if (!cond) throw new Error(msg || 'assertion failed');
}
export function equal(actual, expected, msg){
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || 'not equal'}\n    expected ${b}\n    actual   ${a}`);
}
export async function run(){
  let pass = 0, fail = 0;
  const failures = [];
  for (const suite of suites){
    current = suite;
    suite.fn();
    console.log(`\n\x1b[1m${suite.name}\x1b[0m`);
    for (const t of suite.tests){
      const started = Date.now();
      try {
        await t.fn();
        const ms = Date.now() - started;
        console.log(`  \x1b[32mpass\x1b[0m ${t.name}${ms > 200 ? ` \x1b[90m(${ms}ms)\x1b[0m` : ''}`);
        pass++;
      } catch (err) {
        console.log(`  \x1b[31mFAIL\x1b[0m ${t.name}`);
        console.log(`       ${String(err.message).split('\n').join('\n       ')}`);
        failures.push(`${suite.name} / ${t.name}`);
        fail++;
      }
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail){
    console.log('\nfailing:');
    failures.forEach(f => console.log('  ' + f));
    process.exitCode = 1;
  }
}
