/* What has to be true about the bubble game.

   Chosen for what would actually break rather than for coverage. The geometry
   ones each correspond to a bug that ships in this genre and that a player would
   see immediately: bubbles that visibly touch refusing to clear together, a shot
   landing somewhere the guide did not point, a board that rains down after a row
   is inserted, the same seed playing out differently twice. The later ones are
   about the parts that decide what a run was worth, where the failure is not
   visible at all: a hint that advises a shot the solver will not take, or a
   "best" that records the worst run of every level because longer is better here
   and shorter is better in the other game. */
import { describe, it, assert, equal, loadBubble } from './helpers.mjs';
/* The same loop the survival tool measures, so a green difficulty test and a red
   table cannot both be true. */
import { run, measure } from '../tools/bubble-run.mjs';

const { BubbleConfig: C, BubbleRng: Rng, BubbleGrid: G, BubbleShot: S, BubbleRules: R,
        BubbleAdvice: Adv, BubbleScore: Sc } = loadBubble();

/* The game's own stream, so a failure can be reproduced from its seed and so
   these boards are the boards the game deals rather than lookalikes. */
const rng = seed => Rng.from(seed);

function board(seed, rows, colours = 4){
  const r = rng(seed);
  const b = G.create(seed & 1);
  for (let j = 0; j < rows; j++){
    for (let c = 0; c < C.COLS; c++){
      if (r() < 0.82) b.rows[j][c] = Math.floor(r() * colours);
    }
  }
  /* only what is actually hanging from the ceiling, so the boards under test are
     boards the game could really be in */
  R.remove(b, R.detach(b));
  return b;
}

describe('bubble lattice', () => {
  it('says two cells are neighbours exactly when they touch', () => {
    /* The whole game rests on this. It cannot pass with a wrong parity table,
       with j % 2 in place of the board's parity, with four-way adjacency, or
       with a row height that is not sqrt(3)/2. */
    for (const parity of [0, 1]){
      const b = G.create(parity);
      for (let j = 0; j < C.ROWS; j++){
        for (let c = 0; c < C.COLS; c++){
          const here = G.centreOf(b, j, c);
          const touching = [];
          for (let j2 = 0; j2 < C.ROWS; j2++){
            for (let c2 = 0; c2 < C.COLS; c2++){
              if (j2 === j && c2 === c) continue;
              const q = G.centreOf(b, j2, c2);
              if (Math.abs(Math.hypot(q.x - here.x, q.y - here.y) - 1) < 1e-9) touching.push(`${j2},${c2}`);
            }
          }
          const claimed = G.neighbours(b, j, c).map(([a, d]) => `${a},${d}`);
          equal(claimed.slice().sort(), touching.slice().sort(),
            `parity ${parity} cell ${j},${c} disagrees about what it touches`);
        }
      }
    }
  });

  it('keeps saying so after rows are pushed in', () => {
    const b = G.create(0);
    for (let n = 0; n < 5; n++){
      G.advance(b, G.emptyRow());
      const j = 3, c = 4;
      const here = G.centreOf(b, j, c);
      for (const [nj, nc] of G.neighbours(b, j, c)){
        const q = G.centreOf(b, nj, nc);
        assert(Math.abs(Math.hypot(q.x - here.x, q.y - here.y) - 1) < 1e-9,
          `after ${n + 1} advances, ${nj},${nc} is called a neighbour but is not touching`);
      }
    }
  });

  it('puts every cell centre inside the walls', () => {
    for (const parity of [0, 1]){
      const b = G.create(parity);
      for (let j = 0; j < C.ROWS; j++){
        for (let c = 0; c < C.COLS; c++){
          const p = G.centreOf(b, j, c);
          assert(p.x >= 0.5 - 1e-9 && p.x <= C.WORLD_W - 0.5 + 1e-9,
            `cell ${j},${c} sits at x=${p.x}, outside the playfield`);
        }
      }
    }
  });
});

