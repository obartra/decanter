/* The blast: the one tool that reaches into the laws of the game.

   Split into its own file rather than folded into rules.test.mjs, because the
   interesting cases are not about pouring at all. They are about the board a
   blast leaves behind, and the ones worth asserting are precisely the ones
   nobody would reach by playing: a colour stranded across two bottles, a target
   that would end the run, a shelf that solves itself the moment a bottle comes
   off it. */
import { describe, it, assert, equal, loadPure, loadBubble } from './helpers.mjs';

const { Rules, Chapters, Panel, CONFIG } = loadPure();
const E = CONFIG.economy;
const S = list => new Set(list);

describe('spilling', () => {
  it('leaves the unblasted rule exactly as it was', () => {
    /* The fast path is the old check, byte for byte, and every board the
       generator and the solver ever see goes through it. */
    equal(Rules.isSolved([[0,0,0,0],[1,1,1,1],[]]), true);
    equal(Rules.isSolved([[0,0,0],[1,1,1,1]]), false, 'three of a colour is not four');
    equal(Rules.isSolved([[0,1],[1,0]]), false);
    /* an empty spill set must not quietly become a different game */
    equal(Rules.isSolved([[0,0,0]], S([])), false, 'nothing spilled is nothing changed');
  });

  it('stops asking a spilled colour for four', () => {
    equal(Rules.isSolved([[0,0,0],[]], S([0])), true, 'three reds, and red is all there is');
    equal(Rules.isSolved([[0],[]], S([0])), true, 'one is enough once four is off the table');
  });

  it('still makes a spilled colour be gathered', () => {
    /* The clause four units used to imply for free. Two uniform bottles of the
       same spilled colour are each "one colour all the way down" and neither
       will ever be full, so a per-bottle test alone calls this sorted while the
       player is plainly looking at red in two places. */
    equal(Rules.isSolved([[0,0],[0]], S([0])), false, 'red in two bottles is not sorted');
    equal(Rules.isSolved([[0,0,0],[]], S([0])), true, 'the same red, gathered');
  });

  it('holds every colour the blast did not touch to four', () => {
    equal(Rules.isSolved([[0,0,0,0],[1,1,1]], S([0])), false, 'blue was never spilled');
    equal(Rules.isSolved([[0,0,0,0],[1,1]], S([1])), true, 'but this one was');
    equal(Rules.isSolved([[0,0],[1,1]], S([0, 1])), true, 'both spilled, both gathered');
  });

  it('will not call a mixed bottle finished, whatever spilled', () => {
    /* The one thing spilling must never do is loosen what a bottle is. */
    equal(Rules.isSolved([[0,1]], S([0, 1])), false);
    equal(Rules.isSolved([[0,0,1,1],[]], S([0, 1])), false);
  });
});

