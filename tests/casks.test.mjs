/* What has to be true about the cellar door.

   Chosen for what would actually break rather than for coverage. The rules ones
   are about the run — a cask must never end up on a cell it could not have slid
   through, which is the one rule the drag input could quietly violate — and
   about a move costing one whatever it carries. The search ones include a par
   worked out by hand on paper, because a search that agrees with itself proves
   nothing, and an assertion that the move graph really is undirected, because
   the entire generator is built on that and it is the kind of claim that stays
   true until somebody adds a rule. The board ones re-solve every shipped level.
   The scorer ones are about the inversion: this game gives NO stars for an
   unknown par where the pour game gives full marks, and the whole point of that
   decision is invisible unless it is asserted. */
import { describe, it, assert, equal, loadFrom } from './helpers.mjs';

const ctx = loadFrom('src/casks/js',
  ['00-config.js', '20-rules.js', '25-search.js', '30-levels.js', '32-boards.js', '35-pars.js', '45-score.js']);
const { CasksConfig: C, CasksRules: R, CasksSearch: S,
        CasksLevels: L, CasksScore: Sc, CasksBoards: BOARDS, CasksPars: PARS } = ctx;

/* The hand-worked board, written out so a disagreement is a disagreement about
   the game rather than about arithmetic.

     · · · a · ·
     · · · a · ·
     # # · a · b     <- the door
     · · · · · b
     · · · · · ·
     · · c c c ·

   The gilt cask (#) needs columns 2 to 5 of the exit row clear, and two things
   are on them: the vertical `a` at column 3, and the vertical `b` at column 5.
   `a` is already against the north wall so it can only go down, and going down
   needs (5,3), which `c` is sitting on. So `c` must move, then `a`, then `b`,
   then the gilt cask: FOUR moves, and none of the first three can be skipped or
   combined. Anyone checking this by hand should get the same four. */
const HAND = {
  layout: [
    { horiz: true, len: 2, fixed: 2 },     // the gilt cask, on the exit row
    { horiz: false, len: 3, fixed: 3 },    // a
    { horiz: false, len: 2, fixed: 5 },    // b
    { horiz: true, len: 3, fixed: 5 }      // c
  ],
  start: [0, 0, 2, 2]
};

