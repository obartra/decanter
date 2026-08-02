/* Loads the browser-free source modules into a sandbox so they can be tested
   in Node without a DOM. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const read = p => readFileSync(join(root, p), 'utf8');

/* Every module of a game that runs without a DOM, in load order.

   Read off the sources rather than written down. There were five copies of this
   list, two here and three inside individual suites, and one of those had its
   modules in an order the game never loads them in and passed by luck. Which
   modules run headless is a fact about the sources, so `pure/` is where they
   live and this is how you ask.

   Sorted by filename, which is also how the build orders them regardless of the
   folder they sit in, so a suite loads a game in the order the page does. */
export const pureOf = dir => readdirSync(join(root, dir, 'pure'))
  .filter(f => f.endsWith('.js')).sort().map(f => `pure/${f}`);

/* Every module under a directory, `pure/` and all, in the order the page loads
   them. Anything scanning a game's sources has to go through this: a plain
   readdir stops at the folder boundary and quietly reports on half a game,
   which for a check that asserts something is published reads as the thing
   being missing. Ordered by filename and not by path, for the same reason the
   build is. */
/* the name a module is known by, which is what the build's markers carry */
export const nameOf = p => p.slice(p.lastIndexOf('/') + 1);
const base = nameOf;
export const modulesOf = (dir, ext = '.js') => {
  const out = [];
  const walkIn = rel => {
    for (const f of readdirSync(join(root, dir, rel)).sort()){
      const p = rel ? `${rel}/${f}` : f;
      if (statSync(join(root, dir, p)).isDirectory()) walkIn(p);
      else if (f.endsWith(ext)) out.push(p);
    }
  };
  walkIn('');
  return out.sort((a, b) => (base(a) < base(b) ? -1 : base(a) > base(b) ? 1 : 0));
};

/* the app, which is the pour game and the shell around every other one */
export function loadPure(extra = []){
  return loadFrom('src/js', pureOf('src/js').concat(extra));
}
/* any game at its own path: loadGame('bubble'), loadGame('casks') */
export function loadGame(id, extra = []){
  return loadFrom(`src/${id}/js`, pureOf(`src/${id}/js`).concat(extra));
}
export const loadBubble = (extra = []) => loadGame('bubble', extra);

/* Runs a list of classic scripts into one sandbox, in order, the way the built
   page does. Shared so a second game can be tested the same way as the first
   without either of them learning about the other. */
export function loadFrom(dir, files){
  const ctx = vm.createContext({ console, Math, Date, JSON, Set, Map, Object, Array, Number, String, Infinity });
  ctx.globalThis = ctx;
  for (const f of files) vm.runInContext(read(`${dir}/${f}`), ctx, { filename: f });
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