describe('blasting a bottle', () => {
  it('takes the glass as well as what was in it', () => {
    const before = [[0,1,0,1],[1,0,1,0],[]];
    const after = Rules.blast(before, 1);
    equal(after.tubes, [[0,1,0,1],[]], 'the shelf is one shorter');
    equal(after.spilled.slice().sort(), [0,1], 'both colours it held are spilled');
    equal(before, [[0,1,0,1],[1,0,1,0],[]], 'and the board it was asked about is untouched');
  });

  it('spills each colour once, however many units it held', () => {
    equal(Rules.blast([[2,2,2,2]], 0).spilled, [2]);
    equal(Rules.blast([[3]], 0).spilled, [3]);
  });

  it('refuses a target that could only hurt', () => {
    /* Sixty five gold for an outcome worse than not pressing it is not a price,
       it is a trap. An empty bottle spills nothing and costs a slot; a finished
       one undoes work already done. */
    const shelf = [[0,0,0,0],[1,2,1,2],[2,1,2,1],[]];
    const targets = Rules.blastTargets(shelf, 0, 30, true, null);
    assert(!targets.includes(0), 'a finished bottle is not a target');
    assert(!targets.includes(3), 'nor an empty one');
    equal(targets, [1,2], 'the two that are actually in the way');
  });

  it('refuses a target that would end the run', () => {
    /* A board with one empty bottle holding the whole thing together: take it
       away and there is no legal pour left anywhere. Being handed that by the
       rescue you just paid for is the worst version of this feature there is. */
    const shelf = [[0,1,0,1],[1,0,1,0],[2,3,2,3],[3,2,3,2],[]];
    equal(Rules.lostBecause(shelf, 0, 40, true), null, 'alive while the empty is there');
    const without = Rules.blast(shelf, 4).tubes;
    equal(Rules.lostBecause(without, 0, 40, true), 'stuck', 'and dead without it');
    assert(!Rules.blastTargets(shelf, 0, 40, true, null).includes(4),
      'so it must not be offered');
  });

  it('keeps a target that finishes the level', () => {
    /* Winning is not losing. Blowing up the last mixed bottle is a legitimate
       way to end a board, and the check must not read "the run is over" as a
       reason to withhold it. */
    const shelf = [[0,0,0,0],[1,1,1,1],[2,3]];
    const targets = Rules.blastTargets(shelf, 5, 30, true, null);
    equal(targets, [2]);
    const after = Rules.blast(shelf, 2);
    assert(Rules.isSolved(after.tubes, S(after.spilled)), 'and it does finish it');
  });

  it('answers short, and never pretends to answer over', () => {
    /* The three endings are not equally rescuable, and the check is what stops
       the panel selling the wrong one. */
    const shelf = [[0,1,0,1],[1,0,1,0],[2,2],[2,2],[]];
    equal(Rules.minPours(shelf), 7, 'seven pours of work on this shelf');

    /* Four pours in against a par of six leaves five, which is less work than
       the board still needs. Lost, and lost with pours still on the clock. */
    equal(Rules.lostBecause(shelf, 4, 6, true), 'short');
    assert(Rules.blastTargets(shelf, 4, 6, true, null).length > 0,
      'a blast lowers the work left, so short is answerable');

    /* Spent pours are spent, and nothing on the shelf gives one back. */
    equal(Rules.lostBecause(shelf, 9, 6, true), 'over');
    equal(Rules.blastTargets(shelf, 9, 6, true, null), [],
      'with the count run out there is nothing a blast can do');
  });

  it('carries earlier spills into the question it asks', () => {
    /* A run may only blast once, but the spilled set from that blast has to
       reach every later judgement or the board is graded by the old law. */
    const shelf = [[0,0,0],[1,1,1,1],[]];
    equal(Rules.isSolved(shelf), false, 'by the old law red is three short');
    equal(Rules.isSolved(shelf, S([0])), true, 'by the law a spill leaves behind it is done');
    /* And the ending has to agree, because that is the judgement which would
       otherwise keep a finished run running until the count ran out. */
    equal(Rules.lostBecause(shelf, 13, 10, true), 'over', 'unspilled, the count runs out on it');
    equal(Rules.lostBecause(shelf, 13, 10, true, S([0])), null, 'spilled, it is simply finished');
  });
});

describe('what a blast costs', () => {
  it('caps the run at two stars, through the same flag as a vessel', () => {
    equal(Rules.rate(11, 11, true, true), 2, 'a perfect run on an eased board is two');
    equal(Rules.rate(11, 11, true, false), 3, 'and three on the board par describes');
    equal(Rules.rate(13, 11, true, true), 1, 'the cap is a ceiling, not a penalty');
    equal(Rules.rate(50, 59, false, true), 2, 'an unknown par does not buy the third back');
  });

  it('is dearer than a vessel', () => {
    assert(E.blast > E.vessel, `a blast at ${E.blast} must cost more than a vessel at ${E.vessel}`);
  });

  it('is affordable on an opening purse, and only just', () => {
    assert(E.startingGold >= E.blast, 'an opening purse can buy one');
    assert(E.startingGold < E.blast * 2, 'but never two');
  });

  it('lets an opening purse carry the vessel or the blast, never both', () => {
    /* The whole reason for the number. Which rescue you can take into a board is
       a decision rather than a shopping list. */
    assert(E.startingGold - E.vessel < E.blast, 'a vessel spends the blast out of reach');
    assert(E.startingGold - E.blast < E.vessel, 'and a blast spends the vessel out of reach');
  });

  it('prices it at four to six well-played new levels', () => {
    const perGoodLevel = E.starGold[3] + E.firstClear;
    const levels = E.blast / perGoodLevel;
    assert(levels > 4 && levels < 6, `a blast costs ${levels.toFixed(1)} good levels`);
  });

  it('stays under the figure the economy loses its pressure at', () => {
    /* 04-economy.md: above roughly 150 there is no tension left. A rescue priced
       above that is one nobody can afford by playing. */
    assert(E.blast < 150, 'a price nobody reaches is not a price');
  });
});

