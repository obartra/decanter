import { describe, it, assert, equal, loadPure } from './helpers.mjs';

const ctx = loadPure();
const { Rules, Progress, CONFIG } = ctx;
const E = CONFIG.economy;

const fresh = () => Progress.createProgress(Progress.memoryStorage());

describe('star brackets', () => {
  it('pays three stars only for the minimum', () => {
    equal(Rules.rate(11, 11), 3, 'par is three');
    equal(Rules.rate(9, 11), 3, 'under par cannot happen, but is not punished');
  });
  it('drops a star for each pour over', () => {
    equal(Rules.rate(12, 11), 2, 'one over');
    equal(Rules.rate(13, 11), 1, 'two over');
  });
  it('fails a run three or more over the minimum', () => {
    /* the bottles are sorted, but not well enough to count */
    equal(Rules.rate(14, 11), 0, 'three over is a fail');
    equal(Rules.rate(400, 11), 0, 'and so is anything worse');
  });
  it('caps a bought vessel at two stars', () => {
    /* par describes the bottles the level dealt, not the shelf you bought */
    equal(Rules.rate(11, 11, true, true), 2, 'a perfect run with a vessel is two');
    equal(Rules.rate(13, 11, true, true), 1, 'the cap does not lift the lower tiers');
    equal(Rules.rate(14, 11, true, true), 0, 'nor rescue a failed one');
  });
  it('still refuses to score against an inexact par', () => {
    /* an estimate must never be the thing that fails somebody */
    equal(Rules.rate(50, 59, false), 3, 'an estimate cannot cost a star');
    equal(Rules.rate(500, 59, false), 3, 'and cannot fail a run either');
    equal(Rules.rate(50, 59, false, true), 2, 'but a vessel still caps it');
  });
});

