/* Level definition. Deterministic in the level number, so level 12 is the same
   puzzle for everyone, forever. */
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
  const e = globalThis.ORDER && globalThis.ORDER[level];
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
function sectionName(level){
  const i = sectionOf(level);
  return i < CONFIG.sectionNames.length
    ? CONFIG.sectionNames[i]
    : `Reserve ${i - CONFIG.sectionNames.length + 1}`;
}
const sectionTint = level => CONFIG.sectionTints[sectionOf(level) % CONFIG.sectionTints.length];
const isSectionStart = level => (level - 1) % CONFIG.sectionSize === 0;

globalThis.Levels = { shape, baseShape, deal, make, seedFor, sectionOf, sectionName, sectionTint, isSectionStart };
