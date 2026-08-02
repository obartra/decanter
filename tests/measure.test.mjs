/* What has to be true about the measure.

   Chosen for what would actually break rather than for coverage. The rules ones
   are about conservation and about the canonical key, which is the one place
   this game's search differs from the other's and the one place a reflex copy
   would silently under-report par. The search ones include a par worked out by
   hand on paper, because a search that agrees with itself proves nothing. The
   scorer ones are about the inversion: this game gives NO stars for an unknown
   par where the pour game gives full marks, and the whole point of that decision
   is invisible unless it is asserted. */
import { describe, it, assert, equal, loadFrom } from './helpers.mjs';

const ctx = loadFrom('src/measure/js',
  ['00-config.js', '20-rules.js', '25-search.js', '30-levels.js', '32-order.js', '35-pars.js', '45-score.js']);
const { MeasureConfig: C, MeasureRules: R, MeasureSearch: S,
        MeasureLevels: L, MeasureScore: Sc, MeasureOrder: ORDER, MeasurePars: PARS } = ctx;

describe('measure rules', () => {
  it('moves all of it, or as much as fits, and never more', () => {
    const caps = [8, 5, 3];
    equal(R.apply(caps, [8, 0, 0], { from: 0, to: 1 }), [3, 5, 0], 'the target fills to its brim');
    equal(R.apply(caps, [3, 5, 0], { from: 1, to: 2 }), [3, 2, 3], 'and again into the small one');
    equal(R.apply(caps, [3, 2, 3], { from: 1, to: 0 }), [5, 0, 3], 'the source empties when it fits');
    equal(R.amountPoured(caps, [8, 0, 0], 0, 0), 0, 'a vessel cannot pour into itself');
    equal(R.amountPoured(caps, [0, 5, 0], 0, 1), 0, 'an empty source moves nothing');
    equal(R.amountPoured(caps, [8, 0, 0], 0, 0), 0, 'nor a full target');
    equal(R.amountPoured(caps, [3, 5, 0], 0, 1), 0, 'a target at its capacity has no room');
  });

  it('conserves every drop, over thousands of random pours', () => {
    /* There is no tap and no drain, so the total is an invariant. An apply()
       that leaked or invented a unit would show up nowhere else: every position
       it produced would still look like a perfectly ordinary bench. */
    for (let seed = 1; seed <= 200; seed++){
      const b = L.fromSeed(seed % 2 ? 3 : 4, seed);
      let amount = b.start.slice();
      const total = R.total(amount);
      equal(total, b.caps[0], 'the largest vessel starts full and holds all there is');
      for (let n = 0; n < 40; n++){
        const moves = R.pours(b.caps, amount);
        if (!moves.length) break;
        amount = R.apply(b.caps, amount, moves[(seed * 7 + n * 13) % moves.length]);
        equal(R.total(amount), total, `seed ${seed} pour ${n} changed how much wine there is`);
        for (let i = 0; i < amount.length; i++){
          assert(amount[i] >= 0 && amount[i] <= b.caps[i],
            `seed ${seed} pour ${n} put ${amount[i]} into a vessel holding ${b.caps[i]}`);
        }
      }
    }
  });

  it('keeps the vessels apart, because sorting the key would shorten par', () => {
    /* The single most likely thing for the next reader to copy across from the
       other game by reflex. Its bottles are interchangeable so it sorts before
       comparing; these are not, because their capacities differ, and two
       positions that sort the same have genuinely different futures. */
    const caps = [8, 5, 3];
    const a = [5, 3, 0], b = [5, 0, 3];
    assert(R.key(a) !== R.key(b), 'three in the five and three in the three are the same key');
    /* and they really are different positions: only one of them can still fill
       the small vessel from the middle one */
    equal(R.amountPoured(caps, a, 1, 2), 3);
    equal(R.amountPoured(caps, b, 1, 2), 0);
    /* which is exactly what a sorted key would have thrown away */
    equal(a.slice().sort().join(','), b.slice().sort().join(','),
      'the sorted forms must match, or this test is not testing what it says');
  });

  it('counts distinct outcomes, which here is every legal pour', () => {
    /* The measurement is stated in distinct outcomes, because that is what a
       decision is and because counting legal moves instead is the mistake that
       cost the other game its whole account of its own difficulty. Here the two
       are provably the same number — a pour changes exactly the two vessels it
       names, so two different pours always disagree somewhere — and the argument
       is written out in full above MeasureRules.outcomes.

       This asserts the identity rather than assuming it, because it is the thing
       that stops being true the moment this game grows an operation that can
       reach one position two ways, and the difficulty numbers would go on
       looking perfectly reasonable while quietly over-counting. */
    for (let seed = 1; seed <= 40; seed++){
      const b = L.fromSeed(seed % 2 ? 3 : 4, seed);
      let amount = b.start.slice();
      for (let n = 0; n < 25; n++){
        const legal = R.pours(b.caps, amount);
        const outs = R.outcomes(b.caps, amount);
        equal(outs.length, legal.length,
          `seed ${seed} position ${n}: ${legal.length} pours collapsed to ${outs.length} outcomes`);
        equal(new Set(outs.map(o => o.key)).size, outs.length, 'outcomes repeated a position');
        for (const o of outs){
          equal(R.key(R.apply(b.caps, amount, o.move)), o.key,
            'an outcome carried a move that does not produce it');
        }
        if (!legal.length) break;
        amount = R.apply(b.caps, amount, legal[(seed * 3 + n) % legal.length]);
      }
    }
  });

  it('is solved by any vessel, not a nominated one', () => {
    equal(R.isSolved([0, 4, 0], 4), true);
    equal(R.isSolved([0, 0, 4], 4), true, 'it does not matter which vessel holds it');
    equal(R.isSolved([4, 4, 4], 5), false);
    equal(R.isSolved([0, 0, 0], 0), true, 'an empty vessel measures nothing, which is a measure');
  });
});