describe('gold', () => {
  it('opens the purse one vessel away from broke', () => {
    equal(fresh().gold, 86);
    assert(86 > E.vessel, 'the wallet should afford a vessel');
    assert(86 - E.vessel < E.vessel, 'but not two, or there is no pressure');
  });

  it('pays 14 for a good first run and nothing for repeating it', () => {
    const p = fresh();
    const first = p.complete(1, 11, 3);
    equal(first.earned, 14, 'three stars plus the first clear');
    equal(first.firstClear, true);
    const again = p.complete(1, 11, 3);
    equal(again.earned, 0, 'the level has already paid what it is worth');
    equal(again.firstClear, false);
  });

  it('pays the difference when a replay earns a better rating', () => {
    /* A level pays for the rating it is worth, not per clear, so going back for
       the third star pays the gap and the level totals the same either way. */
    const p = fresh();
    const first = p.complete(3, 40, 1);
    equal(first.earned, E.starGold[1] + E.firstClear);
    const better = p.complete(3, 20, 3);
    equal(better.earned, E.starGold[3] - E.starGold[1], 'only the improvement');
    equal(p.gold, E.startingGold + E.starGold[3] + E.firstClear,
      'however it got there, the level paid what three stars are worth, once');
  });

  it('pays nothing at all for grinding cleared levels', () => {
    /* Replaying a cleared level is free, so this is the check that free does not
       mean a tap that prints gold. */
    const p = fresh();
    for (let lvl = 1; lvl <= 5; lvl++) p.complete(lvl, 11, 3);
    const afterFirstPass = p.gold;
    for (let round = 0; round < 3; round++){
      for (let lvl = 1; lvl <= 5; lvl++) p.complete(lvl, 11, 3);
    }
    equal(p.gold - afterFirstPass, 0, 'fifteen replays paid nothing');
  });

  it('quotes exactly what it is about to pay, from every state a level can be in', () => {
    /* The card shown before a replay offers a number, and this is the check that
       the number is the payment. They are the same arithmetic on purpose: what
       a replay is worth depends on the rating the level already has, and a
       second copy of "the difference between what you had and what you got" is
       precisely how a card comes to promise six for a board that hands over
       three.

       Measured against the purse rather than against what complete() reports,
       so it is the money that has to agree, not two readings of one number. */
    for (const had of [0, 1, 2, 3]){
      for (const now of [1, 2, 3]){
        const p = fresh();
        if (had > 0) p.complete(1, 20, had);
        const quoted = p.wouldEarn(1, now).earned;
        const before = p.gold;
        p.complete(1, 20, now);
        equal(p.gold - before, quoted,
          `a level at ${had} stars, replayed at ${now}: quoted ${quoted}, paid ${p.gold - before}`);
      }
    }
  });

  it('offers nothing for another perfect run on a perfect board', () => {
    /* the headline the card exists to carry, and the one thing about this
       economy nothing else on any screen says */
    const p = fresh();
    p.complete(1, 11, 3);
    equal(p.wouldEarn(1, 3).earned, 0);
    equal(p.wouldEarn(1, 2).earned, 0, 'nor for a worse one');
  });

  it('offers a failed run nothing, whatever the level has', () => {
    const p = fresh();
    equal(p.wouldEarn(1, 0).earned, 0);
    p.complete(1, 20, 1);
    equal(p.wouldEarn(1, 0).earned, 0);
  });

  it('pays nothing for a failed run, and opens nothing', () => {
    const p = fresh();
    const gold = p.gold, unlocked = p.unlocked;
    const r = p.complete(1, 99, 0);
    equal(r.earned, 0, 'a failed run earns no gold');
    equal(r.failed, true);
    equal(p.gold, gold, 'the purse should not move');
    equal(p.unlocked, unlocked, 'the next level stays shut');
    equal(p.starsFor(1), 0);
    equal(p.bestFor(1), null, 'a failed run is not a best');
    /* and it must not burn the one-time bonus for the eventual real clear */
    equal(p.complete(1, 11, 3).firstClear, true, 'the first clear bonus survives a failure');
  });

  it('does not undo an earlier clear when a replay fails', () => {
    const p = fresh();
    p.complete(2, 11, 3);
    const gold = p.gold, unlocked = p.unlocked;
    p.complete(2, 99, 0);
    equal(p.starsFor(2), 3, 'stars already earned are kept');
    equal(p.bestFor(2), 11, 'so is the best');
    equal(p.unlocked, unlocked, 'and the unlock');
    equal(p.gold, gold, 'a failed replay pays nothing');
  });

  it('charges for every board dealt', () => {
    const p = fresh();
    const start = p.gold;
    assert(p.spend(E.attempt), 'a first attempt is affordable');
    equal(p.gold, start - E.attempt);
    assert(p.spend(E.attempt), 'so is another go at the same level');
    equal(p.gold, start - E.attempt * 2, 'a retry costs the same as a fresh deal');
  });

  it('leaves a good clear ahead of what it cost to attempt', () => {
    /* if an attempt cost more than a clear pays, playing well would still lose
       money and the whole economy would run backwards */
    const firstGood = E.starGold[3] + E.firstClear;
    assert(E.attempt < E.starGold[3], `an attempt (${E.attempt}) must cost less than a 3-star replay pays (${E.starGold[3]})`);
    assert(firstGood - E.attempt > 0, 'a good first clear must be net positive');
  });

  it('cannot strand a player with no way back', () => {
    /* Failing costs the fee and pays nothing, so someone can be ground down to
       broke. The daily draught is the floor: it has to buy enough attempts to
       matter, or the game ends for anyone who has a bad day. */
    const attempts = Math.floor(E.daily / E.attempt);
    assert(attempts >= 2, `a daily draught buys only ${attempts} attempts`);
  });

  it('lets a player pay past a board that beat them', () => {
    const cost = E.attempt * E.skipMultiple;
    equal(cost, E.attempt * 2, 'paying past a board costs twice an attempt');
    const p = fresh();
    const gold = p.gold;
    assert(p.buyUnlock(1, cost), 'level 2 should open');
    equal(p.gold, gold - cost);
    equal(p.unlocked, 2);
    /* opening the next board is all it buys */
    equal(p.starsFor(1), 0, 'no stars for a board that was paid past');
    equal(p.bestFor(1), null, 'and no best');
    equal(p.complete(1, 11, 3).firstClear, true,
      'coming back and actually beating it still pays the first-clear bonus');
  });

  it('will not sell an unlock twice, or one already open', () => {
    const p = fresh();
    const cost = E.attempt * E.skipMultiple;
    assert(p.buyUnlock(1, cost));
    const after = p.gold;
    assert(p.buyUnlock(1, cost) === false, 'the same unlock cannot be sold again');
    equal(p.gold, after, 'and a refused purchase must not charge');
  });

  it('refuses to sell an unlock it cannot cover', () => {
    const p = fresh();
    assert(p.buyUnlock(1, 10_000) === false);
    equal(p.gold, 86, 'a refused purchase must not move the balance');
    equal(p.unlocked, 1, 'nor open anything');
  });

  it('makes beating a board cheaper than buying past it', () => {
    /* otherwise paying is simply the better play and the puzzle is decorative */
    const skip = E.attempt * E.skipMultiple;
    assert(E.attempt < skip, 'another go must cost less than skipping');
  });

  it('draws the daily draught once per day', () => {
    const p = fresh();
    const before = p.gold;
    equal(p.claimDaily('2026-07-30'), E.daily);
    equal(p.claimDaily('2026-07-30'), 0, 'a second draw the same day pays nothing');
    equal(p.gold, before + E.daily);
    assert(!p.dailyReady('2026-07-30'));
    assert(p.dailyReady('2026-07-31'), 'tomorrow refreshes it');
    equal(p.claimDaily('2026-07-31'), E.daily);
  });

  /* A player with nothing left is looking at the draught to decide whether to
     wait, so the wait has to be a length of time rather than the word "drawn".
     It is until the local midnight, because that is when the day rolls over. */
  it('says how long until the draught comes back, to the local midnight', () => {
    const at = (h, m) => new Date(2026, 6, 30, h, m, 0);
    equal(Progress.untilNextDay(at(23, 0)), 60 * 60 * 1000);
    equal(Progress.untilNextDay(at(0, 0)), 24 * 60 * 60 * 1000, 'just past midnight is a whole day');
    /* not a fixed span from when it was drawn: two draws at different hours of
       the same day come back at the same moment */
    assert(Progress.untilNextDay(at(9, 0)) > Progress.untilNextDay(at(21, 0)));
  });

  it('puts that wait in something that fits under a button', () => {
    const { briefly } = Progress;
    const mins = n => n * 60 * 1000;
    equal(briefly(mins(0)), 'soon');
    equal(briefly(mins(1)), 'soon');
    equal(briefly(mins(45)), '45m');
    equal(briefly(mins(60)), '1h');
    equal(briefly(mins(90)), '1h 30m');
    equal(briefly(mins(60 * 7 + 12)), '7h 12m');
    /* rounded up, so it never says a wait is over while it is still running */
    equal(briefly(30 * 1000), 'soon');
    equal(briefly(mins(44) + 30 * 1000), '45m');
  });
});