describe('where the blast is handed over', () => {
  it('arrives in a chapter, like every other tool', () => {
    const grants = [];
    for (let s = 0; s < Chapters.count; s++) grants.push(Chapters.at(s).grant);
    assert(grants.includes('blast'), 'a tool with no chapter behind it would be the first');
  });

  it('is not held by anyone who has not reached it', () => {
    const chapter = [...Array(Chapters.count).keys()].find(s => Chapters.at(s).grant === 'blast');
    assert(chapter > 0, 'not in the opening chapter');
    equal(Chapters.perksFor(chapter - 1).blast, false, 'withheld the chapter before');
    equal(Chapters.perksFor(chapter).blast, true, 'granted at it');
    equal(Chapters.perksFor(chapter + 5).blast, true, 'and kept afterwards');
  });

  it('gives the chapter it arrives in a name of its own', () => {
    const chapter = [...Array(Chapters.count).keys()].find(s => Chapters.at(s).grant === 'blast');
    assert(chapter < CONFIG.sectionNames.length,
      'a chapter that hands something over must not be called Reserve');
    assert(chapter < CONFIG.sectionTints.length,
      'and must not borrow another chapter tint by wrapping');
  });

  it('leaves the earlier chapters handing over what they always did', () => {
    const p = Chapters.perksFor(0);
    equal(p.undo, true);
    equal(p.hint, false);
    equal(p.vessel, false);
    equal(p.blast, false);
  });
});

describe('offering a blast on the panel', () => {
  /* A failed run with the tool granted, unused, and somewhere to use it. Every
     case below is this with one thing taken away. */
  const base = {
    level: 40, lastLevel: 120, failed: true, stars: 0, nextUnlocked: false,
    canPayFee: true, canPayNext: true, canPaySkip: true, canPayBlast: true,
    blastGranted: true, blastUsed: false, blastTargets: 3,
    improvedStars: false, hadStars: 0, par: 20, parExact: true, moves: 23,
    best: null, totalStars: 24, reason: 'short'
  };
  const decide = over => Panel.decide({ ...base, ...over });

  it('offers it when there is something to rescue', () => {
    equal(decide({}).blastHidden, false);
    equal(decide({}).blastDisabled, false);
  });

  it('says nothing about a blast on a run nobody asked about', () => {
    /* Every caller that predates this passes none of the blast keys, so they
       all arrive undefined. A new field that came out false there would put an
       unpriced button on every panel in the game. */
    const bare = Panel.decide({
      level: 10, lastLevel: 120, failed: true, stars: 0, nextUnlocked: true,
      canPayFee: true, canPayNext: true, canPaySkip: true,
      improvedStars: false, hadStars: 0, par: 20, parExact: true, moves: 23,
      best: null, totalStars: 24
    });
    equal(bare.blastHidden, true, 'absent means hidden, not shown');
  });

  it('withholds it from a run that was not lost', () => {
    equal(decide({ failed: false, stars: 2 }).blastHidden, true,
      'there is nothing to rescue on a board that was finished');
  });

  it('withholds it before the chapter that grants it', () => {
    equal(decide({ blastGranted: false }).blastHidden, true);
  });

  it('withholds a second one in the same run', () => {
    equal(decide({ blastUsed: true }).blastHidden, true);
  });

  it('withholds it when no bottle would bring the board back', () => {
    /* The case that matters most. A run lost with the pours already spent
       cannot be rescued by anything on the shelf, and offering a sixty five
       gold button that changes nothing is worse than offering none. */
    equal(decide({ blastTargets: 0, reason: 'over' }).blastHidden, true);
  });

  it('shows it unpayable rather than hiding it', () => {
    /* Hiding a tool means "not yet"; disabling means "not now". A purse that
       cannot cover it today is the second of those. */
    const p = decide({ canPayBlast: false });
    equal(p.blastHidden, false);
    equal(p.blastDisabled, true);
  });

  it('names it in the standing advice, but never over an empty purse', () => {
    equal(decide({}).hint, 'A blast would leave this board winnable.');
    equal(decide({ canPayBlast: false }).hint, `Clear it in ${20 + CONFIG.stars.one} or fewer.`,
      'an offer nobody can take is not advice');
    equal(decide({ canPayFee: false }).hint, 'Not enough gold. The daily draught is on the map.',
      'somebody who cannot afford another go hears that first');
  });

  it('leaves the other buttons exactly as they were', () => {
    /* Beaten by a board and stuck on one are still both offered. The blast is a
       third way out alongside them, not a replacement for either: it is the
       only one that ends with the level actually beaten. */
    const p = decide({});
    equal(p.retryHidden, false, 'another go is always the first answer');
    equal(p.retryPrimary, true);
    equal(p.nextHidden, true, 'a failed run opens nothing');
    equal(p.skipHidden, false, 'and paying past it is still there');
  });
});

