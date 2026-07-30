import { describe, it, assert, equal, loadPure } from './helpers.mjs';
import * as base from './baseline.mjs';

const { Rules } = loadPure();

describe('rules', () => {
  it('a pour takes the whole top run when there is room', () => {
    const t = [[0, 1, 1, 1], [1], []];
    equal(Rules.pourAmount(t, 0, 1), 3, 'three units of colour 1 should move');
  });
  it('a pour is cut short when the target runs out of room', () => {
    const t = [[0, 1, 1, 1], [1, 1, 1], []];
    equal(Rules.pourAmount(t, 0, 1), 1, 'only one unit fits');
  });
  it('colours must match unless the target is empty', () => {
    const t = [[0], [1], []];
    assert(!Rules.canPour(t, 0, 1), 'red onto amber must be refused');
    assert(Rules.canPour(t, 0, 2), 'anything may go into an empty bottle');
  });
  it('a finished bottle is locked', () => {
    const t = [[0, 0, 0, 0], []];
    assert(!Rules.canPour(t, 0, 1), 'a sealed bottle cannot be poured out');
    equal(Rules.legalMoves(t).length, 0, 'no moves exist');
  });
  it('a full bottle of mixed colours can still be poured from', () => {
    const t = [[0, 0, 0, 1], [1], []];
    assert(Rules.canPour(t, 0, 1), 'the top unit still moves');
  });
  it('pouring conserves every unit of liquid', () => {
    let t = base.randomBoard(5, 2);
    const count = tubes => tubes.flat().sort().join(',');
    const before = count(t);
    for (let i = 0; i < 40; i++){
      const moves = Rules.legalMoves(t);
      if (!moves.length) break;
      Rules.applyMove(t, moves[i % moves.length]);
      equal(count(t), before, 'liquid appeared or vanished');
      assert(t.every(x => x.length <= Rules.CAP), 'a bottle overflowed');
    }
  });
  it('legal moves agree with the independent baseline', () => {
    let mismatches = 0, checked = 0;
    for (let trial = 0; trial < 500; trial++){
      let st = base.randomBoard(2 + (trial % 4), 1 + (trial % 3));
      for (let step = 0; step < 5; step++){
        const mine = Rules.legalMoves(st).map(m => [m.from, m.to, m.n].join('>')).sort().join(' ');
        const theirs = base.legalMoves(st).map(m => m.join('>')).sort().join(' ');
        checked++;
        if (mine !== theirs) mismatches++;
        const moves = base.legalMoves(st);
        if (!moves.length) break;
        st = base.apply(base.clone(st), moves[Math.floor(Math.random() * moves.length)]);
      }
    }
    assert(checked > 1000, 'not enough states exercised');
    equal(mismatches, 0, `${mismatches} of ${checked} states disagreed`);
  });
  /* the bracket table itself is pinned in economy.test.mjs, next to the payouts
     it feeds, so the two cannot drift apart. What matters here is that rate()
     refuses to judge a run it has no honest yardstick for. */
  it('does not punish a run it cannot measure', () => {
    equal(Rules.rate(99, null), 3, 'with no par known, do not punish');
    equal(Rules.rate(9, 10), 3, 'beating par is three stars');
  });
  it('refuses to score against an inexact par', () => {
    /* A par the search only estimated is an upper bound, so a run that beats it
       has not been shown to match the minimum and a run that misses it has not
       been shown to miss the minimum. Neither may move the rating. */
    equal(Rules.rate(50, 59, false), 3, 'an estimate cannot cost a star');
    equal(Rules.rate(70, 59, false), 3, 'an estimate cannot cost a star either way');
    equal(Rules.rate(46, 41, true), 1, 'the same run against a real par is judged');
    equal(Rules.rate(41, 41, true), 3, 'matching a real par is still three');
  });
});
