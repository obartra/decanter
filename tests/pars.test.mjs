import { describe, it, assert, equal, loadPure, loadSolver } from './helpers.mjs';

const ctx = loadPure();
const solver = loadSolver();
const { PARS, CONFIG, Levels } = ctx;
const levels = Object.keys(PARS).map(Number).sort((a, b) => a - b);

describe('par table', () => {
  it('covers a contiguous run of levels starting at one', () => {
    assert(levels.length > 0, 'table is empty');
    equal(levels[0], 1, 'table should start at level 1');
    equal(levels[levels.length - 1], levels.length, 'table should have no gaps');
  });

  it('holds a plausible positive integer for every level', () => {
    for (const lvl of levels){
      const par = PARS[lvl];
      const { colors, bottles } = Levels.shape(lvl);
      assert(Number.isInteger(par) && par > 0, `level ${lvl}: par ${par} is not a positive integer`);
      assert(par >= colors - 1, `level ${lvl}: par ${par} is below the colour floor`);
      assert(par <= bottles * CONFIG.capacity, `level ${lvl}: par ${par} is implausibly high`);
    }
  });

  it('stays honest: the solver still agrees, level by level', () => {
    /* If the generator, the capacity, or the solver changes, the committed
       table silently becomes wrong. Re-solving a spread of levels catches that
       without paying for all of them. */
    const sample = [1, 16, 25, 37, 49, 61, 73, 85, 97, 109].filter(l => l <= levels.length);
    assert(sample.length >= 8, 'not enough levels sampled');
    for (const lvl of sample){
      const tubes = Levels.make(lvl);
      assert(tubes, `level ${lvl}: generator produced no board`);
      const got = solver.solve(tubes, Levels.shape(lvl).colors, { nodeCap: 4000000, msCap: 30000 });
      assert(got.exact, `level ${lvl}: solver could not confirm par exactly`);
      equal(got.par, PARS[lvl], `level ${lvl}: table disagrees with the solver`);
    }
  });

  it('reaches past the point where difficulty stops rising', () => {
    /* colours climb every two levels until they cap, and the table is what
       keeps par exact, so it should cover well beyond that */
    const plateau = (CONFIG.maxColors - CONFIG.minColors) * 2 + 1;
    assert(levels.length > plateau,
      `table stops at ${levels.length}, before the plateau at ${plateau}`);
  });
});