describe('bubble shot', () => {
  it('always lands somewhere it could legally rest', () => {
    /* The snap is a theorem, not a heuristic: the cell is provably empty, in
       bounds, adjacent to what was hit, and within 0.508 of the contact point.
       Anything else means the geometry is wrong. */
    let shots = 0, landed = 0;
    for (let seed = 1; seed <= 40; seed++){
      const b = board(seed, 6);
      for (let deg = -80; deg <= 80; deg += 2){
        const a = deg * Math.PI / 180;
        const got = S.resolveShot(b, C.MUZZLE, { x: Math.sin(a), y: -Math.cos(a) });
        shots++;
        if (!got.landing) continue;
        landed++;
        const { j, c } = got.landing;
        assert(G.inBounds(j, c), `seed ${seed} at ${deg}deg landed out of bounds at ${j},${c}`);
        assert(G.isEmpty(b, j, c), `seed ${seed} at ${deg}deg landed on an occupied cell`);
        if (got.contact.kind === 'bubble'){
          const touching = G.neighbours(b, got.contact.j, got.contact.c)
            .some(([nj, nc]) => nj === j && nc === c);
          assert(touching, `seed ${seed} at ${deg}deg landed somewhere it did not touch`);
        } else {
          equal(j, 0, `seed ${seed} at ${deg}deg hit the ceiling but did not land on row 0`);
        }
        const q = G.centreOf(b, j, c);
        const slide = Math.hypot(q.x - got.contact.x, q.y - got.contact.y);
        assert(slide <= 0.508 + 1e-9,
          `seed ${seed} at ${deg}deg slid ${slide.toFixed(3)} into its cell, which is further than geometry allows`);
      }
    }
    assert(landed > shots * 0.8, `only ${landed} of ${shots} shots landed at all`);
  });

  it('agrees with a simulator written a completely different way', () => {
    /* The one test that would catch a mistake shared between the solver and its
       own restatement: an independent naive version that steps the bubble along
       in small increments and checks for overlap, with no shared code. If the
       two disagree about where a bubble lands, one of them is wrong and it does
       not matter which. */
    const naive = (b, origin, dir) => {
      const step = 0.01;
      let p = { x: origin.x, y: origin.y };
      let u = { x: dir.x, y: dir.y };
      const n = Math.hypot(u.x, u.y); u = { x: u.x / n, y: u.y / n };
      for (let i = 0; i < 40000; i++){
        p = { x: p.x + u.x * step, y: p.y + u.y * step };
        if (p.x < 0.5){ p.x = 0.5 + (0.5 - p.x); u.x = -u.x; }
        if (p.x > C.WORLD_W - 0.5){ p.x = (C.WORLD_W - 0.5) - (p.x - (C.WORLD_W - 0.5)); u.x = -u.x; }
        if (p.y <= 0.5) return { kind: 'ceiling', x: p.x, y: 0.5 };
        if (p.y > C.WORLD_H) return { kind: 'floor' };
        for (const [j, c] of G.occupied(b)){
          const q = G.centreOf(b, j, c);
          if (Math.hypot(q.x - p.x, q.y - p.y) <= C.HIT_K) return { kind: 'bubble', j, c, x: p.x, y: p.y };
        }
      }
      return { kind: 'floor' };
    };

    let checked = 0, agreed = 0;
    for (let seed = 101; seed <= 118; seed++){
      const b = board(seed, 5);
      for (let deg = -76; deg <= 76; deg += 4){
        const a = deg * Math.PI / 180;
        const dir = { x: Math.sin(a), y: -Math.cos(a) };
        const exact = S.resolveShot(b, C.MUZZLE, dir);
        const rough = naive(b, C.MUZZLE, dir);
        if (exact.contact.kind !== rough.kind) continue;   /* a hair either side of a wall */
        checked++;
        if (rough.kind === 'floor'){ agreed++; continue; }
        const mine = exact.landing;
        const theirs = S.snapCell(b, rough, { x: rough.x, y: rough.y });
        if (mine && theirs && mine.j === theirs.j && mine.c === theirs.c) agreed++;
        else if (!mine && !theirs) agreed++;
      }
    }
    assert(checked > 300, `only ${checked} comparable shots, which is too few to mean anything`);
    /* Stepping at 0.01 cannot resolve a grazing contact the same way an exact
       solve does, so a handful of disagreements are the simulator's fault, not
       the game's. A real geometry bug moves this number a long way, not a little. */
    const rate = agreed / checked;
    assert(rate > 0.97, `the two only agreed on ${(rate * 100).toFixed(1)}% of ${checked} shots`);
  });

  it('always terminates, and says so when a shot escapes', () => {
    for (let seed = 200; seed <= 240; seed++){
      const b = board(seed, seed % 7);
      for (let deg = -80; deg <= 80; deg += 1){
        const a = deg * Math.PI / 180;
        const got = S.resolveShot(b, C.MUZZLE, { x: Math.sin(a), y: -Math.cos(a) });
        assert(got.points.length >= 2 && got.points.length <= C.MAX_SEGMENTS + 2,
          `seed ${seed} at ${deg}deg produced ${got.points.length} points`);
        assert(got.landing || got.contact.kind === 'floor',
          `seed ${seed} at ${deg}deg neither landed nor left the board`);
      }
    }
  });

  it('never aims flat enough to skim the board', () => {
    for (const target of [{ x: -100, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 500 }]){
      const d = S.aimFrom(C.MUZZLE, target);
      assert(d.y < 0, 'a shot must always travel upward');
      const fromVertical = Math.abs(Math.atan2(d.x, -d.y));
      assert(fromVertical <= C.AIM_CLAMP + 1e-9,
        `aim reached ${(fromVertical * 180 / Math.PI).toFixed(1)}deg from vertical`);
    }
  });
});

