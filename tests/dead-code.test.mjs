/* The checker that gates the merge, checked.

   A detector is the one kind of tool that fails silently by succeeding. If the
   pattern that finds a module stops matching, it reports a clean repository
   forever and the green tick means nothing, so the interesting assertions here
   are not "it found the dead thing" but "it looked at anything at all" and "it
   still recognises the shapes these modules are actually written in".

   The key extraction is the fragile half and gets the most attention. Every case
   below is one this codebase really contains: getters and setters on the bubble
   app, a member whose value is an arrow body full of braces, a nested object
   literal in a method, a computed value like `count: CHAPTERS.length`. */
import { describe, it, assert, equal } from './helpers.mjs';
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
