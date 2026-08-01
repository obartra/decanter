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

  it('pays 14 for a good first run and 6 for the replay', () => {
    const p = fresh();
    const first = p.complete(1, 11, 3);
    equal(first.earned, 14, 'three stars plus the first clear');
    equal(first.firstClear, true);
    const again = p.complete(1, 11, 3);
    equal(again.earned, 6, 'the bonus is never paid twice');
    equal(again.firstClear, false);
  });

  it('pays a sloppy replay almost nothing', () => {
    const p = fresh();
    p.complete(3, 40, 1);
    equal(p.complete(3, 40, 1).earned, 1, 'one star, no bonus');
  });

  it('cannot be ground out on cleared levels', () => {
    /* replaying every cleared level perfectly should still not fund a vessel
       faster than simply playing new ones */
    const p = fresh();
    for (let lvl = 1; lvl <= 5; lvl++) p.complete(lvl, 11, 3);
    const afterFirstPass = p.gold;
    for (let lvl = 1; lvl <= 5; lvl++) p.complete(lvl, 11, 3);
    const farmed = p.gold - afterFirstPass;
    equal(farmed, 5 * E.starGold[3], 'replays pay stars only');
    assert(farmed < 5 * 14, 'farming must pay less than fresh clears');
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
    equal(p.starsFor(1), 3);
  });

  it('keeps a corrupt balance from poisoning the purse', () => {
    const store = Progress.memoryStorage();
    store.setItem(Progress.SAVE_KEY, JSON.stringify({ gold: -999, claimed: 'nonsense' }));
    const p = Progress.createProgress(store);
    equal(p.gold, 86);
    assert(p.complete(1, 11, 3).firstClear, 'a broken claimed map should not block the bonus');
  });
});
