import { describe, it, assert, equal, loadSolver, loadPure } from './helpers.mjs';
import * as base from './baseline.mjs';

const solver = loadSolver();
const { Levels, Rules } = loadPure();

describe('solver', () => {
  it('names a move that is actually on a shortest line', () => {
    /* A hint that is merely legal is worse than none: it is sold as the move the
       solver would play, and a player following it expects to still be on par.
       So the hint is followed all the way down, and every one of them has to cut
       the true distance by exactly one. */
    for (const level of [1, 3, 7]){
      const colors = Levels.shape(level).colors;
      const tubes = Levels.make(level);
      let got = solver.solve(tubes, colors, {});
      let distance = got.par;
      const started = distance;
      let played = 0;
      while (distance > 0){
        assert(got.first, `level ${level} had no move to suggest at distance ${distance}`);
        const [from, to] = got.first;
        assert(Rules.canPour(tubes, from, to), `level ${level} suggested a pour the rules refuse`);
        Rules.applyMove(tubes, { from, to, n: Rules.pourAmount(tubes, from, to) });
        played++;
        got = solver.solve(tubes, colors, {});
        equal(got.par, distance - 1, `level ${level} suggested a move that did not shorten the line`);
        distance = got.par;
      }
      assert(Rules.isSolved(tubes), `level ${level} did not end solved`);
      equal(played, started, `level ${level} took ${played} hints for a par of ${started}`);
    }
  });
  it('generates exactly the moves the game allows, before pruning', () => {
    let mismatches = 0, checked = 0;
    for (let trial = 0; trial < 600; trial++){
      let st = base.randomBoard(2 + (trial % 4), 1 + (trial % 3));
      for (let step = 0; step < 5; step++){
        const a = base.legalMoves(st).map(m => m.join('>')).sort().join(' ');
        const b = solver.internals.rawMoves(st).map(m => m.join('>')).sort().join(' ');
        checked++;
        if (a !== b) mismatches++;
        const moves = base.legalMoves(st);
        if (!moves.length) break;
        st = base.apply(base.clone(st), moves[Math.floor(Math.random() * moves.length)]);
      }
    }
    assert(checked > 1500, 'not enough states exercised');
    equal(mismatches, 0, `${mismatches} of ${checked} states disagreed`);
  });

  it('pruning never removes a move the search needs', () => {
    /* the prunes are: skip a uniform bottle poured into an empty one, and treat
       interchangeable targets as one. Neither may change the optimum. */
    let wrong = 0, runs = 0;
    const shapes = [[2, 1], [3, 1], [3, 2], [4, 1], [4, 2]];
    for (let i = 0; i < 90; i++){
      const [colors, empties] = shapes[i % shapes.length];
      const board = base.randomBoard(colors, empties);
      const truth = base.bfsOptimal(base.clone(board));
      if (truth === undefined) continue;
      runs++;
      const got = solver.solve(board, colors);
      const ok = truth === null ? got.par === null : (got.exact && got.par === truth);
      if (!ok) wrong++;
    }
    assert(runs > 60, `only ${runs} boards were checkable`);
    equal(wrong, 0, `${wrong} of ${runs} boards disagreed with brute force`);
  });

  it('handles restricted and degenerate positions', () => {
    const cases = [
      { name: 'already solved',        t: [[0,0,0,0], [1,1,1,1], []] , colors: 2 },
      { name: 'one clean pour',        t: [[0,0,0], [0], [1,1,1,1]]  , colors: 2 },
      { name: 'needs the empty',       t: [[0,1,0,1], [1,0,1,0], []] , colors: 2 },
      { name: 'room limited pour',     t: [[0,0,0], [0,1,1,1], [1]]  , colors: 2 },
      { name: 'deadlocked, no empty',  t: [[0,1,0,1], [1,0,1,0]]     , colors: 2 },
      { name: 'sealed bottle present', t: [[0,0,0,0], [1,2,1,2], [2,1,2,1], []], colors: 3 },
      { name: 'three tangled colors', t: [[0,1,2,0], [1,2,0,1], [2,0,1,2], [], []], colors: 3 }
    ];
    for (const c of cases){
      const truth = base.bfsOptimal(base.clone(c.t));
      const got = solver.solve(c.t, c.colors);
      if (truth === null) equal(got.par, null, `${c.name}: should report unsolvable`);
      else {
        assert(got.exact, `${c.name}: should be exact`);
        equal(got.par, truth, `${c.name}`);
      }
    }
  });

  it('the heuristic never overestimates', () => {
    /* h = segments - colors. If h ever exceeded the true remaining distance,
       A* could return a number that is too large. */
    const { segs } = solver.internals;
    for (let i = 0; i < 40; i++){
      const colors = 2 + (i % 3);
      const board = base.randomBoard(colors, 2);
      const truth = base.bfsOptimal(base.clone(board));
      if (truth == null) continue;
      const h = segs(board) - colors;
      assert(h <= truth, `heuristic ${h} exceeded true distance ${truth}`);
    }
  });

  it('finds an exact answer for real level sizes', () => {
    for (const [colors, empties] of [[6, 2], [8, 2], [10, 2]]){
      const board = base.randomBoard(colors, empties);
      const started = Date.now();
      const got = solver.solve(board, colors);
      assert(got.par === null || Number.isInteger(got.par), 'par must be an integer or null');
      if (got.par !== null) assert(got.exact, `${colors} colors fell back to an estimate`);
      assert(Date.now() - started < 8000, 'took too long');
    }
  });
});
