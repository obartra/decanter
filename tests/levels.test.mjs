import { describe, it, assert, equal, loadPure } from './helpers.mjs';
import { loadSolver } from './helpers.mjs';

const { Levels, Rules, CONFIG, RNG } = loadPure();
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
  it('difficulty rises and then holds at the cap', () => {
    let prev = 0;
    for (let n = 1; n <= 40; n++){
      const c = Levels.shape(n).colors;
      assert(c >= prev, `level ${n} got easier`);
      assert(c <= CONFIG.maxColors, `level ${n} exceeds the palette`);
      prev = c;
    }
    equal(Levels.shape(1).colors, CONFIG.minColors, 'level 1 should be the gentlest');
    equal(Levels.shape(60).colors, CONFIG.maxColors, 'late levels should be at the cap');
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
