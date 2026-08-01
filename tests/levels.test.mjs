import { describe, it, assert, equal, loadPure, read } from './helpers.mjs';
import { loadSolver } from './helpers.mjs';

const { Levels, Rules, CONFIG, RNG, ORDER, PARS } = loadPure();
const solver = loadSolver();

describe('levels', () => {
  it('the same level number always gives the same board', () => {
    for (const n of [1, 2, 7, 13, 26, 41]){
      const a = Levels.make(n), b = Levels.make(n);
      equal(a, b, `level ${n} was not reproducible`);
    }
  });
  it('different levels give different boards', () => {
    const seen = new Set();
    for (let n = 1; n <= 30; n++) seen.add(JSON.stringify(Levels.make(n)));
    equal(seen.size, 30, 'two levels produced identical boards');
  });
  it('the bottle count is always even so the grid never has a gap', () => {
    for (let n = 1; n <= 60; n++){
      const { bottles } = Levels.shape(n);
      equal(bottles % 2, 0, `level ${n} has ${bottles} bottles`);
    }
  });
  it('the grid always factors into two, three or four full rows', () => {
    for (let n = 1; n <= 60; n++){
      const { bottles } = Levels.shape(n);
      const options = [1, 2, 3, 4].filter(rows => bottles % rows === 0);
      assert(options.includes(2), `level ${n} cannot be laid out in two rows`);
    }
  });
  it('every board has the right amount of liquid and starts unsolved', () => {
    for (let n = 1; n <= 40; n++){
      const tubes = Levels.make(n);
      const { colors, empties, bottles } = Levels.shape(n);
      assert(tubes, `level ${n} failed to generate`);
      equal(tubes.length, bottles, `level ${n} bottle count`);
      equal(tubes.filter(t => t.length === 0).length, empties, `level ${n} empty bottles`);
      const counts = new Map();
      for (const c of tubes.flat()) counts.set(c, (counts.get(c) || 0) + 1);
      equal(counts.size, colors, `level ${n} colour count`);
      for (const [c, n2] of counts) equal(n2, Rules.CAP, `level ${n} colour ${c} unit count`);
      assert(!tubes.some(Rules.isFull), `level ${n} starts with a bottle already done`);
      assert(!Rules.isSolved(tubes), `level ${n} starts solved`);
    }
  });
  it('every board is solvable', () => {
    for (let n = 1; n <= 40; n++){
      assert(Rules.isSolvable(Levels.make(n)), `level ${n} is a dead end`);
    }
  });
  it('grows the board and then holds at the cap', () => {
    /* The board is what a player watches grow, and it is the bottle count that
       says how big it is. The colour count is free to move within a bottle
       count, because the ordering picks whichever of that size's two shapes
       measures closer to the curve, and five colours with three empties is the
       same eight bottles as six with two. Asserting colours would be asserting
       an implementation detail of the old shape formula. */
    let prev = 0;
    for (let n = 1; n <= 40; n++){
      const { colors, bottles } = Levels.shape(n);
      assert(bottles >= prev, `level ${n} deals a smaller board than the one before`);
      assert(colors <= CONFIG.maxColors, `level ${n} exceeds the palette`);
      prev = bottles;
    }
    equal(Levels.shape(1).colors, CONFIG.minColors, 'level 1 should be the gentlest');
    equal(Levels.shape(60).bottles, CONFIG.maxColors + 2, 'late levels should be at the cap');
  });
  it('par is reachable and worth earning', () => {
    for (const n of [1, 4, 9]){
      const tubes = Levels.make(n);
      const res = solver.solve(tubes, Levels.shape(n).colors);
      assert(res.exact, `level ${n} par was only an estimate`);
      assert(res.par >= Levels.shape(n).colors, `level ${n} par of ${res.par} looks too low`);
    }
  });
  it('chapters group ten levels and name themselves', () => {
    equal(Levels.sectionOf(1), 0);
    equal(Levels.sectionOf(10), 0);
    equal(Levels.sectionOf(11), 1);
    equal(Levels.sectionName(1), CONFIG.sectionNames[0]);
    assert(Levels.isSectionStart(21), 'level 21 opens a chapter');
    assert(!Levels.isSectionStart(22), 'level 22 does not');
    assert(Levels.sectionName(999).length > 0, 'chapters keep naming themselves past the list');
  });
});

