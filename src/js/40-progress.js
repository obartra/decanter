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
function blank(){
  return { version:1, unlocked:1, stars:{}, best:{}, pars:{}, sound:true };
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
    isUnlocked: level => level <= state.unlocked,
    /* replaying a level can raise a score but never lower it */
    complete(level, moves, stars){
      const prevStars = state.stars[level] || 0;
      if (stars > prevStars) state.stars[level] = stars;
      const prevBest = level in state.best ? state.best[level] : Infinity;
      if (moves < prevBest) state.best[level] = moves;
      if (level >= state.unlocked) state.unlocked = level + 1;
      save();
      return { improvedStars: stars > prevStars, improvedBest: moves < prevBest };
    },
    reset(){ state = blank(); save(); }
  };
}
globalThis.Progress = { SAVE_KEY, createProgress, memoryStorage, blank };
