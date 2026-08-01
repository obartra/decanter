/* Level definition. Deterministic in the level number, so level 12 is the same
   puzzle for everyone, forever. */
/* Bottle count is always even so the board can lay out in two equal rows: the
   layout only takes row counts that divide the bottles exactly. */
function shape(level){
  const colors = Math.min(CONFIG.minColors + Math.floor((level - 1) / 2), CONFIG.maxColors);
  const empties = colors % 2 === 0 ? 2 : 3;
  return { colors, empties, bottles: colors + empties };
}
function make(level){
  const { colors, empties } = shape(level);
  const cap = CONFIG.capacity;
  const rng = RNG.mulberry32(RNG.hashSeed(level));
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
const sectionOf = level => Math.floor((level - 1) / CONFIG.sectionSize);
function sectionName(level){
  const i = sectionOf(level);
  return i < CONFIG.sectionNames.length
    ? CONFIG.sectionNames[i]
    : `Reserve ${i - CONFIG.sectionNames.length + 1}`;
}
const sectionTint = level => CONFIG.sectionTints[sectionOf(level) % CONFIG.sectionTints.length];
const isSectionStart = level => (level - 1) % CONFIG.sectionSize === 0;

globalThis.Levels = { shape, make, sectionOf, sectionName, sectionTint, isSectionStart };
