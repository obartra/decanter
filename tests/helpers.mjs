/* Loads the source modules that need no browser, so they can be tested in Node
   without a DOM. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/* Every module the suite and the tools ask for, imported once.

   They used to be run into a `vm` sandbox as classic scripts, in the order the
   concatenating build joined them, because loading them any other way would have
   been testing a different program. The build bundles ES modules now, so they
   are simply imported, and this map is what lets `loadFrom` go on taking a
   directory and a list of filenames — `pureOf` above reads that list off the
   folder, so no call site knows what is in it.

   Which means this map has to cover every `pure/` module, or a suite asks for
   one of them and gets an error instead of a test. `tests/build.test.mjs`
   asserts exactly that, against the folders themselves, because the folder is
   the list and this is the only place in the repo that has to be told about a
   new module by hand.

   Everything else is deliberately absent: an import here runs that module in
   every test process, so the ones that only make sense in front of a document —
   the views, the renderers, the synthesizers, the entry points — are not listed.
   They are the browser suite's business. `78-still.js` is the one exception, and
   is asked for by name by the suite that covers it. */
/* The pour game, and everything shared */
import * as config from '../src/js/pure/00-config.js';
import * as trace from '../src/js/pure/05-trace.js';
import * as rng from '../src/js/pure/10-rng.js';
import * as rules from '../src/js/pure/20-rules.js';
import * as levels from '../src/js/pure/30-levels.js';
import * as order from '../src/js/pure/32-order.js';
import * as pars from '../src/js/pure/35-pars.js';
import * as chapters from '../src/js/pure/36-chapters.js';
import * as progress from '../src/js/pure/40-progress.js';
import * as panel from '../src/js/pure/45-panel.js';
import * as preview from '../src/js/pure/46-preview.js';
import * as still from '../src/js/78-still.js';
/* The bubble shooter */
import * as bubbleConfig from '../src/bubble/js/pure/00-config.js';
import * as bubbleRng from '../src/bubble/js/pure/10-rng.js';
import * as bubbleGrid from '../src/bubble/js/pure/20-grid.js';
import * as bubbleShot from '../src/bubble/js/pure/25-shot.js';
import * as bubbleRules from '../src/bubble/js/pure/30-rules.js';
import * as bubbleAdvice from '../src/bubble/js/pure/40-advice.js';
import * as bubbleScore from '../src/bubble/js/pure/45-score.js';
/* The decanting puzzle */
import * as measureConfig from '../src/measure/js/pure/00-config.js';
import * as measureRules from '../src/measure/js/pure/20-rules.js';
import * as measureSearch from '../src/measure/js/pure/25-search.js';
import * as measureLevels from '../src/measure/js/pure/30-levels.js';
import * as measureOrder from '../src/measure/js/pure/32-order.js';
import * as measurePars from '../src/measure/js/pure/35-pars.js';
import * as measureScore from '../src/measure/js/pure/45-score.js';
/* The cellar door */
import * as casksConfig from '../src/casks/js/pure/00-config.js';
import * as casksRules from '../src/casks/js/pure/20-rules.js';
import * as casksSearch from '../src/casks/js/pure/25-search.js';
import * as casksLevels from '../src/casks/js/pure/30-levels.js';
import * as casksBoards from '../src/casks/js/pure/32-boards.js';
import * as casksPars from '../src/casks/js/pure/35-pars.js';
import * as casksScore from '../src/casks/js/pure/45-score.js';
/* The workbench */
import * as labConfig from '../src/lab/js/pure/00-config.js';
import * as labStates from '../src/lab/js/pure/10-states.js';
import * as labSweep from '../src/lab/js/pure/20-sweep.js';

export const MODULES = new Map([
  /* The pour game, and everything shared */
  ['src/js/pure/00-config.js', config],
  ['src/js/pure/05-trace.js', trace],
  ['src/js/pure/10-rng.js', rng],
  ['src/js/pure/20-rules.js', rules],
  ['src/js/pure/30-levels.js', levels],
  ['src/js/pure/32-order.js', order],
  ['src/js/pure/35-pars.js', pars],
  ['src/js/pure/36-chapters.js', chapters],
  ['src/js/pure/40-progress.js', progress],
  ['src/js/pure/45-panel.js', panel],
  ['src/js/pure/46-preview.js', preview],
  ['src/js/78-still.js', still],
  /* The bubble shooter */
  ['src/bubble/js/pure/00-config.js', bubbleConfig],
  ['src/bubble/js/pure/10-rng.js', bubbleRng],
  ['src/bubble/js/pure/20-grid.js', bubbleGrid],
  ['src/bubble/js/pure/25-shot.js', bubbleShot],
  ['src/bubble/js/pure/30-rules.js', bubbleRules],
  ['src/bubble/js/pure/40-advice.js', bubbleAdvice],
  ['src/bubble/js/pure/45-score.js', bubbleScore],
  /* The decanting puzzle */
  ['src/measure/js/pure/00-config.js', measureConfig],
  ['src/measure/js/pure/20-rules.js', measureRules],
  ['src/measure/js/pure/25-search.js', measureSearch],
  ['src/measure/js/pure/30-levels.js', measureLevels],
  ['src/measure/js/pure/32-order.js', measureOrder],
  ['src/measure/js/pure/35-pars.js', measurePars],
  ['src/measure/js/pure/45-score.js', measureScore],
  /* The cellar door */
  ['src/casks/js/pure/00-config.js', casksConfig],
  ['src/casks/js/pure/20-rules.js', casksRules],
  ['src/casks/js/pure/25-search.js', casksSearch],
  ['src/casks/js/pure/30-levels.js', casksLevels],
  ['src/casks/js/pure/32-boards.js', casksBoards],
  ['src/casks/js/pure/35-pars.js', casksPars],
  ['src/casks/js/pure/45-score.js', casksScore],
  /* The workbench */
  ['src/lab/js/pure/00-config.js', labConfig],
  ['src/lab/js/pure/10-states.js', labStates],
  ['src/lab/js/pure/20-sweep.js', labSweep]
]);

/* A directory and a list of filenames, merged into one object, the way the old
   sandbox handed back one scope. Every caller kept its shape through the move to
   modules, so no suite had to change; what changed underneath is that nothing is
   executed per call any more. Modules are singletons, so asking twice gets the
   same objects, and anything that mutates one has to put it back. */
export function loadFrom(dir, files){
  const out = {};
  for (const f of files){
    const mod = MODULES.get(`${dir}/${f}`);
    if (!mod) throw new Error(`${dir}/${f} is not a module this harness can load`);
    Object.assign(out, mod);
  }
  return out;
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