describe('order', () => {
  const levels = Object.keys(ORDER).map(Number).sort((a, b) => a - b);

  it('deals a different board per level and never the same one twice', () => {
    const boards = Object.values(ORDER).map(e => e.join('/'));
    equal(boards.length, new Set(boards).size, 'two levels dealing the same board is a duplicate puzzle');
  });
  it('is a triple of whole numbers, since all three decide the board', () => {
    for (const level of levels){
      const e = ORDER[level];
      assert(Array.isArray(e) && e.length === 3 && e.every(Number.isInteger),
        `level ${level} has a malformed entry, and a malformed entry is silently ignored`);
    }
  });
  it('leaves the bottle count welded to the level number', () => {
    /* the board is free to change shape within a bottle count, but not to change
       size: the layout, the shelving and the sense of progress all read the count */
    for (const level of levels){
      equal(Levels.shape(level).bottles, Levels.baseShape(level).bottles,
        `level ${level} changed how big the board is, not just what is on it`);
    }
  });
  it('never shrinks the board as levels go up', () => {
    let seen = 0;
    for (const level of levels){
      const { bottles } = Levels.shape(level);
      assert(bottles >= seen, `level ${level} has fewer bottles than the level before it`);
      seen = bottles;
    }
  });
  it('deals the board its entry names', () => {
    for (const level of levels){
      const [colors, empties, seed] = ORDER[level];
      equal(Levels.seedFor(level), seed, `level ${level} ignores its seed`);
      equal(Levels.shape(level), { colors, empties, bottles: colors + empties },
        `level ${level} ignores its shape`);
      equal(Levels.make(level), Levels.deal(colors, empties, seed),
        `level ${level} does not deal the board its entry names`);
    }
  });
  it('covers the levels par was computed for', () => {
    /* a level with a par but no entry, or the reverse, means the table and the
       ordering were generated from different boards */
    equal(levels.map(String), Object.keys(PARS).sort((a, b) => Number(a) - Number(b)),
      'the order table and the par table disagree about which levels exist');
  });
  it('gets harder, which is the only reason any of this exists', () => {
    /* Re-measuring here would take twenty minutes, so the measurement is
       committed and this pins it. A hand-edited order, or a regeneration that
       quietly made the curve worse, fails here rather than in someone's game. */
    const curve = JSON.parse(read('docs/difficulty.json')).levels;
    equal(curve.map(r => r.level), levels, 'the measurement and the order cover different levels');
    for (const r of curve){
      equal([r.colors, r.empties, r.seed], ORDER[r.level],
        `level ${r.level} was measured as a different board than it deals`);
    }
    for (let i = 1; i < curve.length; i++){
      assert(curve[i].hard >= curve[i - 1].hard,
        `level ${curve[i].level} is easier than level ${curve[i - 1].level} (10^-${curve[i].hard} vs 10^-${curve[i - 1].hard})`);
    }
  });
  it('is stamped, so a save written against older boards can be spotted', () => {
    assert(Number.isInteger(CONFIG.layout) && CONFIG.layout > 0, 'CONFIG.layout must be a whole generation number');
  });
});

describe('rng', () => {
  it('is a pure function of its seed', () => {
    const a = RNG.mulberry32(42), b = RNG.mulberry32(42);
    for (let i = 0; i < 100; i++) equal(a(), b(), 'streams diverged');
  });
  it('stays inside the unit interval', () => {
    const r = RNG.mulberry32(7);
    for (let i = 0; i < 5000; i++){
      const v = r();
      assert(v >= 0 && v < 1, `value out of range: ${v}`);
    }
  });
  it('spreads adjacent seeds apart', () => {
    const first = n => RNG.mulberry32(RNG.hashSeed(n))();
    const values = [];
    for (let n = 1; n <= 20; n++) values.push(first(n));
    for (let i = 1; i < values.length; i++){
      assert(Math.abs(values[i] - values[i - 1]) > 0.001, `seeds ${i} and ${i + 1} are too close`);
    }
  });
});