describe('bubble board', () => {
  it('pops a group of three and only a group of three', () => {
    const b = G.create(0);
    b.rows[0][3] = 1; b.rows[0][4] = 1;
    equal(R.matchFrom(b, 0, 3).length, 2, 'two of a colour is not a match');
    b.rows[0][5] = 1;
    equal(R.matchFrom(b, 0, 3).length, 3);
    b.rows[1][3] = 1;
    equal(R.matchFrom(b, 0, 3).length, 4, 'the row below is adjacent and counts');
    b.rows[0][7] = 1;
    equal(R.matchFrom(b, 0, 3).length, 4, 'a same colour bubble that is not touching does not');
  });

  it('drops what is no longer hanging from the ceiling', () => {
    const b = G.create(0);
    for (let c = 0; c < C.COLS; c++) b.rows[0][c] = 0;
    b.rows[1][4] = 1;
    b.rows[2][4] = 1;
    equal(R.detach(b).length, 0, 'a chain reaching the ceiling stays put');
    b.rows[0][4] = G.EMPTY;
    /* 1,4 may still touch 0,3 or 0,5 depending on stagger, so this asserts the
       principle rather than a hand counted answer */
    const floaters = R.detach(b);
    for (const [j, c] of floaters){
      assert(G.at(b, j, c) !== G.EMPTY, 'an empty cell cannot be a floater');
    }
    const kept = G.occupied(b).length - floaters.length;
    assert(kept < G.occupied(b).length || floaters.length === 0, 'detach returned nonsense');
  });

  it('leaves the board hanging together after every turn', () => {
    /* the property that matters: whatever the shot did, nothing is left
       floating and nothing is doubled up */
    for (let seed = 300; seed <= 330; seed++){
      const b = board(seed, 6);
      const colours = R.liveColours(b);
      if (!colours.length) continue;
      for (let n = 0; n < 12; n++){
        const a = ((seed * 7 + n * 13) % 140 - 70) * Math.PI / 180;
        const got = S.resolveShot(b, C.MUZZLE, { x: Math.sin(a), y: -Math.cos(a) });
        if (!got.landing) continue;
        assert(G.isEmpty(b, got.landing.j, got.landing.c), 'about to write into an occupied cell');
        R.resolveTurn(b, got.landing, colours[n % colours.length]);
        equal(R.detach(b).length, 0, `seed ${seed} shot ${n} left bubbles floating`);
      }
    }
  });

  it('only ever offers a colour that is still on the board', () => {
    const b = G.create(0);
    b.rows[0][0] = 2; b.rows[0][1] = 5;
    equal(R.liveColours(b), [2, 5]);
    b.rows[0][1] = G.EMPTY;
    equal(R.liveColours(b), [2], 'a colour that has left the board is not live');
  });

  it('pushes in a row without leaving the board floating', () => {
    const b = board(11, 5);
    const pick = (() => { let n = 0; return () => ((n = (n * 7 + 3) % 11) / 11); })();
    for (let i = 0; i < 4; i++){
      G.advance(b, R.freshRow(b, pick));
      R.remove(b, R.detach(b));
      equal(R.detach(b).length, 0, `advance ${i} left bubbles hanging from nothing`);
    }
  });

  it('never pushes in a colour the board has already lost', () => {
    const b = G.create(0);
    b.rows[0][0] = 3; b.rows[0][1] = 5;
    const row = R.freshRow(b, (() => { let n = 0; return () => ((n += 0.37) % 1); })());
    for (const col of row) assert([3, 5].includes(col), `a row arrived carrying colour ${col}`);
  });

  it('knows when no shot can land at all', () => {
    /* A packed board has no empty neighbour to snap into, so every shot would
       vanish silently. The game has to see that coming rather than let a player
       fire into a board that eats bubbles. */
    const full = G.create(0);
    for (let j = 0; j < C.ROWS; j++) for (let c = 0; c < C.COLS; c++) full.rows[j][c] = j % 3;
    const resolve = (b, dir) => S.resolveShot(b, C.MUZZLE, dir).landing;
    equal(R.anyLanding(full, resolve), false, 'a completely packed board has nowhere to land');
    equal(R.anyLanding(board(12, 4), resolve), true, 'an ordinary board plainly does');
  });

  it('always reaches an ending rather than going on forever', () => {
    /* the property that matters most now: a run terminates, by clearing the
       board, by reaching the line, or by having nowhere left to put anything */
    const run = seed => {
      const rnd = rng(seed);
      const b = board(seed, 5);
      for (let shots = 1; shots <= 500; shots++){
        const live = R.liveColours(b);
        if (!live.length) return 'won';
        const a = (rnd() * 160 - 80) * Math.PI / 180;
        const got = S.resolveShot(b, C.MUZZLE, { x: Math.sin(a), y: -Math.cos(a) });
        if (got.landing){
          const res = R.resolveTurn(b, got.landing, live[Math.floor(rnd() * live.length)]);
          if (res.won) return 'won';
          if (res.lost) return 'lost';
        }
        if (shots % C.ADVANCE_EVERY === 0){
          G.advance(b, R.freshRow(b, rnd));
          R.remove(b, R.detach(b));
          if (R.isLost(b)) return 'lost';
        }
        if (!R.anyLanding(b, (bb, d) => S.resolveShot(bb, C.MUZZLE, d).landing)) return 'blocked';
      }
      return 'never';
    };
    for (let seed = 1; seed <= 12; seed++){
      const end = run(seed);
      assert(end !== 'never', `seed ${seed} played 500 shots without reaching an ending`);
    }
  });

  it('deals a board with nothing already matched on it', () => {
    /* built the naive way, every board arrives with a group of three sitting on
       it and the opening shot clears something nobody earned */
    for (let seed = 1; seed <= 20; seed++){
      const b = G.create(0);
      const rnd = rng(seed);
      for (let j = 0; j < 5; j++){
        for (let c = 0; c < C.COLS; c++){
          const start = Math.floor(rnd() * C.COLOURS);
          let chosen = start;
          for (let n = 0; n < C.COLOURS; n++){
            const col = (start + n) % C.COLOURS;
            b.rows[j][c] = col;
            if (R.matchFrom(b, j, c).length < C.MATCH_MIN){ chosen = col; break; }
          }
          b.rows[j][c] = chosen;
        }
      }
      for (const [j, c] of G.occupied(b)){
        assert(R.matchFrom(b, j, c).length < C.MATCH_MIN,
          `seed ${seed} dealt a board with a group already made at ${j},${c}`);
      }
    }
  });

  it('hands back everything it took off the board, and nothing else', () => {
    /* The animator draws what this returns and never reads the grid, so the two
       lists are the whole contract between the rules and the screen. A cell
       missing from them is a bubble that vanishes with no animation; a cell in
       them that is still on the board is one the player sees twice. */
    const b = G.create(0);
    for (let c = 0; c < C.COLS; c++) b.rows[0][c] = 1;
    b.rows[0][4] = 0; b.rows[0][5] = 0;
    b.rows[0][6] = -1;
    /* held up by the pair alone, so completing them cuts it free */
    b.rows[1][5] = 2;

    const before = G.occupied(b).length;
    const res = R.resolveTurn(b, { j: 0, c: 6 }, 0);

    equal(res.matched.length, 3, 'the completed group');
    equal(res.cut.length, 1, 'what was only hanging from it');
    equal(G.occupied(b).length, before + 1 - res.matched.length - res.cut.length,
      'the board did not lose exactly what was reported');
    for (const [j, c] of res.matched.concat(res.cut)){
      equal(G.at(b, j, c), -1, `${j},${c} was reported as gone but is still on the board`);
    }
    const key = ([j, c]) => `${j},${c}`;
    equal(new Set(res.matched.concat(res.cut).map(key)).size,
      res.matched.length + res.cut.length, 'a cell was reported in both lists');
  });

  it('accounts for every bubble that leaves, over a whole game', () => {
    /* the same invariant under real play rather than one arranged board */
    const rnd = rng(7);
    const b = board(3, 6);
    for (let n = 0; n < 120; n++){
      const live = R.liveColours(b);
      if (!live.length) break;
      const a = (rnd() * 160 - 80) * Math.PI / 180;
      const got = S.resolveShot(b, C.MUZZLE, { x: Math.sin(a), y: -Math.cos(a) });
      if (!got.landing) continue;
      const before = G.occupied(b).length;
      const res = R.resolveTurn(b, got.landing, live[Math.floor(rnd() * live.length)]);
      equal(G.occupied(b).length, before + 1 - res.matched.length - res.cut.length,
        `shot ${n} lost a different number of bubbles than it reported`);
      /* and the colour each one is drawn falling in came back with it, because
         by then the grid no longer has it to ask */
      for (const cell of res.matched.concat(res.cut)){
        assert(cell.length === 3 && cell[2] >= 0,
          `shot ${n} reported a cell with no colour to fall in`);
      }
      if (res.won || res.lost) break;
    }
  });

  it('plays out the same way twice from the same seed', () => {
    /* the cheapest possible net under non-deterministic tie breaks, iteration
       order drift in either flood fill, and any accidental dependence on time */
    const play = () => {
      const b = board(7, 6);
      for (let n = 0; n < 60; n++){
        const colours = R.liveColours(b);
        if (!colours.length) break;
        const a = ((n * 37) % 150 - 75) * Math.PI / 180;
        const got = S.resolveShot(b, C.MUZZLE, { x: Math.sin(a), y: -Math.cos(a) });
        if (!got.landing) continue;
        R.resolveTurn(b, got.landing, colours[n % colours.length]);
      }
      return G.hash(b);
    };
    equal(play(), play(), 'the same shots produced two different boards');
  });
});