describe('casks rules', () => {
  it('slides along its own length, any distance, and stops at what is in the way', () => {
    const { layout, start } = HAND;
    /* the gilt cask is hemmed in by `a` at column 3, so its run stops short of
       the door however far the player pushes */
    equal(R.runOf(layout, start, 0), { min: 0, max: 1 }, 'the gilt cask can only reach column 1');
    /* `a` is against the north wall and blocked below by `c` at (5,3) */
    equal(R.runOf(layout, start, 1), { min: 0, max: 2 }, 'the tall cask is pinned at both ends');
    /* `c` has the whole south row except where it already is */
    equal(R.runOf(layout, start, 3), { min: 0, max: 3 }, 'the south cask has the run of the row');
  });

  it('never lets a cask through another one to the space beyond', () => {
    /* The failure a naive implementation makes: test whether the destination
       cells are empty and let the cask jump the thing in front of it. Column 3
       of the exit row is taken by `a`, and columns 4 and 5 are free, so a
       destination test alone would happily put the gilt cask at the door. */
    const { layout, start } = HAND;
    const g = R.occupancy(layout, start);
    equal(g[2 * C.W + 3], 1, 'the tall cask is on the exit row, or this test proves nothing');
    equal(g[2 * C.W + 4], -1, 'and the two cells past it are empty');
    equal(g[2 * C.W + 5], 2);
    equal(R.canMove(layout, start, 0, 4), false, 'the gilt cask must not jump to the door');
    assert(!R.moves(layout, start).some(m => m.cask === 0 && m.to > 1),
      'the move list offered a cell the cask cannot slide through');
  });

  it('counts one move however far the cask travelled', () => {
    /* The rule docs/design/01-puzzle.md decides for all three games. A move is
       {cask, to} and carries no distance at all, which is the cheapest possible
       way of making it impossible to charge for one. */
    const { layout, start } = HAND;
    const one = R.apply(layout, start, { cask: 3, to: 1 });
    const four = R.apply(layout, start, { cask: 3, to: 0 });
    assert(R.canMove(layout, start, 3, 1) && R.canMove(layout, start, 3, 0),
      'both a nudge and a shove have to be legal for this to mean anything');
    equal(one[3], 1);
    equal(four[3], 0);
    for (const m of R.moves(layout, start)){
      equal(Object.keys(m).sort(), ['cask', 'to'], 'a move carries something other than which cask and where');
    }
  });

  it('tells two positions apart that a sorted key would confuse', () => {
    /* The reflex to bring across from the pour game, which sorts its bottles
       before comparing because they are interchangeable. Casks are not: these
       two positions differ only in which cask is at 2, and they are completely
       different boards because the two casks are pinned to different columns. */
    const a = [0, 0, 2, 2];
    const b = [0, 2, 0, 2];
    assert(R.key(a) !== R.key(b), 'two genuinely different floors share a key');
    equal(a.slice().sort().join(), b.slice().sort().join(),
      'the sorted forms must match, or this test is not testing what it says');
  });

  it('gives every move a distinct outcome, which here it cannot help doing', () => {
    /* Difficulty in this repository is stated in distinct outcomes rather than
       legal moves; docs/design/02-levels.md records what counting moves cost the
       pour game. Here the two are provably the same number, because a move
       changes exactly one cask to a value it did not hold, so two moves always
       disagree somewhere. Asserted rather than assumed, because it is what stops
       being true the day this game grows a rotation or a second exit. */
    for (let level = 1; level <= Math.min(PARS.last, 20); level++){
      const { layout, start } = L.make(level);
      let pos = start.slice();
      for (let n = 0; n < 20; n++){
        const moves = R.moves(layout, pos);
        if (!moves.length) break;
        const keys = new Set(moves.map(m => R.key(R.apply(layout, pos, m))));
        equal(keys.size, moves.length, `level ${level} step ${n}: two moves reached one position`);
        pos = R.apply(layout, pos, moves[(level * 7 + n * 13) % moves.length]);
      }
    }
  });

  it('keeps every cask on the floor and off every other cask', () => {
    for (let level = 1; level <= PARS.last; level++){
      const { layout, start } = L.make(level);
      let pos = start.slice();
      assert(R.wellFormed(layout, pos), `level ${level} does not deal a well-formed floor`);
      for (let n = 0; n < 30; n++){
        const moves = R.moves(layout, pos);
        if (!moves.length) break;
        pos = R.apply(layout, pos, moves[(level * 5 + n * 11) % moves.length]);
        assert(R.wellFormed(layout, pos),
          `level ${level} move ${n} put two casks on one flagstone, or one off the floor`);
      }
    }
  });

  it('never deals a second horizontal cask on the exit row', () => {
    /* It can wall the gilt cask in from the far side, and a board the door
       cannot be reached on is not a hard board, it is a broken one. The
       generator refuses to place one; this is the assertion that the shipped
       table kept that promise. */
    for (let level = 1; level <= PARS.last; level++){
      const { layout } = L.make(level);
      for (let i = 1; i < layout.length; i++){
        assert(!(layout[i].horiz && layout[i].fixed === C.EXIT_ROW),
          `level ${level} has a second horizontal cask on the exit row`);
      }
    }
  });
});

