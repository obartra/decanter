import { describe, it, assert, equal, loadPure } from './helpers.mjs';

const { Progress } = loadPure();
const fresh = () => Progress.createProgress(Progress.memoryStorage());

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