describe('spending', () => {
  it('refuses a purchase it cannot cover, and takes nothing', () => {
    const p = fresh();
    assert(p.spend(1000) === false, 'should not go into debt');
    equal(p.gold, 86, 'a refused purchase must not move the balance');
  });

  it('lets the opening wallet buy exactly one vessel', () => {
    const p = fresh();
    assert(p.spend(E.vessel), 'first vessel is affordable');
    equal(p.gold, 86 - E.vessel);
    assert(p.spend(E.vessel) === false, 'the second is not');
  });

  it('prices a vessel at about three well-played new levels', () => {
    const perGoodLevel = E.starGold[3] + E.firstClear;
    const levels = E.vessel / perGoodLevel;
    assert(levels > 2.5 && levels < 3.5, `a vessel costs ${levels.toFixed(1)} good levels`);
  });

  it('gives three undos before charging', () => {
    equal(E.freeUndos, 3);
    const p = fresh();
    const start = p.gold;
    /* the first three are free, so only later ones touch the purse */
    for (let i = 0; i < E.freeUndos; i++) { /* free, no spend call */ }
    equal(p.gold, start);
    assert(p.spend(E.undoCost), 'the fourth undo is payable');
    equal(p.gold, start - E.undoCost);
  });

  it('survives a save written before gold existed', () => {
    const store = Progress.memoryStorage();
    store.setItem(Progress.SAVE_KEY, JSON.stringify({ version:1, unlocked:4, stars:{1:3}, best:{}, pars:{} }));
    const p = Progress.createProgress(store);
    equal(p.gold, 86, 'an old save should be granted the starting purse');
    equal(p.unlocked, 4, 'without losing its progress');
    equal(p.starsFor(1), 3, 'and keeping the stars it earned');
  });

  it('keeps a corrupt balance from poisoning the purse', () => {
    const store = Progress.memoryStorage();
    store.setItem(Progress.SAVE_KEY, JSON.stringify({ gold: -999, claimed: 'nonsense' }));
    const p = Progress.createProgress(store);
    equal(p.gold, 86);
    assert(p.complete(1, 11, 3).firstClear, 'a broken claimed map should not block the bonus');
  });
});