describe('the bomb, in the other game', () => {
  const { BubbleConfig: BC, BubbleGrid: G, BubbleRules: BR, BubbleScore: Sc } = loadBubble();
  const rng = seed => { let s = seed >>> 0 || 1; return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };

  it('keeps its sentinel clear of an empty cell, and out of the palette', () => {
    /* BubbleGrid.EMPTY is -1 and a sentinel equal to it would have the shooter
       dealing holes. And it must never be used as a palette index: PALETTE[-2]
       is undefined, the renderer slices whatever it is handed, and the throw
       escapes draw() before the next frame is asked for — the game stops for
       good with nothing on screen to say why. */
    assert(BC.BOMB !== G.EMPTY, 'a bomb is not an empty cell');
    assert(BC.BOMB < 0, 'and is not an index into anything');
    equal(BC.PALETTE[BC.BOMB % BC.PALETTE.length], undefined,
      'which is exactly why it must never reach the palette');
  });

  it('clears one cell of the lattice, on both parities', () => {
    /* The six that touch depend on the row stagger, and a blast working that
       out for itself would be the third copy of the classic bug of the genre. */
    for (const parity of [0, 1]){
      const b = BR.dealBoard(5, rng(9));
      b.parity = parity;
      const cells = BR.within(b, 3, 4);
      equal(cells.length, 7, `parity ${parity}: the centre and its six`);
      for (const [j, c] of cells){
        assert(Math.abs(j - 3) <= 1, 'nothing further than one row away');
        assert(G.at(b, j, c) !== G.EMPTY, 'and nothing empty in the list');
      }
    }
    /* the two parities pick different diagonals, which is the whole point */
    const flush = BR.dealBoard(5, rng(9)); flush.parity = 0;
    const indented = BR.dealBoard(5, rng(9)); indented.parity = 1;
    assert(JSON.stringify(BR.within(flush, 3, 4)) !== JSON.stringify(BR.within(indented, 3, 4)),
      'a stagger flip must move which cells are hit');
  });

  it('takes fewer at a wall, and nothing from open sky', () => {
    const b = BR.dealBoard(5, rng(3));
    assert(BR.within(b, 0, 0).length < 7, 'a corner has fewer neighbours');
    equal(BR.within(b, 12, 4).length, 0, 'and empty rows have nothing to give');
  });

  it('brings down what it was holding up, like any other clear', () => {
    const b = BR.dealBoard(5, rng(21));
    const before = G.occupied(b).length;
    const res = BR.resolveBlast(b, { j: 3, c: 4 });
    assert(res.matched.length > 0, 'something went');
    equal(G.occupied(b).length, before - res.matched.length - res.cut.length,
      'and the board lost exactly what the two lists say it did');
    for (const cell of res.matched.concat(res.cut))
      equal(cell.length, 3, 'every cell carries the colour it held, for the fall');
  });

  it('caps a run that used one, even a cleared one', () => {
    /* Same flag, same cap, same reason as picking a colour: what a bomb clears
       is nothing the shot chooser could have cleared, so the thresholds it is
       graded against are describing a different game. */
    equal(Sc.stars({ cleared: false, shots: BC.STAR_SHOTS.three, aided: true }), BC.AID_CAP);
    equal(Sc.stars({ cleared: true, shots: 400, aided: true }), BC.AID_CAP,
      'clearing the board does not buy the third star back');
  });

  it('is priced from the same purse as the pour game blast', () => {
    /* The host maps bubble tools onto the pour game's perks and prices, so an
       undo is an undo and a bomb is a blast whichever board is in front of you. */
    assert(Number.isInteger(E.blast) && E.blast > 0, 'a tool with no price rides for free');
  });
});
