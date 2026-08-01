import { describe, it, assert, equal, loadPure } from './helpers.mjs';

const { Progress, CONFIG } = loadPure();
const fresh = () => Progress.createProgress(Progress.memoryStorage());
/* a store already holding `save`, as a returning player's browser would */
function stored(save){
  const store = Progress.memoryStorage();
  store.setItem(Progress.SAVE_KEY, JSON.stringify(save));
  return Progress.createProgress(store);
}

describe('progress', () => {
  it('starts with only the first level open', () => {
    const p = fresh();
    equal(p.unlocked, 1);
    assert(p.isUnlocked(1), 'level 1 is playable');
    assert(!p.isUnlocked(2), 'level 2 is not');
    equal(p.totalStars(), 0);
  });
  it('clearing a level opens the next one', () => {
    const p = fresh();
    p.complete(1, 12, 2);
    equal(p.unlocked, 2);
    equal(p.starsFor(1), 2);
    equal(p.bestFor(1), 12);
  });
  it('replaying can raise a score but never lower it', () => {
    const p = fresh();
    p.complete(1, 12, 2);
    p.complete(1, 20, 1);
    equal(p.starsFor(1), 2, 'a worse run must not take stars away');
    equal(p.bestFor(1), 12, 'a worse run must not spoil the best');
    const res = p.complete(1, 9, 3);
    equal(p.starsFor(1), 3);
    equal(p.bestFor(1), 9);
    assert(res.improvedStars && res.improvedBest, 'the improvement should be reported');
  });
  it('a save from an older layout keeps its purse but not its board records', () => {
    const p = stored({
      layout: CONFIG.layout - 1, unlocked: 40, gold: 210,
      stars: { 1: 3, 39: 2 }, best: { 1: 12, 39: 44 }, pars: { 1: 12 },
      claimed: { 1: true, 39: true }, sound: false
    });
    equal(p.unlocked, 40, 'how far they got does not depend on which board it was');
    equal(p.gold, 210, 'their purse is theirs');
    equal(p.starsFor(1), 0, 'a rating of a board they will not be dealt again means nothing');
    equal(p.bestFor(1), null, 'nor does a best that could now sit below par');
    assert(p.raw.claimed[39], 'first-clear stays paid, so old levels cannot be farmed again');
    equal(p.raw.layout, CONFIG.layout, 'and the save is stamped, so this happens once');
  });
  it('treats a save with no layout stamp as an old one', () => {
    /* the stamp was added after the game was already being played, so the very
       saves most likely to hold ratings for boards that have since moved are
       exactly the ones with no stamp to compare */
    const p = stored({ unlocked: 12, gold: 140, stars: { 1: 3, 5: 2 }, best: { 1: 12 }, claimed: { 1: true } });
    equal(p.starsFor(1), 0, 'a rating from before the stamp is a rating of another board');
    equal(p.bestFor(1), null);
    equal(p.unlocked, 12, 'but how far they got still stands');
    equal(p.gold, 140, 'and so does the purse');
    assert(p.raw.claimed[1], 'and first-clear stays paid');
    equal(p.raw.layout, CONFIG.layout, 'and it is stamped now, so this happens once');
  });
  it('a save on the current layout is left alone', () => {
    const p = stored({ layout: CONFIG.layout, unlocked: 5, stars: { 1: 3 }, best: { 1: 12 } });
    equal(p.starsFor(1), 3);
    equal(p.bestFor(1), 12);
  });
  it('stops at the last graded level, because past it nothing can be scored', () => {
    /* rate() awards full marks when it has no par to measure against, so a level
       past the par table could be neither failed nor played badly, and would pay
       out every time. The frontier must not reach one. */
    const last = fresh().lastLevel;
    assert(Number.isInteger(last) && last > 0, 'the graded range must be a real level number');
    const p = stored({ layout: CONFIG.layout, unlocked: last, gold: 500 });
    p.complete(last, 10, 3);
    equal(p.unlocked, last, 'clearing the last level must not open one past it');
    assert(!p.isUnlocked(last + 1), 'there is nothing past the last level to unlock');
    equal(p.buyUnlock(last, 10), false, 'and it must not be purchasable either');
    equal(p.gold, 500 + CONFIG.economy.starGold[3] + CONFIG.economy.firstClear,
      'a refused purchase must not take the gold');
  });
  it('pulls a save from beyond the graded range back to it', () => {
    /* a save written when the table was longer, or hand-edited */
    const p = stored({ layout: CONFIG.layout, unlocked: 99999 });
    equal(p.unlocked, p.lastLevel);
    assert(!p.isUnlocked(p.lastLevel + 1));
  });
  it('replaying an old level does not roll the frontier back', () => {
    const p = fresh();
    p.complete(1, 10, 3);
    p.complete(2, 10, 3);
    p.complete(3, 10, 3);
    equal(p.unlocked, 4);
    p.complete(1, 8, 3);
    equal(p.unlocked, 4, 'the frontier must stay put');
  });
  it('totals stars across levels', () => {
    const p = fresh();
    p.complete(1, 1, 3);
    p.complete(2, 1, 2);
    p.complete(3, 1, 1);
    equal(p.totalStars(), 6);
  });
  it('remembers an exact par and ignores an estimate', () => {
    const p = fresh();
    p.rememberPar(1, 11, true);
    equal(p.parFor(1), 11);
    p.rememberPar(2, 30, false);
    equal(p.parFor(2), null, 'estimates must not be cached as fact');
  });
  it('survives a round trip through storage', () => {
    const store = Progress.memoryStorage();
    const a = Progress.createProgress(store);
    a.complete(1, 9, 3);
    a.complete(2, 14, 2);
    a.setSound(false);
    const b = Progress.createProgress(store);
    equal(b.unlocked, 3);
    equal(b.starsFor(1), 3);
    equal(b.bestFor(2), 14);
    equal(b.sound, false);
  });
  it('recovers from a corrupted save', () => {
    const store = Progress.memoryStorage();
    store.setItem(Progress.SAVE_KEY, '{not json at all');
    const p = Progress.createProgress(store);
    equal(p.unlocked, 1, 'should fall back to a blank save');
  });
  it('works when storage throws on every call', () => {
    const hostile = {
      getItem(){ throw new Error('denied'); },
      setItem(){ throw new Error('denied'); },
      removeItem(){ throw new Error('denied'); }
    };
    const p = Progress.createProgress(hostile);
    p.complete(1, 10, 3);
    equal(p.unlocked, 2, 'the session should still work in memory');
  });
});
