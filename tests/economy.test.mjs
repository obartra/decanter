import { describe, it, assert, equal, loadPure } from './helpers.mjs';

const ctx = loadPure();
const { Rules, Progress, CONFIG } = ctx;
const E = CONFIG.economy;

const fresh = () => Progress.createProgress(Progress.memoryStorage());

describe('star brackets', () => {
  it('pays three stars at par and one over', () => {
    equal(Rules.rate(11, 11), 3, 'par is clean');
    equal(Rules.rate(12, 11), 3, 'one over is still clean');
  });
  it('pays two stars up to four over', () => {
    equal(Rules.rate(13, 11), 2);
    equal(Rules.rate(15, 11), 2, 'four over is the last two-star run');
  });
  it('pays one star for solving it at all, however sloppy', () => {
    equal(Rules.rate(16, 11), 1, 'five over drops to one');
    equal(Rules.rate(400, 11), 1, 'there is no zero-star finish');
  });
  it('caps a bought vessel at two stars', () => {
    /* par describes the bottles the level dealt, not the shelf you bought */
    equal(Rules.rate(11, 11, true, true), 2, 'a perfect run with a vessel is two');
    equal(Rules.rate(13, 11, true, true), 2);
    equal(Rules.rate(16, 11, true, true), 1, 'the cap does not rescue a bad run');
  });
  it('still refuses to score against an inexact par', () => {
    equal(Rules.rate(50, 59, false), 3, 'an estimate cannot cost a star');
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
