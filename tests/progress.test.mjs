import { describe, it, assert, equal, loadPure } from './helpers.mjs';

const { Progress, CONFIG, Levels } = loadPure();
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
  it('a save from an older layout keeps everything it earned', () => {
    /* The boards moved under this save. What the player earned is still theirs:
       taking stars away to keep the record tidy is a worse trade than leaving a
       best the new board happens not to allow. */
    const p = stored({
      layout: CONFIG.layout - 1, unlocked: 40, gold: 210,
      stars: { 1: 3, 39: 2 }, best: { 1: 12, 39: 44 }, pars: { 1: 12 },
      claimed: { 1: true, 39: true }, sound: false
    });
    equal(p.unlocked, 40, 'how far they got is the thing that must not be lost');
    equal(p.gold, 210, 'their purse is theirs');
    equal(p.starsFor(1), 3, 'and so are their stars');
    equal(p.bestFor(1), 12, 'and their best');
    assert(p.raw.claimed[39], 'first-clear stays paid, so old levels cannot be farmed again');
    equal(p.parFor(1), null, 'but a par cached for a board that is gone would score the wrong bar');
    equal(p.raw.layout, CONFIG.layout, 'and the save is stamped, so this happens once');
  });
  it('drops the ending counts when the boards move, and keeps them when they do not', () => {
    /* The counts exist to be compared against the measured difficulty of a
       particular board. Carried across a layout bump they would answer that
       question with runs played on a puzzle that no longer exists, which is
       worse than having no answer. */
    const moved = stored({
      layout: CONFIG.layout - 1, unlocked: 20,
      diag: { refused: { undo: 2 }, faults: 0, lastFault: '', endings: { 19: { stuck: 4 } } }
    });
    equal(moved.diag.endings, {}, 'counts against boards that are gone would poison the comparison');
    equal(moved.diag.refused, { undo: 2 }, 'a refusal is about the game, not about a board, so it stays');

    const same = stored({
      layout: CONFIG.layout, unlocked: 20,
      diag: { refused: {}, faults: 0, lastFault: '', endings: { 19: { stuck: 4 } } }
    });
    equal(same.diag.endings, { 19: { stuck: 4 } }, 'the same boards keep their counts');
  });
  it('counts how a run ended, per level and per reason', () => {
    const p = stored({ layout: CONFIG.layout, unlocked: 20 });
    p.recordEnding(19, 'stuck');
    p.recordEnding(19, 'stuck');
    p.recordEnding(19, 'cleared');
    p.recordEnding(20, 'short');
    equal(p.diag.endings, { 19: { stuck: 2, cleared: 1 }, 20: { short: 1 } });
  });
  it('refuses an ending it cannot file, rather than growing a key for it', () => {
    /* Reached straight from the run, so a level that is somehow not a level must
       not become a key in a save that is then written out forever. */
    const p = stored({ layout: CONFIG.layout, unlocked: 20 });
    for (const bad of [[null, 'stuck'], [0, 'stuck'], ['19', 'stuck'], [19, null], [19, '']])
      p.recordEnding(bad[0], bad[1]);
    equal(p.diag.endings, {}, 'a bad ending was filed anyway');
  });
  it('survives a save whose ending counts are the wrong shape', () => {
    /* Same reasoning as stars and best: the save is the one input this file does
       not control, and a null here would throw during boot. */
    for (const shape of [null, 'nope', 42, []]){
      const p = stored({ layout: CONFIG.layout, diag: { refused: {}, faults: 0, lastFault: '', endings: shape } });
      equal(p.diag.endings, {}, `endings as ${JSON.stringify(shape)} should have been repaired`);
      p.recordEnding(3, 'over');
      equal(p.diag.endings, { 3: { over: 1 } }, 'and should work afterwards');
    }
  });
  it('treats a save with no layout stamp as an old one', () => {
    /* the stamp was added after the game was already being played, so a save
       without one is the likeliest to be holding a par for a board that moved */
    const p = stored({ unlocked: 12, gold: 140, stars: { 1: 3 }, best: { 1: 12 },
                       pars: { 1: 9 }, claimed: { 1: true } });
    equal(p.parFor(1), null, 'a par from before the stamp belongs to another board');
    equal(p.starsFor(1), 3, 'the stars do not');
    equal(p.bestFor(1), 12);
    equal(p.unlocked, 12, 'and how far they got still stands');
    equal(p.gold, 140);
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

describe('best compares in the direction the level scores', () => {

  it('keeps the fewest pours on a pour level', () => {
    const p = fresh();
    p.complete(aPourLevel, 30, 3);
    equal(p.bestFor(aPourLevel), 30);
    p.complete(aPourLevel, 22, 3);
    equal(p.bestFor(aPourLevel), 22, 'a shorter run is the better one here');
    const worse = p.complete(aPourLevel, 40, 3);
    equal(p.bestFor(aPourLevel), 22, 'a longer run must not overwrite it');
    equal(worse.improvedBest, false);
  });

  /* asked for rather than hardcoded, so moving which levels are bubble cannot
     quietly turn this into a second test of the pour direction */
  const aBubbleLevel = [...Array(120)].map((_, i) => i + 1).find(Levels.isBubble);
  const aPourLevel = [...Array(120)].map((_, i) => i + 1).find(l => !Levels.isBubble(l) && l > 1);

  it('keeps the longest run on a bubble level', () => {
    /* The trap: both are called "best" and they compare opposite ways. Getting
       this backwards records the worst run of every bubble level forever and
       nothing about the save looks wrong. */
    const p = fresh();
    assert(aBubbleLevel, 'no bubble level exists, so this proves nothing');
    p.complete(aBubbleLevel, 30, 1);
    equal(p.bestFor(aBubbleLevel), 30);
    const better = p.complete(aBubbleLevel, 88, 2);
    equal(p.bestFor(aBubbleLevel), 88, 'a longer run is the better one here');
    equal(better.improvedBest, true);
    const worse = p.complete(aBubbleLevel, 40, 1);
    equal(p.bestFor(aBubbleLevel), 88, 'a shorter run must not overwrite it');
    equal(worse.improvedBest, false);
  });

  it('records a first run as the best either way', () => {
    const p = fresh();
    equal(p.complete(aPourLevel, 25, 3).improvedBest, true);
    equal(p.complete(aBubbleLevel, 25, 3).improvedBest, true);
    equal(p.bestFor(aPourLevel), 25);
    equal(p.bestFor(aBubbleLevel), 25);
  });
});

/* A save is the one input this game does not control. It sits on a disk across
   versions, it goes through migrations, and browsers do lose bytes out of
   localStorage — so every field has to survive arriving as the wrong thing.

   The consequence is worse here than anywhere else in the project. Reading the
   save happens during boot, before anything is drawn, so a throw is a blank
   screen with no button on it and nothing saying why. Every other failure a
   player can walk away from and come back to; this one they cannot. */
describe('a save that arrived broken', () => {
  const from = raw => {
    const store = Progress.memoryStorage();
    store.setItem(Progress.SAVE_KEY, typeof raw === 'string' ? raw : JSON.stringify(raw));
    return Progress.createProgress(store);
  };

  /* `stars`, `best` and `pars` were the three not guarded. They are older than
     `claimed`, `seen` and `diag`, and they were trusted, which held for exactly
     as long as every save came from this file. A null `stars` made `starsFor`
     read `null[1]` at boot. Found by the browser suite fuzzing a real save field
     by field; it took one run. */
  it('survives every record of what was earned arriving as the wrong thing', () => {
    for (const key of ['stars', 'best', 'pars', 'claimed', 'seen']){
      for (const wrong of [null, 0, -1, '', 'nope', true, false, [], [1, 2, 3]]){
        const p = from({ version: 1, unlocked: 5, gold: 40, [key]: wrong });
        equal(p.starsFor(3), 0, `${key} as ${JSON.stringify(wrong)} broke starsFor`);
        equal(p.bestFor(3), null, `${key} as ${JSON.stringify(wrong)} broke bestFor`);
        equal(p.parFor(3), null, `${key} as ${JSON.stringify(wrong)} broke parFor`);
        assert(Number.isInteger(p.unlocked) && p.unlocked >= 1, `${key} as ${JSON.stringify(wrong)}`);
      }
    }
  });

  it('survives the save not being an object at all', () => {
    for (const raw of ['nonsense', '7', '[1,2,3]', 'null', '{', '']){
      const p = from(raw);
      assert(Number.isInteger(p.unlocked) && p.unlocked >= 1, `${raw} did not come back as a game`);
      assert(Number.isFinite(p.gold) && p.gold >= 0, `${raw} came back with ${p.gold} gold`);
      equal(p.starsFor(1), 0);
    }
  });

  /* An array is the shape that gets past a `typeof x === 'object'` guard, which
     is why it is asked for by name rather than left to the list above. */
  it('does not mistake an array for a record', () => {
    const p = from({ version: 1, unlocked: 5, gold: 40, stars: [3, 2, 1] });
    equal(p.starsFor(0), 0, 'an array was read as a map of levels to stars');
    assert(!Array.isArray(p.raw.stars), 'the array was kept');
  });
});
