/* The checker that gates the merge, checked.

   A detector is the one kind of tool that fails silently by succeeding. If the
   pattern that finds a module stops matching, it reports a clean repository
   forever and the green tick means nothing, so the interesting assertions here
   are not "it found the dead thing" but "it looked at anything at all" and "it
   still recognizes the shapes these modules are actually written in".

   The key extraction is the fragile half and gets the most attention. Every case
   below is one this codebase really contains: getters and setters on the bubble
   app, a member whose value is an arrow body full of braces, a nested object
   literal in a method, a computed value like `count: CHAPTERS.length`. */
import { describe, it, assert, equal, root } from './helpers.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { keysOf, objectAt, scan } from '../tools/dead-code.mjs';

describe('dead code detector', () => {
  it('reads the members off an object the way these modules are written', () => {
    const body = objectAt(`x = {
      plain, other: 1,
      count: CHAPTERS.length,
      method(a, b){ return { inner: 1, alsoInner: 2 }; },
      arrow: (a) => ({ nested: a }),
      get mounted(){ return !!root; },
      set source(fn){ readState = fn; },
      last
    };`, 4);
    equal(keysOf(body),
      ['plain', 'other', 'count', 'method', 'arrow', 'mounted', 'source', 'last']);
  });

  it('does not mistake a value for a member', () => {
    /* Everything inside a brace, bracket or paren belongs to a value. Without
       that, every property of every object literal in a method body is reported
       as part of the module's public surface, and the tool drowns in findings
       nobody can act on. */
    const body = objectAt(`x = { only(){ const q = { a: 1, b: 2 }; return [{ c: 3 }]; } };`, 4);
    equal(keysOf(body), ['only']);
  });

  it('ignores names inside comments and strings', () => {
    const body = objectAt(`x = {
      real,
      /* fake: 1 */
      text: 'quoted: 2'
    };`, 4);
    equal(keysOf(body), ['real', 'text']);
  });

  it('looked at the whole build rather than quietly matching nothing', () => {
    /* The assertion that stops this suite from passing on a broken regex. The
       counts are floors well under what is there, so ordinary growth never
       trips them and a pattern that stops matching always does. */
    const { examined } = scan();
    assert(examined.modules >= 20,
      `only found ${examined.modules} modules, so the scan is not seeing the sources`);
    assert(examined.members >= 100,
      `only found ${examined.members} members, so the key extraction has broken`);
    assert(examined.ids >= 40,
      `only found ${examined.ids} ids, so the markup scan has broken`);
  });

  it('finds nothing dead, which is the state this repository is kept in', () => {
    /* The same thing `npm run verify:dead` says, asserted here so a run of the
       unit suite alone still catches it. */
    const { findings } = scan();
    equal(findings.map(f => `${f.where} ${f.what}`), []);
  });
});

/* ---- and the other half: does it actually fire? ----

   Everything above tests the scanner in process against the tree as it stands,
   which proves it parses these modules and proves the tree is clean. It cannot
   prove a check would notice a corpse, and a detector that reports nothing is
   indistinguishable from one that does nothing.

   So each check gets one planted in a copy of the tree. That is not
   hypothetical: the helper check once reported a clean repository with a dead
   function sitting in front of it, and the config check answered its first
   planted key with three accusations. Only planting found either. */
/* Run the detector over a copy of the tree with one file altered, so the real
   sources are never touched by a test. */
/* One file or several: some plants only mean anything as a pair, because what is
   being checked is that a mention in one file does not excuse the other. */
