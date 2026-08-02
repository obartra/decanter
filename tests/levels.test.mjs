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

describe('which game a level is', () => {
  const graded = [...Array(120)].map((_, i) => i + 1);
  const bubble = () => graded.filter(Levels.isBubble);

  it('gives every chapter two bubble boards, and the first one less', () => {
    /* Two per ten keeps the density even. The opening chapter gets one, because
       its first half is where the pour game is learned. */
    for (let section = 1; section < 12; section++){
      equal(bubble().filter(l => Levels.sectionOf(l) === section).length, 2,
        `chapter ${section} should hold two bubble boards`);
    }
    equal(bubble().filter(l => Levels.sectionOf(l) === 0).length, 1,
      'the opening chapter should hold one');
  });

  it('leaves the start and the finish to the pour game', () => {
    for (const n of [1, 2, 3, 4, 5]) assert(!Levels.isBubble(n),
      `level ${n} is in the opening half chapter and must teach pouring`);
    assert(!Levels.isBubble(120), 'the graded run should finish on the game it spent itself on');
  });

  it('never puts two bubble boards back to back', () => {
    /* Two of the other game in consecutive levels reads as the game having
       changed rather than as a break in it. */
    const b = bubble();
    for (let i = 1; i < b.length; i++){
      assert(b[i] - b[i - 1] > 1, `levels ${b[i - 1]} and ${b[i]} are both bubble and adjacent`);
    }
  });

  it('does not put them on a stride anyone can learn', () => {
    /* The whole point of scattering: at a fixed interval every bubble board is
       an appointment rather than a surprise. */
    const b = bubble();
    const gaps = new Set(b.slice(1).map((l, i) => l - b[i]));
    assert(gaps.size > 2, `the gaps are ${[...gaps].join(',')}, which is a pattern`);
  });

  it('decides the same way every time', () => {
    /* level 12 has to be the same board for everyone, forever */
    equal(bubble(), bubble());
    equal(Levels.bubbleSlots(3), Levels.bubbleSlots(3));
  });

  /* bubbleSlots was generalised so CONFIG.bubblePerChapter, which had sat there
     with a paragraph of reasoning and no reader, actually decides something.
     The generalisation is only acceptable if it moved nothing, so this is the
     old two-slot arithmetic written out and compared against the real one. A
     level is a pure function of its number and a refactor does not get to bend
     that. */
  it('places them exactly where the two-slot version did', () => {
    const mix = n => {
      let x = Math.imul(n + 0x9e3779b9, 2654435761) >>> 0;
      x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0;
      x ^= x >>> 13; return x >>> 0;
    };
    const size = CONFIG.sectionSize;
    const before = section => {
      const first = mix(section) % size;
      return [first, (first + 2 + mix(section * 7919 + 11) % (size - 3)) % size];
    };
    equal(CONFIG.bubblePerChapter, 2, 'this comparison only holds at the shipped setting');
    for (let section = 0; section < 200; section++){
      equal(Levels.bubbleSlots(section), before(section), `chapter ${section} moved`);
    }
  });

  it('honours the setting, which is the whole reason it is a setting', () => {
    const size = CONFIG.sectionSize;
    const apart = (a, b) => { const d = Math.abs(a - b); return Math.min(d, size - d); };
    const was = CONFIG.bubblePerChapter;
    try {
      for (const want of [0, 1, 3, 4]){
        CONFIG.bubblePerChapter = want;
        for (let section = 0; section < 60; section++){
          const slots = Levels.bubbleSlots(section);
          equal(slots.length, want, `chapter ${section} gave ${slots.length} slots, not ${want}`);
          equal(new Set(slots).size, slots.length, `chapter ${section} placed two in one spot`);
          for (const s of slots) assert(s >= 0 && s < size, `slot ${s} is off the chapter`);
          for (let i = 0; i < slots.length; i++){
            for (let j = i + 1; j < slots.length; j++){
              assert(apart(slots[i], slots[j]) >= 2,
                `chapter ${section} put ${slots[i]} and ${slots[j]} back to back`);
            }
          }
        }
      }
    } finally {
      CONFIG.bubblePerChapter = was;
    }
  });

  it('does not disturb the pour game difficulty curve', () => {
    /* The reason no par is recomputed and no ordering regenerated by turning
       this on: ORDER is monotone in measured difficulty, and a subsequence of a
       sorted sequence is still sorted. Asserted against the measured numbers
       rather than argued from first principles. */
    const { levels } = JSON.parse(read('docs/difficulty.json'));
    const measured = levels.filter(r => typeof r.hard === 'number');
    assert(measured.length > 100, 'the difficulty table is too small to mean anything');
    const outOfOrder = xs => {
      let n = 0;
      for (let i = 1; i < xs.length; i++) if (xs[i].hard < xs[i - 1].hard) n++;
      return n;
    };
    equal(outOfOrder(measured), 0, 'the shipped order is not monotone to begin with');
    equal(outOfOrder(measured.filter(r => !Levels.isBubble(r.level))), 0,
      'removing every fifth level broke the pour curve, so the ordering would need regenerating');
  });
});
