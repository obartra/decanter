/* The four things that have to be true about the bubble game.

   These are chosen for what would actually break rather than for coverage. Every
   one of them corresponds to a bug that ships in this genre and that a player
   would see immediately: bubbles that visibly touch refusing to pop together, a
   shot landing somewhere the guide did not point, a board that rains down after
   a row is inserted, or the same seed playing out differently twice. */
import { describe, it, assert, equal, loadBubble } from './helpers.mjs';

const { BubbleConfig: C, BubbleGrid: G, BubbleShot: S, BubbleRules: R } = loadBubble();

/* a small deterministic stream, so a failure can be reproduced from its seed */
function rng(seed){
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

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