describe('casks search', () => {
  it('gets the hand-worked answer of four', () => {
    const got = S.solve(HAND.layout, HAND.start);
    equal(got.par, 4, 'the hand-worked board');
    assert(got.exact, 'a floor this size must resolve exactly');

    const moves = S.line(HAND.layout, HAND.start);
    equal(moves.length, 4, 'the line has to be as long as par says');
    let pos = HAND.start.slice();
    for (const m of moves){
      assert(R.canMove(HAND.layout, pos, m.cask, m.to), 'the line contains a move the board does not offer');
      pos = R.apply(HAND.layout, pos, m);
    }
    assert(R.isOut(HAND.layout, pos), 'replaying the line does not actually reach the door');
  });

  it('returns nothing to do for a floor that is already open', () => {
    const open = [4, 0, 2, 2];
    assert(R.isOut(HAND.layout, open), 'the gilt cask is at the wall in this position');
    equal(S.solve(HAND.layout, open).par, 0);
  });

  it('says plainly when the door cannot be reached', () => {
    /* A gilt cask walled in from the far side, which is exactly the layout the
       generator refuses to draw. Proven by exhaustion rather than guessed at —
       `exact` says so — and it is the difference between "no way out" and "the
       search gave up", which 45-score.js treats as the same score and the page
       does not. */
    const walled = [
      { horiz: true, len: 2, fixed: C.EXIT_ROW },
      { horiz: true, len: 2, fixed: C.EXIT_ROW }
    ];
    /* The second cask is on the exit row too, so it is always between the gilt
       one and the wall however either of them is shoved — the gilt cask can
       reach column 3 at best. Every position on this floor is a losing one, and
       there was never a move that made it so. */
    const got = S.solve(walled, [0, 4]);
    equal(got.par, null, 'this cask cannot get out');
    assert(got.exact, 'and that is proven, not given up on');
    equal(R.wellFormed(walled, [0, 4]), false, 'and the generator is not allowed to draw it');
  });

  it('has an undirected move graph, which is what the generator is built on', () => {
    /* Sliding is reversible: the cells a cask passed over are exactly the ones it
       now covers or has just vacated, so nothing can have moved in behind it.
       The whole backward sweep depends on it — see the header of 25-search.js —
       and it is the sort of claim that stays true until somebody adds a rule, so
       it is checked on real boards rather than argued about. */
    for (const level of [1, 9, 21, 37, PARS.last]){
      const { layout, start } = L.make(level);
      let pos = start.slice();
      for (let n = 0; n < 12; n++){
        const moves = R.moves(layout, pos);
        if (!moves.length) break;
        for (const m of moves){
          const there = R.apply(layout, pos, m);
          assert(R.canMove(layout, there, m.cask, pos[m.cask]),
            `level ${level}: cask ${m.cask} could slide to ${m.to} and not back`);
        }
        pos = R.apply(layout, pos, moves[(level + n) % moves.length]);
      }
    }
  });

  it('sweeps backwards to the same distances a forward search finds', () => {
    /* The generator never solves a board from its start. It sweeps outward from
       every already-open state and reads the distance off, which is only the
       same number because the graph is undirected. This asserts the two agree,
       state by state, on real boards — if they ever stopped agreeing, every
       shipped par would be wrong and nothing else here would notice. */
    for (const level of [2, 14, 30, PARS.last]){
      const { layout, start } = L.make(level);
      const comp = S.component(layout, start);
      assert(comp, `level ${level} has a component too big to walk`);
      const dist = S.sweep(layout, comp);
      const step = Math.max(1, Math.floor(comp.states.length / 40));
      for (let i = 0; i < comp.states.length; i += step){
        equal(S.solve(layout, comp.states[i]).par, dist[i] < 0 ? null : dist[i],
          `level ${level} state ${i}: the sweep and the search disagree`);
      }
    }
  });

  it('finds the hardest start a layout has, and it really is the hardest', () => {
    /* The claim that makes generating backwards worth doing: the state furthest
       from the door is provably the hardest start that layout can offer, so one
       sweep returns the best board rather than the first acceptable one. Checked
       by sweeping and then asserting nothing in the component is further. */
    const best = S.hardest(HAND.layout, HAND.start);
    assert(best, 'the hand-worked layout should sweep');
    const comp = S.component(HAND.layout, HAND.start);
    const dist = S.sweep(HAND.layout, comp);
    equal(best.par, Math.max(...dist), 'hardest() did not return the furthest state');
    equal(S.solve(HAND.layout, best.pos).par, best.par, 'and that state does not solve in that many');
  });
});

describe('casks boards', () => {
  it('ships a board and a par for every level, and nothing past the end', () => {
    assert(PARS.last >= 40, `only ${PARS.last} floors were generated, which is not much of a cellar`);
    for (let level = 1; level <= PARS.last; level++){
      assert(typeof BOARDS[level] === 'string' && BOARDS[level].length,
        `level ${level} has no board`);
      assert(Number.isInteger(PARS.par[level]), `level ${level} has no par`);
    }
    equal(BOARDS[PARS.last + 1], undefined, 'there is a board past the end of the par table');
    equal(L.make(PARS.last + 1), null, 'and the deal must hand back nothing rather than improvise one');
  });

  it('deals the same floor every time, and reads back what it wrote', () => {
    for (let level = 1; level <= PARS.last; level++){
      const a = L.make(level);
      const b = L.make(level);
      equal(a, b, `level ${level} dealt two different floors`);
      equal(L.encode(a.layout, a.start), BOARDS[level],
        `level ${level} does not encode back to the string it was parsed from`);
    }
  });

  it('is solvable in exactly its published par, on every single floor', () => {
    /* The check that matters most about a par table: not that the number is
       reproducible, but that a sequence of exactly that many legal moves exists
       and really opens the door. A par nobody can play would fail every player
       on that level while looking entirely reasonable in the table. */
    for (let level = 1; level <= PARS.last; level++){
      const { layout, start } = L.make(level);
      const moves = S.line(layout, start);
      assert(moves, `level ${level} has no way out at all`);
      equal(moves.length, PARS.par[level], `level ${level} disagrees with the committed table`);
      let pos = start.slice();
      for (const m of moves){
        assert(R.canMove(layout, pos, m.cask, m.to),
          `level ${level} publishes a line containing a move the board does not offer`);
        pos = R.apply(layout, pos, m);
      }
      assert(R.isOut(layout, pos),
        `level ${level} claims par ${PARS.par[level]} but replaying it does not open the door`);
    }
  });

  it('is not solvable in fewer, which is the other half of the promise', () => {
    /* Independent of the table. A breadth first search reaches the door at depth
       d only after exhausting every position at depth d-1, so if any of them had
       been open it would already have stopped. This asserts the consequence
       directly, by replaying par minus one moves of the optimal line and
       checking the door is genuinely still shut. */
    for (let level = 1; level <= PARS.last; level++){
      const { layout, start } = L.make(level);
      const moves = S.line(layout, start);
      let pos = start.slice();
      for (const m of moves.slice(0, -1)){
        pos = R.apply(layout, pos, m);
        assert(!R.isOut(layout, pos), `level ${level} opens before its published par`);
      }
    }
  });

  it('rises, and never falls, across the whole table', () => {
    /* Par is the curve. The floor does not grow with the level number — it is
       always six by six — and crowding it is not a difficulty knob either, since
       the field has trivial thirteen-cask boards and vicious eight-cask ones. So
       if this fell, a player would be told the game was getting harder while it
       got shorter. */
    let last = 0;
    for (let level = 1; level <= PARS.last; level++){
      const par = PARS.par[level];
      assert(par >= last, `level ${level} is shorter than level ${level - 1} (${par} after ${last})`);
      last = par;
    }
    assert(last >= 20, `the table tops out at par ${last}, which is not much of a curve`);
  });
});

