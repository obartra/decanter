/* Does the dead code detector actually detect anything?

   A checker that reports nothing is indistinguishable from a checker that does
   nothing, and the second is worse than having none: it is a green light nobody
   should trust. Every check gets a planted corpse and has to find it.

   This is not hypothetical. Three of the four worked first time; the helper
   check reported a clean repo while a dead function sat in front of it, because
   it sliced from the return block to the end of the file and so counted anything
   declared after the return as published. Only planting one found that. */
import { describe, it, assert, equal, root } from './helpers.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/* Run the detector over a copy of the tree with one file altered, so the real
   sources are never touched by a test. */
function withPlant(file, mutate){
  const dir = mkdtempSync(join(tmpdir(), 'live-'));
  try {
    for (const d of ['src', 'tools', 'tests']) cpSync(join(root, d), join(dir, d), { recursive: true });
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    /* This file is not part of the tree under test.

       The detector counts a name mentioned anywhere, tests included, as used,
       which is right: a helper only a test calls is still reachable. But that
       makes this file's own `plantedClass` literal count as a use of the class
       it plants, so three of these checks passed a corpse off as alive and
       reported nothing. Copied in, it hides exactly what it is here to find. */
    rmSync(join(dir, 'tests/live.test.mjs'), { force: true });
    const target = join(dir, file);
    writeFileSync(target, mutate(readFile(target)));
    /* `--json` reports on stdout and exits zero either way, so the findings are
       read from the output rather than inferred from the exit code. Reading them
       off the failure path instead is how the first version of this returned an
       empty list for every plant and still passed its own clean case. */
    const out = execFileSync(process.execPath, [join(dir, 'tools/verify-live.mjs'), '--json'],
      { cwd: dir, encoding: 'utf8' });
    return JSON.parse(out || '[]');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const readFile = p => readFileSync(p, 'utf8');

describe('the dead code detector', () => {
  it('finds a helper at column zero, not just an indented one', () => {
    /* The modules that publish a plain object write their functions flush left,
       which is sixteen of them across the pour game alone. Matching only the
       indented form meant none were checked, and a planted corpse in front of
       the checker was reported as a clean tree. Twice: the same unbounded slice
       hid it in the export check too. */
    const found = withPlant('src/js/40-progress.js',
      s => `${s}\nfunction plantedFlushLeft(){ return 1; }\n`);
    assert(found.some(f => f.kind === 'helper' && f.name === 'plantedFlushLeft'),
      `a column-zero dead helper went unnoticed; found ${JSON.stringify(found)}`);
  });

  it('does not accuse the worker, whose privates are deliberately reachable', () => {
    /* `tests/helpers.mjs` loads the solver through `new Function` with an
       internals export appended, so its module level functions are called by
       tests. The premise the helper check rests on does not hold there. */
    const found = withPlant('src/js/05-trace.js', s => s);
    assert(!found.some(f => /solver/.test(f.where)),
      `the solver was accused of dead code it does not have; found ${JSON.stringify(found)}`);
  });

  it('finds a helper nothing calls', () => {
    const found = withPlant('src/js/05-trace.js',
      s => s.replace('globalThis.Trace =', '  function plantedHelper(){ return 1; }\nglobalThis.Trace ='));
    assert(found.some(f => f.kind === 'helper' && f.name === 'plantedHelper'),
      `a dead helper went unnoticed; found ${JSON.stringify(found)}`);
  });

  it('finds an export nothing reads', () => {
    const found = withPlant('src/js/50-audio.js',
      s => s.replace('\n  return {', '\n  return {\n    plantedExport(){ return 1; },'));
    assert(found.some(f => f.kind === 'export' && /plantedExport/.test(f.name)),
      `a dead export went unnoticed; found ${JSON.stringify(found)}`);
  });

  it('checks the modules that publish a plain object too', () => {
    /* Two shapes are in use. Only the IIFE one was looked at, so every key on
       the smaller modules was unchecked and could rot unnoticed. */
    const found = withPlant('src/js/10-rng.js',
      s => s.replace('globalThis.RNG = { mulberry32,', 'function plantedFlat(){ return 1; }\nglobalThis.RNG = { plantedFlat, mulberry32,'));
    assert(found.some(f => /plantedFlat/.test(f.name)),
      `a dead key on a plain-object module went unnoticed; found ${JSON.stringify(found)}`);
  });

  it('finds a tunable nothing reads', () => {
    /* The most convincing kind of dead code here. Every other sort looks like
       what it is; a stale tunable looks like the place to change the behaviour
       it claims to control, and usually has a paragraph above it saying so.
       `bubblePerChapter` sat in CONFIG announcing "two per ten" over a function
       that returned a pair by construction and never asked it anything. */
    const found = withPlant('src/js/00-config.js',
      s => s.replace('  sectionSize: 10,', '  sectionSize: 10,\n  plantedTunable: 7,'));
    assert(found.some(f => f.kind === 'config' && f.name === 'plantedTunable'),
      `a dead tunable went unnoticed; found ${JSON.stringify(found)}`);
  });

  it('finds one nested inside economy, and blames only economy', () => {
    const found = withPlant('src/js/00-config.js',
      s => s.replace('    attempt: 5,', '    attempt: 5,\n    plantedPrice: 3,'));
    const hits = found.filter(f => f.kind === 'config' && /plantedPrice/.test(f.name));
    equal(hits.map(f => f.name), ['economy.plantedPrice'],
      `one planted key should be reported once; found ${JSON.stringify(found)}`);
  });

  it('reads a one-line nested object without swallowing the next one', () => {
    /* `solver` and `beta` are written on one line and have no closing brace of
       their own to stop at. Matched against the multi-line shape they ran on to
       economy's brace, so every economy key was reported against them as well:
       one planted corpse, three accusations. */
    const found = withPlant('src/js/00-config.js',
      s => s.replace('solver: { nodeCap: 400000,', 'solver: { plantedCap: 1, nodeCap: 400000,'));
    const hits = found.filter(f => f.kind === 'config');
    equal(hits.map(f => f.name), ['solver.plantedCap'],
      `a one-line block was read wrongly; found ${JSON.stringify(found)}`);
  });

  it('finds a class nothing wears', () => {
    const found = withPlant('src/css/01-base.css', s => `${s}\n.plantedClass{color:red}\n`);
    assert(found.some(f => f.kind === 'css' && f.name === '.plantedClass'),
      `a dead class went unnoticed; found ${JSON.stringify(found)}`);
  });

  it('finds an id nothing reaches', () => {
    const found = withPlant('src/index.html',
      s => s.replace('</body>', '<div id="plantedId"></div>\n</body>'));
    assert(found.some(f => f.kind === 'id' && f.name === '#plantedId'),
      `a dead id went unnoticed; found ${JSON.stringify(found)}`);
  });

  it('says nothing about the tree as it stands', () => {
    /* and the other half of the same claim: it is not simply flagging everything */
    const found = withPlant('src/js/05-trace.js', s => s);
    equal(found, [], `the checked-in sources are not clean: ${JSON.stringify(found)}`);
  });
});