describe('measure search', () => {
  it('gets the hand-worked answer for eight, five and three', () => {
    /* Worked on paper, and the line is written out so that a disagreement is a
       disagreement about the game rather than about arithmetic. Caps [8, 5, 3],
       all eight units in the largest, measure out four:

         (8,0,0) -> 8 into 5 -> (3,5,0)
                 -> 5 into 3 -> (3,2,3)
                 -> 3 into 8 -> (6,2,0)
                 -> 5 into 3 -> (6,0,2)
                 -> 8 into 5 -> (1,5,2)
                 -> 5 into 3 -> (1,4,3)   the five holds four

       Six pours. Note that the textbook answer to this puzzle is seven, and it
       is answering a different question: the classic wants FOUR AND FOUR, in the
       eight and the five both. This game asks only that some vessel holds the
       target, so it stops a pour earlier. Anyone checking this against a
       reference will find seven and should not "fix" it. */
    const got = S.solve([8, 5, 3], [8, 0, 0], 4);
    equal(got.par, 6, 'the classic bench, measuring four');
    assert(got.exact, 'a bench this size must resolve exactly');

    const moves = S.line([8, 5, 3], [8, 0, 0], 4);
    equal(moves.length, 6, 'the line has to be as long as par says');
    let amount = [8, 0, 0];
    for (const m of moves) amount = R.apply([8, 5, 3], amount, m);
    assert(R.isSolved(amount, 4), 'replaying the line does not actually reach four');
  });

  it('says plainly when a target cannot be reached', () => {
    /* Two vessels and no drain: from (5,0) the only pour gives (2,3), and from
       there the only pour gives (5,0) back. The bench has two positions in it
       and neither holds four. Proven, not guessed — `exact` says so. */
    const got = S.solve([5, 3], [5, 0], 4);
    equal(got.par, null, 'four cannot be measured on this bench');
    assert(got.exact, 'and that is proven by exhaustion, not by giving up');
    equal(got.first, null);
  });

  it('returns zero pours for a bench that already measures it', () => {
    equal(S.solve([9, 4], [9, 0], 9).par, 0, 'the largest starts full, so it already holds nine');
  });

  it('publishes a par that can actually be played, for every level', () => {
    /* The check that matters most about a par table: not that the number is
       reproducible, but that a sequence of exactly that many legal pours exists
       and really finishes the board. A par nobody can play would fail every
       player on that level while looking entirely reasonable in the table. */
    for (let level = 1; level <= PARS.last; level++){
      const b = L.make(level);
      const moves = S.line(b.caps, b.start, b.target);
      assert(moves, `level ${level} has no line at all`);
      equal(moves.length, PARS.par[level], `level ${level} disagrees with the committed table`);
      let amount = b.start.slice();
      for (const m of moves){
        assert(R.amountPoured(b.caps, amount, m.from, m.to) > 0,
          `level ${level} publishes a line containing a pour that does nothing`);
        amount = R.apply(b.caps, amount, m);
      }
      assert(R.isSolved(amount, b.target),
        `level ${level} claims par ${PARS.par[level]} but replaying it does not reach ${b.target}`);
    }
  });

  it('finds no shorter line than the one it published', () => {
    /* Independent of the table: a breadth first search reaches a target at depth
       d only after exhausting every position at depth d-1, so if any of them
       held the target it would already have stopped. This asserts the
       consequence directly by replaying par minus one pours of the optimal line
       and checking the board is genuinely not finished. */
    for (let level = 1; level <= PARS.last; level++){
      const b = L.make(level);
      const moves = S.line(b.caps, b.start, b.target);
      let amount = b.start.slice();
      for (const m of moves.slice(0, -1)){
        amount = R.apply(b.caps, amount, m);
        assert(!R.isSolved(amount, b.target),
          `level ${level} reaches ${b.target} before its published par`);
      }
    }
  });

  it('finds no dead end, because there provably is none', () => {
    /* The largest vessel started full, so its capacity is the whole total, so
       every other vessel can always be emptied into it and the opening position
       is reachable from anywhere. No pour can therefore be regretted and the
       board cannot be lost. This is why the game is graded on distance from par
       and on nothing else, and it is asserted rather than merely written down
       because a future rule change is exactly what would quietly break it. */
    for (let seed = 1; seed <= 60; seed++){
      const b = L.fromSeed(seed % 2 ? 3 : 4, seed);
      const m = S.survey(b.caps, b.start, b.target);
      if (!m || m.par == null) continue;
      equal(m.dead, 0, `seed ${seed} has positions the target cannot be reached from`);
    }
  });
});