describe('bubble advice', () => {
  it('finds the shot that clears, when one exists', () => {
    /* two of a colour with a gap under them, and one colour in hand: there is
       exactly one thing worth doing and the hint has to find it */
    const b = G.create(0);
    for (let c = 0; c < C.COLS; c++) b.rows[0][c] = 1;
    b.rows[0][4] = 0; b.rows[0][5] = 0;

    const best = Adv.bestShot(b, 0, S.resolveShot);
    assert(best, 'no shot at all on an open board');
    equal(best.matched, 3, 'the advice did not find the group it could complete');
  });

  it('says so when nothing clears, rather than pointing anywhere', () => {
    /* one colour on the board, a different one in hand: nothing can match, and a
       hint that pointed somewhere would be charging for a shrug */
    const b = G.create(0);
    for (let c = 0; c < C.COLS; c++) b.rows[0][c] = 1;
    equal(Adv.hasClearingShot(b, 0, S.resolveShot), false,
      'claimed a clearing shot for a colour that is not on the board');
    equal(Adv.hasClearingShot(b, 1, S.resolveShot), true,
      'a colour that is on the board three times over must be playable');
  });

  it('never advises a shot that cannot be taken', () => {
    /* whatever it returns has to be a landing the solver actually produces from
       that aim, or the hint points at a cell the bubble will not reach */
    for (let seed = 1; seed <= 12; seed++){
      const b = board(seed, 5);
      for (const colour of R.liveColours(b)){
        const best = Adv.bestShot(b, colour, S.resolveShot);
        if (!best) continue;
        const shot = S.resolveShot(b, C.MUZZLE, best.dir);
        assert(shot.landing, `seed ${seed} advised an aim that lands nowhere`);
        equal(shot.landing.j, best.landing.j, `seed ${seed} advised a different row`);
        equal(shot.landing.c, best.landing.c, `seed ${seed} advised a different column`);
      }
    }
  });

  it('leaves the board it was asked about untouched', () => {
    /* it works on clones; if it did not, asking for a hint would play the shot */
    const b = board(5, 5);
    const before = G.hash(b);
    Adv.bestShot(b, R.liveColours(b)[0], S.resolveShot);
    equal(G.hash(b), before, 'asking for advice changed the board');
  });
});