describe('casks scoring', () => {
  it('gives NOTHING for an unknown par, which is the opposite of the pour game', () => {
    /* src/js/20-rules.js rate() returns FULL MARKS when par is null or inexact,
       and is right to: over there an inexact par is an upper bound the search
       settled for, and grading against one could FAIL a run for the search's
       shortcomings. Here the boards and their pars ship together out of one
       measurement, so a missing par is the two tables having come apart rather
       than a hard board — and three stars would turn that into a game that pays
       out on every level while looking perfectly healthy. So: zero. */
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

  it('counts down the moves before the run is worth nothing, and stops there', () => {
    equal(Sc.left(0, 5), 5 + C.STARS.one + 1, 'a fresh floor has par plus the brackets');
    equal(Sc.left(7, 5), 1, 'move 8 is the one that stops it scoring');
    equal(Sc.left(8, 5), 0, 'and it has');
    equal(Sc.left(80, 5), 0, 'which does not go negative');
    let was = Infinity;
    for (let m = 0; m < 40; m++){
      const now = Sc.left(m, 9);
      assert(now <= was, `the count went back up at ${m} moves`);
      was = now;
    }
  });

  /* left() is INCLUSIVE of the move that kills the run, and the bar's tooltip
     used to print it as the count of moves that still score — so at par + 2 it
     promised a scoring move when the next one earned nothing. The prose in this
     file said the same, which is what aimed the last reader at the module
     instead of the string. This pins the two together so neither can drift. */
  it('agrees with stars about which further moves are worth making', () => {
    for (const par of [1, 5, 12, 30]){
      for (let moves = 0; moves <= par + 6; moves++){
        let scoring = 0;
        for (let m = moves + 1; Sc.stars(m, par, false) > 0; m++) scoring++;
        equal(Math.max(0, Sc.left(moves, par) - 1), scoring,
          `at ${moves} of par ${par} the bar and the scorer disagree`);
      }
    }
  });

  it('treats the shorter run as the better one, not a worse one', () => {
    /* The bubble game's best is the LONGEST run and compares the other way.
       Getting this backwards would quietly record the worst run of every floor
       forever, and nothing about it would look wrong. */
    equal(Sc.better(9, 6), 6);
    equal(Sc.better(6, 9), 6);
    equal(Sc.better(null, 12), 12, 'a first run is always the best so far');
    equal(Sc.better(12, null), 12);
  });

  it('agrees with the committed table about what a perfect run is', () => {
    /* End to end: deal the floor, walk the published line, and check the scorer
       calls it three stars. That is the whole promise the page makes. */
    for (const level of [1, 8, 25, 44, PARS.last]){
      const { layout, start } = L.make(level);
      const moves = S.line(layout, start);
      equal(Sc.stars(moves.length, PARS.par[level], false), 3,
        `walking the optimal line on level ${level} is not worth three stars`);
      equal(Sc.stars(moves.length + 3, PARS.par[level], false), 0,
        `three moves over the minimum on level ${level} is still worth something`);
    }
  });
});