describe('measure deal', () => {
  it('deals the same bench every time, from the same seed', () => {
    for (const vessels of C.VESSELS){
      for (let seed = 1; seed <= 50; seed++){
        const a = L.fromSeed(vessels, seed);
        const b = L.fromSeed(vessels, seed);
        equal(a, b, `${vessels} vessels, seed ${seed} dealt two different benches`);
      }
    }
  });

  it('deals a bench that is worth being handed', () => {
    for (const vessels of C.VESSELS){
      for (let seed = 1; seed <= 300; seed++){
        const b = L.fromSeed(vessels, seed);
        equal(b.caps.length, vessels, `seed ${seed} dealt the wrong number of vessels`);
        equal(new Set(b.caps).size, vessels, `seed ${seed} dealt two vessels of the same capacity`);
        for (const c of b.caps){
          assert(c >= C.CAP_MIN && c <= C.CAP_MAX, `seed ${seed} dealt a vessel holding ${c}`);
        }
        equal(b.caps.slice().sort((x, y) => y - x), b.caps, `seed ${seed} dealt the vessels out of order`);
        equal(b.start, b.caps.map((c, i) => (i === 0 ? c : 0)),
          `seed ${seed} did not start with all the wine in the largest vessel`);
        assert(b.target > 0 && b.target < b.caps[0], `seed ${seed} set an impossible target`);
        assert(!b.caps.includes(b.target),
          `seed ${seed} set a target some vessel measures by being filled to the brim`);
      }
    }
  });

  it('never deals two vessels, because there is no such puzzle', () => {
    /* The finding the whole generator is built around, asserted rather than
       written down. With no tap and no drain, a two-vessel bench has exactly two
       reachable positions: tip the large one into the small one, and tip it
       back. There is nowhere else for the wine to be. So the longest par any
       such bench can have is one pour, at any capacity, and shipping one would
       be shipping a demonstration of the controls. */
    for (const n of C.VESSELS) assert(n >= 3, `the generator is allowed to deal ${n} vessels`);

    let mostStates = 0, longest = 0;
    for (let big = 3; big <= C.CAP_MAX; big++){
      for (let small = C.CAP_MIN; small < big; small++){
        for (let target = 1; target < big; target++){
          const m = S.survey([big, small], [big, 0], target);
          if (!m) continue;
          mostStates = Math.max(mostStates, m.states);
          if (m.par != null) longest = Math.max(longest, m.par);
        }
      }
    }
    equal(mostStates, 2, 'a two-vessel bench has more positions than tipped and tipped back');
    equal(longest, 1, 'a two-vessel bench has a par worth playing, which it must not');
  });

  it('deals every level in the committed order, and nothing else moves', () => {
    for (let level = 1; level <= PARS.last; level++){
      const entry = ORDER[level];
      assert(Array.isArray(entry) && entry.length === 2, `level ${level} has no entry in the order`);
      equal(L.shape(level), { vessels: entry[0], seed: entry[1] }, `level ${level} reads its entry wrongly`);
      equal(L.make(level), L.fromSeed(entry[0], entry[1]), `level ${level} does not deal its own entry`);
    }
    /* Past the table a level is still a real bench, so the page has something to
       hand over rather than a blank. It has simply been measured by nobody,
       which is what makes it unrated. */
    const past = L.make(PARS.last + 1);
    assert(past && past.caps.length >= 3, 'a level past the table must still deal something');
    equal(PARS.par[PARS.last + 1], undefined, 'and must not appear in the par table');
  });

  it('rises, and never falls, across the whole table', () => {
    /* More vessels is easier here, so the board cannot be made to grow as a
       difficulty curve the way the pour game's does. Par is the curve, and it
       has to be non-decreasing or a player is told the game is getting harder
       while it gets shorter. */
    let last = 0;
    for (let level = 1; level <= PARS.last; level++){
      const par = PARS.par[level];
      assert(Number.isInteger(par), `level ${level} has no par`);
      assert(par >= last, `level ${level} is shorter than level ${level - 1} (${par} after ${last})`);
      last = par;
    }
    assert(last >= 12, `the table tops out at par ${last}, which is not much of a curve`);
  });
});

