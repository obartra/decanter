import { describe, it, assert, equal, loadPure, loadSolver } from './helpers.mjs';
import * as base from './baseline.mjs';

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

  it('publishes a par that can actually be played', () => {
    /* The check above re-solves with the same solver, so it catches a stale
       table and nothing else. This asks the different question: does a sequence
       of exactly `par` legal moves exist, under the *independent* rules in
       baseline.mjs? A par that cannot be reached would fail every player on the
       level while looking perfectly reasonable in the table.

       Segments minus colours is recomputed here rather than imported, so a
       mistake in the solver's copy cannot hide behind the same mistake. */
    const h = tubes => {
      let segs = 0; const seen = new Set();
      for (const t of tubes)
        for (let i = 0; i < t.length; i++){
          if (i === 0 || t[i] !== t[i - 1]) segs++;
          seen.add(t[i]);
        }
      return segs - seen.size;
    };
    const solveIn = (start, limit) => {
      const seen = new Map();
      const go = (tubes, depth) => {
        if (base.solved(tubes)) return [];
        if (depth === 0 || h(tubes) > depth) return null;
        const k = base.exactKey(tubes);
        const best = seen.get(k);
        if (best !== undefined && best >= depth) return null;
        seen.set(k, depth);
        for (const m of base.legalMoves(tubes)){
          const rest = go(base.apply(base.clone(tubes), m), depth - 1);
          if (rest) return [m, ...rest];
        }
        return null;
      };
      return go(base.clone(start), limit);
    };

    const sample = [1, 9, 21, 34, 52, 71, 96, 118].filter(l => l <= levels.length);
    assert(sample.length >= 6, 'not enough levels sampled');
    for (const lvl of sample){
      const tubes = Levels.make(lvl);
      const path = solveIn(tubes, PARS[lvl]);
      assert(path, `level ${lvl}: par ${PARS[lvl]} cannot be reached at all`);
      equal(path.length, PARS[lvl], `level ${lvl}: solvable in fewer than par`);
      /* and the moves it found must really be legal, and really finish */
      let s = base.clone(tubes);
      for (const m of path){
        assert(base.legalMoves(s).some(x => x[0] === m[0] && x[1] === m[1] && x[2] === m[2]),
          `level ${lvl}: the path uses a move the rules do not allow`);
        s = base.apply(s, m);
      }
      assert(base.solved(s), `level ${lvl}: the path does not solve the board`);
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