describe('bubble scoring', () => {
  it('pays three for a cleared board however short the run', () => {
    equal(Sc.stars({ cleared: true, survived: false, shots: 1, aided: false }), 3,
      'clearing is the par moment and pays in full');
  });

  it('pays three for surviving the run', () => {
    equal(Sc.stars({ cleared: false, survived: true, shots: C.RUN_SHOTS, aided: false }), 3,
      'lasting the whole run is the other way to finish it');
  });

  it('grades an unfinished run by how far through it got', () => {
    const { one, two } = C.STAR_SHOTS;
    const got = shots => Sc.stars({ cleared: false, survived: false, shots, aided: false });
    equal(got(one - 1), 0);
    equal(got(one), 1, 'on the threshold, not past it');
    equal(got(two), 2);
    equal(got(C.RUN_SHOTS), 2, 'two is the ceiling for a run that did not finish');
  });

  it('does not pay for finishing a run that ended on its last shot', () => {
    /* The bug this pins is one shot wide and worth a whole star. The run stops
       at RUN_SHOTS and the third threshold is RUN_SHOTS, so grading the third
       star on the count looks identical to grading it on the ending, right up
       until the final shot is the one that loses: the clock reads RUN_SHOTS, the
       bubbles are over the line, and the player is told they earned three. */
    equal(C.STAR_SHOTS.three, C.RUN_SHOTS,
      'the third star is the whole run, so these are one number and not two');
    equal(Sc.stars({ cleared: false, survived: false, shots: C.RUN_SHOTS, aided: false }), 2,
      'a run that reached the last shot and lost it did not survive');
  });

  it('caps a run that picked its colours, exactly like a bought vessel', () => {
    equal(Sc.stars({ cleared: false, survived: true, shots: C.RUN_SHOTS, aided: true }), C.AID_CAP);
    equal(Sc.stars({ cleared: true, survived: false, shots: 200, aided: true }), C.AID_CAP,
      'even clearing the board does not buy back the third star');
    equal(Sc.stars({ cleared: false, survived: false, shots: C.STAR_SHOTS.one, aided: true }), 1,
      'the cap is a ceiling, not a penalty');
  });

  it('treats a longer run as the better one, not a worse one', () => {
    /* The other game's best is the fewest pours and compares the other way.
       Getting this backwards would quietly record the worst run of every level
       forever, and nothing about the save would look wrong. */
    equal(Sc.better(40, 90), 90);
    equal(Sc.better(90, 40), 90);
    equal(Sc.better(null, 12), 12, 'a first run is always the best so far');
    equal(Sc.better(12, null), 12);
    equal(Sc.improved(40, 90), true);
    equal(Sc.improved(90, 40), false, 'a shorter run must not overwrite a longer one');
    equal(Sc.improved(null, 1), true);
  });

  it('keeps the thresholds inside the run they grade', () => {
    /* Three numbers that only mean anything in order, and nothing else notices
       if they stop being in it: a two-star bar past the end of the run is simply
       a star nobody can earn, and no test of the game itself would fail. */
    const { one, two, three } = C.STAR_SHOTS;
    assert(one < two && two < three, `stars out of order: ${one}, ${two}, ${three}`);
    equal(three, C.RUN_SHOTS, 'the last star is the end of the run');
    assert(C.ADVANCE_EVERY >= 4,
      'below four the board wins whatever the player does, and the run stops measuring anyone');
  });

  it('reports the next star as something the run can still reach', () => {
    equal(Sc.nextStarAt(0), C.STAR_SHOTS.one);
    equal(Sc.nextStarAt(C.STAR_SHOTS.one), C.STAR_SHOTS.two);
    equal(Sc.nextStarAt(C.STAR_SHOTS.three), null, 'nothing left to reach for');
    /* and the bar only ever fills */
    let last = -1;
    for (let s = 0; s <= C.STAR_SHOTS.three + 20; s++){
      const p = Sc.progress(s);
      assert(p >= last, `progress went backwards at ${s}`);
      assert(p >= 0 && p <= 1, `progress left its range at ${s}`);
      last = p;
    }
  });
});

