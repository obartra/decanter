/* The hatch that lets the liquids be told apart without their color.

   Everything here is a property the feature is useless without and that nothing
   else would notice breaking. A pattern set with a duplicate in it looks fine,
   ships fine, and silently gives two liquids the same appearance to exactly the
   players it was built for. */
import { describe, it, assert, equal, loadPure, loadGame, read } from './helpers.mjs';

const { CONFIG, Patterns } = { ...loadPure(), Patterns: (await import('../src/js/pure/07-patterns.js')) };
const { BubbleConfig } = loadGame('bubble');

describe('liquid patterns', () => {
  it('has one for every color in the palette', () => {
    /* A missing entry falls back to the plain one, so a thirteenth color would
       not throw: it would just be indistinguishable, which is worse. */
    for (let i = 0; i < CONFIG.palette.length; i++){
      assert(Patterns.cssFor(i) !== undefined, `no pattern for color ${i}`);
      assert(typeof Patterns.cssFor(i) === 'string', `pattern ${i} is not css`);
    }
  });

  it('gives no two colors the same appearance', () => {
    /* The whole point. Two colors sharing a hatch is the failure this feature
       exists to prevent, arriving through the feature itself. */
    const seen = new Map();
    const clashes = [];
    for (let i = 0; i < CONFIG.palette.length; i++){
      const css = Patterns.cssFor(i);
      if (seen.has(css)) clashes.push(`colors ${seen.get(css)} and ${i} are hatched identically`);
      else seen.set(css, i);
    }
    equal(clashes, [], 'a pattern is used twice');
  });

  it('leaves exactly one color plain', () => {
    /* Something has to be the bare one — a board where every liquid is hatched
       is busier to read than one where eleven are — but only one, or the plain
       ones are indistinguishable from each other. */
    const plain = [];
    for (let i = 0; i < CONFIG.palette.length; i++) if (Patterns.cssFor(i) === 'none') plain.push(i);
    equal(plain, [0], 'exactly one color should be unhatched, and it should be the first');
  });

  it('describes the same pattern to the stylesheet and to the canvas', () => {
    /* Two renderers read this: the bands are DOM and take a CSS string, the
       fluid is a canvas and takes geometry. They come from one table so they
       cannot drift, and this asserts the table actually answers both. */
    for (let i = 0; i < CONFIG.palette.length; i++){
      const css = Patterns.cssFor(i), tile = Patterns.tileFor(i);
      if (css === 'none'){ equal(tile, null, `color ${i} is plain in css but not on canvas`); continue; }
      assert(tile && tile.size > 0, `color ${i} has css but no tile`);
      assert(tile.dot || (tile.lines && tile.lines.length), `color ${i} has a tile with nothing in it`);
    }
  });

  it('hatches the other game the same way it hatches this one', () => {
    /* The bubble palette is this palette's first six, pinned in
       tests/palette.test.mjs. The hatches have to follow, or a red bubble and a
       red liquid are marked differently and the mark stops meaning anything
       across the two games. Copied rather than imported because the games share
       no module; this is what stops the copy drifting. */
    const mine = read('src/js/pure/07-patterns.js');
    for (let i = 0; i < BubbleConfig.PATTERNS.length; i++){
      const spec = BubbleConfig.PATTERNS[i];
      assert(Array.isArray(spec) && spec.length === 3, `bubble pattern ${i} is not a spec`);
      assert(mine.includes(`[${spec[0]}, ${spec[1]}, ${spec[2]}]`),
        `bubble pattern ${i} is [${spec}], which the pour game's table does not contain`);
    }
    equal(BubbleConfig.PATTERNS.length, BubbleConfig.PALETTE.length,
      'every bubble color needs a hatch, and no hatch belongs to a color that is not there');
  });

  it('marks in a color that shows on every liquid', () => {
    /* The palette runs from a near white to a deep green. A light hatch vanishes
       on the pale ones, so the ink is dark and translucent, and this pins that
       rather than leaving it to whoever edits the string next. */
    for (let i = 1; i < CONFIG.palette.length; i++){
      assert(/rgba\(0,\s*0,\s*0,/.test(Patterns.cssFor(i)),
        `color ${i} is hatched in something other than translucent black`);
    }
  });
});
