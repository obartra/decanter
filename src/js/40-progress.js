/* Saved progress. The storage backend is injected so tests can hand it a fake
   and sandboxed previews can fall back to memory when localStorage throws. */
const SAVE_KEY = 'decanter.save.v1';

function memoryStorage(){
  const mem = new Map();
  return {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: k => { mem.delete(k); }
  };
}
function safeStorage(){
  try {
    const probe = '__decanter_probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch (e) {
    return memoryStorage();
  }
}
/* Where the graded game ends. Published by the par table, because that is what
   decides it: a level with no par cannot be scored, and rate() awards full marks
   when it has no bar to measure against. Letting progression run past the table
   would hand out a level that can neither be failed nor played badly, and pay for
   it every time. Falls back to a huge number so a missing table cannot silently
   lock the game to level one. */
const lastLevel = () => (Number.isInteger(globalThis.LAST_LEVEL) ? globalThis.LAST_LEVEL : Infinity);

function blank(){
  return {
    version:1, layout: CONFIG.layout, unlocked:1, stars:{}, best:{}, pars:{}, sound:true,
    gold: CONFIG.economy.startingGold,
    /* levels whose one-time first-clear bonus has already been paid */
    claimed:{},
    /* the day the last daily draught was drawn, as a local YYYY-MM-DD */
    dailyOn: null
  };
}
function createProgress(storage){
  const store = storage || safeStorage();
  let state = blank();
  try {
    const raw = store.getItem(SAVE_KEY);
    if (raw){
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') state = Object.assign(blank(), parsed);
    }
  } catch (e) { state = blank(); }
  if (!Number.isInteger(state.unlocked) || state.unlocked < 1) state.unlocked = 1;
  if (state.unlocked > lastLevel()) state.unlocked = lastLevel();
  /* a save written before gold existed still deserves a starting purse */
  if (!Number.isFinite(state.gold) || state.gold < 0) state.gold = CONFIG.economy.startingGold;
  if (!state.claimed || typeof state.claimed !== 'object') state.claimed = {};
  /* The boards moved, so a rating recorded against a level number is a rating of
     a board this save will never be dealt again, and a best move count could sit
     below the new par and read as impossible. Those go. Gold, how far the player
     got, and which first-clear bonuses were already paid all survive, because
     none of them describes a particular board. */
  if (state.layout !== CONFIG.layout){
    state.layout = CONFIG.layout;
    state.stars = {}; state.best = {}; state.pars = {};
  }

  function save(){
    try { store.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  return {
    get raw(){ return state; },
    get unlocked(){ return state.unlocked; },
    get sound(){ return state.sound !== false; },
    setSound(on){ state.sound = !!on; save(); },
    starsFor: level => state.stars[level] || 0,
    bestFor: level => (level in state.best ? state.best[level] : null),
    parFor: level => (level in state.pars ? state.pars[level] : null),
    rememberPar(level, par, exact){
      if (exact && Number.isInteger(par)) { state.pars[level] = par; save(); }
    },
    totalStars(){
      return Object.values(state.stars).reduce((a, b) => a + b, 0);
    },
    isUnlocked: level => level <= state.unlocked && level <= lastLevel(),
    get lastLevel(){ return lastLevel(); },
    /* the graded game is over, and there is nothing further to open */
    get finished(){ return state.unlocked >= lastLevel() && (state.stars[lastLevel()] || 0) > 0; },

    /* ---- gold ---- */
    get gold(){ return state.gold; },
    /* spending is all-or-nothing: a partial debit would leave the player paying
       for a rescue they did not get */
    spend(cost){
      if (!Number.isInteger(cost) || cost < 0 || state.gold < cost) return false;
      state.gold -= cost;
      save();
      return true;
    },
    canAfford: cost => state.gold >= cost,
    /* the draught is once per local day, and the day is passed in so this stays
       testable and so a clock that jumps cannot pay twice for the same date */
    dailyReady: today => state.dailyOn !== today,
    claimDaily(today){
      if (state.dailyOn === today) return 0;
      state.dailyOn = today;
      state.gold += CONFIG.economy.daily;
      save();
      return CONFIG.economy.daily;
    },

    /* Paying past a board opens the next one and nothing else. No stars, no
       best, and the first-clear bonus is left unclaimed, so coming back later
       and actually beating it still pays what it always would have. */
    buyUnlock(level, cost){
      if (level >= lastLevel()) return false;         /* nothing past the last one to open */
      if (state.unlocked > level) return false;       /* already past it */
      if (!Number.isInteger(cost) || cost < 0 || state.gold < cost) return false;
      state.gold -= cost;
      state.unlocked = level + 1;
      save();
      return true;
    },

    /* replaying a level can raise a score but never lower it. Star gold is paid
       every time, the first-clear bonus only ever once, which is what keeps a
       cleared level from being farmable. */
    complete(level, moves, stars){
      /* A failed run sorted the bottles but not well enough to count, so it
         banks nothing: no gold, no best, no first-clear bonus, and the next
         level stays shut. Nothing is taken away either, so an earlier clear of
         the same level keeps whatever it earned. */
      if (stars <= 0){
        return { failed: true, improvedStars: false, improvedBest: false,
                 firstClear: false, starGold: 0, bonus: 0, earned: 0 };
      }
      const prevStars = state.stars[level] || 0;
      if (stars > prevStars) state.stars[level] = stars;
      const prevBest = level in state.best ? state.best[level] : Infinity;
      if (moves < prevBest) state.best[level] = moves;
      if (level >= state.unlocked) state.unlocked = Math.min(level + 1, lastLevel());

      const firstClear = !state.claimed[level];
      const starGold = CONFIG.economy.starGold[stars] || 0;
      const bonus = firstClear ? CONFIG.economy.firstClear : 0;
      state.claimed[level] = true;
      state.gold += starGold + bonus;

      save();
      return {
        failed: false,
        improvedStars: stars > prevStars,
        improvedBest: moves < prevBest,
        firstClear,
        starGold,
        bonus,
        earned: starGold + bonus
      };
    },
    reset(){ state = blank(); save(); }
  };
}
globalThis.Progress = { SAVE_KEY, createProgress, memoryStorage, blank };