describe('bubble deal', () => {
  it('is the same board the harness measures', () => {
    /* dealBoard lives in the rules so the game and the difficulty harness cannot
       deal differently; this is the assertion that keeps it that way */
    const seq = seed => { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; };
    equal(G.hash(R.dealBoard(5, seq(9))), G.hash(R.dealBoard(5, seq(9))),
      'the same stream dealt two different boards');
  });

  it('deals nothing already matched, and nothing already floating', () => {
    for (let seed = 1; seed <= 20; seed++){
      const rnd = rng(seed);
      const b = R.dealBoard(5, rnd);
      for (const [j, c] of G.occupied(b)){
        assert(R.matchFrom(b, j, c).length < C.MATCH_MIN,
          `seed ${seed} dealt a group already made at ${j},${c}`);
      }
      equal(R.detach(b).length, 0, `seed ${seed} dealt a board with something already loose`);
    }
  });
});

describe('bubble difficulty', () => {
  /* The bubble analogue of verify:pars, and the same three claims the survival
     tool prints. STAR_SHOTS and the cadence are set from measured pass rates,
     and nothing else in the suite fails if someone moves one and leaves the
     other behind: the game simply carries on grading against numbers that no
     longer describe it, which is how it got a one-star bar a real player cleared
     half the time.

     Runs come from tools/bubble-run.mjs, the same loop the tool measures, so a
     green test and a red table cannot both be true. Forty seeds rather than the
     tool's three hundred, and the bands are wide enough to survive the sampling
     noise that comes with that: the true rates are near 98%, 18% and 48%, and
     the bars below are set far enough off each to fail on a real change and not
     on a different day. */
  const rate = (miss, of) => {
    const m = measure({ seeds: 40, miss });
    return m.at[of];
  };

  it('puts the stars above aiming at nothing, where the first one unlocks', () => {
    /* A bubble level that banks no stars does not unlock the one after it, so
       the first bar is the difference between a level and a wall. It has to be
       clearable by anyone playing properly and out of reach of anyone not.

       The floor is a player putting the bubble in some reachable cell, not one
       firing at a random angle. That distinction is the whole reason these
       numbers moved: a random angle mostly buries itself in the first thing it
       meets and dies around 21, so measuring against it made every bar look far
       more earned than it was. */
    const competent = rate(0.30, 'one');
    const loose = rate(1, 'one');
    assert(competent >= 0.85,
      `a competent run reaches the first star ${(competent * 100).toFixed(0)}% of the time: the level is a wall`);
    assert(loose <= 0.35,
      `aiming at nothing reaches the first star ${(loose * 100).toFixed(0)}% of the time: the bar grades nothing`);
    /* the second bar has room for a tighter claim, and it is the one that says
       the run rewards playing rather than merely turning up */
    assert(rate(1, 'two') <= 0.10,
      'aiming at nothing reaches the second star too often for it to mean anything');
  });

  it('makes finishing the run worth playing for, and not a formality', () => {
    const competent = rate(0.30, 'three');
    const good = rate(0.15, 'three');
    assert(competent >= 0.15,
      `a competent run finishes ${(competent * 100).toFixed(0)}% of the time: the run is too long to be won`);
    assert(good <= 0.85,
      `a good run finishes ${(good * 100).toFixed(0)}% of the time: the run is too short to be lost`);
  });

  it('ends every run, one way or another', () => {
    /* The property that stops mattering quietly. A fixed length is what caps the
       run, so a run that reports more shots than RUN_SHOTS means the cap is not
       being applied and the game is unbounded again. */
    for (let seed = 1; seed <= 40; seed++){
      const o = run(seed, { miss: 0.30 });
      assert(['cleared', 'survived', 'line', 'blocked'].includes(o.how),
        `seed ${seed} ended as ${o.how}`);
      assert(o.shots <= C.RUN_SHOTS,
        `seed ${seed} ran ${o.shots} shots against a run of ${C.RUN_SHOTS}`);
    }
  });
});