function withPlant(plants, mutate){
  const list = Array.isArray(plants) ? plants : [[plants, mutate]];
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
    rmSync(join(dir, 'tests/dead-code.test.mjs'), { force: true });
    for (const [file, fn] of list){
      const target = join(dir, file);
      writeFileSync(target, fn(readFile(target)));
    }
    /* The findings are read from stdout, never inferred from the exit code —
       reading them off the failure path instead is how the first version of
       this returned an empty list for every plant and still passed its own
       clean case. The tool exits non-zero whenever it finds something, `--json`
       or not, which is what gates the merge and is right; here that means every
       successful plant arrives as a thrown error carrying the output. */
    let out;
    try {
      out = execFileSync(process.execPath, [join(dir, 'tools/dead-code.mjs'), '--json'],
        { cwd: dir, encoding: 'utf8' });
    } catch (e) {
      if (e.stdout == null) throw e;
      out = e.stdout;
    }
    return JSON.parse(out || '{}').findings || [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const readFile = p => readFileSync(p, 'utf8');

describe('dead code detector, with something dead in front of it', () => {
  it('finds a member nothing reads', () => {
    const found = withPlant('src/js/50-audio.js',
      s => s.replace('\n  return {', '\n  return {\n    plantedExport(){ return 1; },'));
    assert(found.some(f => /plantedExport/.test(f.what)),
      `a dead member went unnoticed; found ${JSON.stringify(found)}`);
  });

  it('finds a helper its own module never calls, at column zero', () => {
    /* The modules publishing a plain literal write their functions flush left,
       which is sixteen of them across the pour game alone. */
    const found = withPlant('src/js/pure/40-progress.js',
      s => `${s}\nfunction plantedFlushLeft(){ return 1; }\n`);
    assert(found.some(f => f.kind === 'helper' && f.what === 'plantedFlushLeft'),
      `a column-zero dead helper went unnoticed; found ${JSON.stringify(found)}`);
  });

  it('does not accuse the worker, whose privates are deliberately reachable', () => {
    /* tests/helpers.mjs loads the solver through `new Function` with an
       internals export appended, so its module level functions really are
       called from outside and the helper check's premise does not hold. */
    const found = withPlant('src/js/pure/05-trace.js', s => s);
    assert(!found.some(f => /solver/.test(f.where)),
      `the solver was accused of dead code it does not have; found ${JSON.stringify(found)}`);
  });

  it('finds a tunable nothing reads', () => {
    const found = withPlant('src/js/pure/00-config.js',
      s => s.replace('  sectionSize: 10,', '  sectionSize: 10,\n  plantedTunable: 7,'));
    assert(found.some(f => f.kind === 'config' && f.what === 'plantedTunable'),
      `a dead tunable went unnoticed; found ${JSON.stringify(found)}`);
  });

  it('finds one nested in economy, and blames only economy', () => {
    const found = withPlant('src/js/pure/00-config.js',
      s => s.replace('    attempt: 5,', '    attempt: 5,\n    plantedPrice: 3,'));
    equal(found.filter(f => f.kind === 'config').map(f => f.what), ['economy.plantedPrice'],
      `one planted key should be reported once; found ${JSON.stringify(found)}`);
  });

  it('reads a one-line nested object without swallowing the next one', () => {
    /* `solver` and `beta` are written on one line and have no closing brace of
       their own to stop at. Matched against the multi-line shape they ran on to
       economy's brace, so every economy key was reported against them too: one
       planted corpse, three accusations. */
    const found = withPlant('src/js/pure/00-config.js',
      s => s.replace('solver: { nodeCap:', 'solver: { plantedCap: 1, nodeCap:'));
    equal(found.filter(f => f.kind === 'config').map(f => f.what), ['solver.plantedCap'],
      `a one-line block was read wrongly; found ${JSON.stringify(found)}`);
  });

  it('finds a module nothing imports', () => {
    const found = withPlant('src/js/78-still.js',
      s => `${s}\nexport const PlantedModule = { plantedKey: 1 };\n`);
    assert(found.some(f => f.kind === 'global' && f.what === 'PlantedModule'),
      `a module nothing imports went unnoticed; found ${JSON.stringify(found)}`);
  });

  it('does not let an entry point\'s debug surface keep a module alive', () => {
    /* The check that stops the `global` kind from being decorative. Every entry
       point ends in one `Object.assign(globalThis, { ... })` naming every module
       on the page, for the browser suite to reach. Counted as a use, that block
       would answer "does anything name this?" with yes for every module there
       will ever be, and the kind would find nothing for the rest of time — while
       still looking like it worked.

       So the same corpse as above, this time also listed on the debug surface.
       It has to still be reported. */
    const found = withPlant([
      ['src/js/78-still.js', s => `${s}\nexport const PlantedModule = { plantedKey: 1 };\n`],
      ['src/js/main.js', s => s.replace('Object.assign(globalThis, {',
        "import { PlantedModule } from './78-still.js';\nObject.assign(globalThis, { PlantedModule,")]
    ]);
    assert(found.some(f => f.kind === 'global' && f.what === 'PlantedModule'),
      `being named on a debug surface passed a dead module off as alive; found ${JSON.stringify(found)}`);
  });

  it('finds a class nothing wears', () => {
    const found = withPlant('src/css/01-base.css', s => `${s}\n.plantedClass{color:red}\n`);
    assert(found.some(f => f.kind === 'style' && /plantedClass/.test(f.what)),
      `a dead class went unnoticed; found ${JSON.stringify(found)}`);
  });

  it('finds an id nothing reaches', () => {
    const found = withPlant('src/index.html',
      s => s.replace('</body>', '<div id="plantedId"></div>\n</body>'));
    assert(found.some(f => f.kind === 'page' && /plantedId/.test(f.what)),
      `a dead id went unnoticed; found ${JSON.stringify(found)}`);
  });

  it('says nothing about the tree as it stands', () => {
    /* the other half of the same claim: it is not simply flagging everything */
    equal(withPlant('src/js/pure/05-trace.js', s => s), [],
      'the checked-in sources are not clean');
  });
});

