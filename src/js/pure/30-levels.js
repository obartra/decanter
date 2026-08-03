/* Level definition. Deterministic in the level number, so level 12 is the same
   puzzle for everyone, forever. */
import { CONFIG } from './00-config.js';
import { RNG } from './10-rng.js';
import { Rules } from './20-rules.js';
import { ORDER } from './32-order.js';
import { LAST_LEVEL } from './35-pars.js';

export const Levels = (() => {
  /* What a level is made of, before ORDER gets a say. Bottle count is always even
     so the board can lay out in two equal rows: the layout only takes row counts
     that divide the bottles exactly. */
  function baseShape(level){
    const colors = Math.min(CONFIG.minColors + Math.floor((level - 1) / 2), CONFIG.maxColors);
    const empties = colors % 2 === 0 ? 2 : 3;
    return { colors, empties, bottles: colors + empties };
  }
  /* A level is `[colours, empties, seed]` in ORDER, or the formula above seeded by
     the level number. The three travel together because all three decide which
     board you are dealt, and splitting them let the par table and the ordering
     disagree about what a level even was.

     ORDER exists because measured difficulty and level number were uncorrelated.
     It is free to swap the two shapes that share a bottle count, so a level can be
     dealt six colours and two empties where the formula said five and three. The
     board is the same size either way, and the empty count turned out to matter
     far more than the colour count: every extra empty adds legal moves, most of
     which are wrong. See tools/order.mjs. */
  function entryFor(level){
    const e = ORDER && ORDER[level];
    return Array.isArray(e) && e.length === 3 && e.every(Number.isInteger) ? e : null;
  }
  function shape(level){
    const e = entryFor(level);
    if (!e) return baseShape(level);
    return { colors: e[0], empties: e[1], bottles: e[0] + e[1] };
  }
  function seedFor(level){
    const e = entryFor(level);
    return e ? e[2] : level;
  }
  /* Deal a board directly. `make` is this with the level number looked up first;
     tools that measure candidate boards call it with shapes no level uses yet. */
  function deal(colors, empties, seed){
    const cap = CONFIG.capacity;
    const rng = RNG.mulberry32(RNG.hashSeed(seed));
    for (let attempt = 0; attempt < 200; attempt++){
      const pool = [];
      for (let c = 0; c < colors; c++)
        for (let k = 0; k < cap; k++) pool.push(c);
      RNG.shuffleWith(rng, pool);
      const tubes = [];
      for (let i = 0; i < colors; i++) tubes.push(pool.slice(i * cap, (i + 1) * cap));
      for (let i = 0; i < empties; i++) tubes.push([]);
      if (tubes.some(Rules.isFull)) continue;        // no bottle starts finished
      if (!Rules.isSolvable(tubes)) continue;
      return tubes;
    }
    return null;
  }
  function make(level, seed){
    const { colors, empties } = shape(level);
    return deal(colors, empties, seed == null ? seedFor(level) : seed);
  }
  const sectionOf = level => Math.floor((level - 1) / CONFIG.sectionSize);

  /* Which places in a chapter belong to the other game.

     Two of them, and the number is here rather than in CONFIG because it is not a
     setting. The pair is built by drawing one place and then the other at a
     distance from it; a third would need a rule about its distance from both, and
     changing a `2` in the config would not write that rule. It sat there as a key
     nothing read, which is worse than no setting at all: it reads as the knob for
     this and turning it does nothing.

     Scattered rather than on a stride. At a fixed stride a player has the rule
     after one chapter and every bubble board afterwards is an appointment;
     scattered, it stays the thing it is for, which is the run turning into
     something else without warning. Derived from the chapter number rather than
     from a list, so level 12 is the same board for everyone forever and there is
     nothing to keep in step with the par table.

     The second is drawn at least two places from the first, in both directions
     round the chapter. Merely making them distinct is not enough: it put pairs
     like 13 and 14 back to back, and two of the other game in consecutive boards
     reads as the game having changed rather than as a break in it. */
  function bubbleSlots(section){
    const mix = n => {
      let x = Math.imul(n + 0x9e3779b9, 2654435761) >>> 0;
      x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0;
      x ^= x >>> 13; return x >>> 0;
    };
    const size = CONFIG.sectionSize;
    const first = mix(section) % size;
    const second = (first + 2 + mix(section * 7919 + 11) % (size - 3)) % size;
    return [first, second];
  }

  /* Which game a level number is. Everything that deals, scores, prices or draws a
     level asks this rather than doing its own arithmetic, so the map and the
     scoring cannot disagree about what level 12 is.

     The opening half chapter is always the pour game. Somebody who has seen one
     board does not yet know what this game is, and handing them a different one
     at level two teaches that neither is the game. By the sixth they know, and the
     change lands as a change rather than as confusion. The last level is the pour
     game too: the graded run ends there and the finale should be the game the
     hundred and nineteen before it were. */
  function isBubble(level){
    if (!Number.isInteger(level) || level <= CONFIG.sectionSize / 2) return false;
    if (Number.isInteger(LAST_LEVEL) && level >= LAST_LEVEL) return false;
    return bubbleSlots(sectionOf(level)).includes((level - 1) % CONFIG.sectionSize);
  }
  function sectionName(level){
    const i = sectionOf(level);
    return i < CONFIG.sectionNames.length
      ? CONFIG.sectionNames[i]
      : `Reserve ${i - CONFIG.sectionNames.length + 1}`;
  }
  const sectionTint = level => CONFIG.sectionTints[sectionOf(level) % CONFIG.sectionTints.length];
  const isSectionStart = level => (level - 1) % CONFIG.sectionSize === 0;

  return { shape, baseShape, deal, make, seedFor, isBubble, bubbleSlots,
           sectionOf, sectionName, sectionTint, isSectionStart };
})();