describe('measure scoring', () => {
  it('gives NOTHING for an unknown par, which is the opposite of the other game', () => {
    /* src/js/20-rules.js rate() returns FULL MARKS when par is null or inexact,
       and is right to: over there an inexact par is an upper bound the search
       settled for, and scoring against it could FAIL a run for the search's
       shortcomings. Here the state space is small enough that par is exact or
       there is something wrong, there is no gold for a generous default to mint,
       and three stars is the program asserting that this run matched a minimum
       nobody has ever computed. So: zero. */
    equal(Sc.stars(1, null, false), 0, 'an unknown par cannot be matched, so it is not');
    equal(Sc.stars(0, null, false), 0, 'not even by a run that made no mistakes to make');
    equal(Sc.stars(999, undefined, false), 0);
    equal(Sc.rated(null), false, 'and the board says so rather than showing a par of nothing');
    equal(Sc.rated(0), true, 'a par of zero is a real par');
    equal(Sc.left(3, null), null, 'there is no bar to run out of either');
  });

  it('pays three at par and steps down one over at a time', () => {
    equal(Sc.stars(7, 7, false), 3, 'par is three stars');
    equal(Sc.stars(8, 7, false), 2);
    equal(Sc.stars(9, 7, false), 1);
    equal(Sc.stars(10, 7, false), 0, 'three over the minimum is worth nothing');
    equal(Sc.stars(400, 7, false), 0);
    equal(Sc.stars(6, 7, false), 3, 'under par cannot happen, and is not punished for it');
  });

  it('caps a run that leaned on undo or hint', () => {
    /* Both cap here, where the bubble game caps for picking a colour only. On a
       perfect information board with a known minimum, an unlimited free undo is
       a solver and the hint simply names the answer; the pour game charges gold
       for both, and this page has no purse to charge. */
    equal(Sc.stars(7, 7, true), C.AID_CAP, 'a perfect run that used a tool still caps');
    equal(Sc.stars(9, 7, true), 1, 'the cap is a ceiling, not a penalty');
    equal(Sc.stars(10, 7, true), 0);
  });

  it('counts down the pours that still score, and stops at nothing', () => {
    equal(Sc.left(0, 5), 5 + C.STARS.one + 1, 'a fresh board has par plus the brackets');
    equal(Sc.left(7, 5), 1, 'one more pour still scores');
    equal(Sc.left(8, 5), 0, 'and then none do');
    equal(Sc.left(80, 5), 0, 'which does not go negative');
    /* it only ever falls */
    let was = Infinity;
    for (let m = 0; m < 40; m++){
      const now = Sc.left(m, 9);
      assert(now <= was, `the count went back up at ${m} pours`);
      was = now;
    }
  });

  it('treats the shorter run as the better one, not a worse one', () => {
    /* The bubble game's best is the LONGEST run and compares the other way.
       Getting this backwards would quietly record the worst run of every bench
       forever, and nothing about it would look wrong. */
    equal(Sc.better(9, 6), 6);
    equal(Sc.better(6, 9), 6);
    equal(Sc.better(null, 12), 12, 'a first run is always the best so far');
    equal(Sc.better(12, null), 12);
  });

  it('agrees with the committed table about what a perfect run is', () => {
    /* End to end: deal the level, walk the published line, and check the scorer
       calls it three stars. That is the whole promise the page makes. */
    for (const level of [1, 7, 19, 31, PARS.last]){
      const b = L.make(level);
      const moves = S.line(b.caps, b.start, b.target);
      equal(Sc.stars(moves.length, PARS.par[level], false), 3,
        `walking the optimal line on level ${level} is not worth three stars`);
      equal(Sc.stars(moves.length + 3, PARS.par[level], false), 0,
        `three pours over the minimum on level ${level} is still worth something`);
    }
  });
});
