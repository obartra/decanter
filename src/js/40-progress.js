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

/* How long until the local day rolls over and the draught is ready again. The
   draught is once per local calendar day, so the wait is until midnight where
   the player is, not a fixed twenty four hours from when it was drawn. `now` is
   passed in for the same reason `today` is: so this stays testable, and so a
   clock that jumps cannot be argued with. */
function untilNextDay(now){
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, next - now);
}
/* That wait, short enough to sit under a button. A player deciding whether to
   wait needs to know if it is minutes or most of the evening; they do not need
   seconds, and a number that ticks every second on a button nobody is watching
   is only a battery cost. */
function briefly(ms){
  const mins = Math.ceil(ms / 60000);
  if (mins <= 1) return 'soon';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function blank(){
  return {
    version:1, layout: CONFIG.layout, unlocked:1, stars:{}, best:{}, pars:{}, sound:true,
    gold: CONFIG.economy.startingGold,
    /* levels whose one-time first-clear bonus has already been paid */
    claimed:{},
    /* the day the last daily draught was drawn, as a local YYYY-MM-DD */
    dailyOn: null,
    /* chapters whose opening has already been read, so it is shown once */
    seen: {},
    /* What has gone wrong here, kept across reloads. A player who is stuck
       reloads, and everything the trace was holding goes with the page, so the
       counts that answer "has this happened before, and how often" have to
       outlive it. Deliberately counts and one message rather than a log: this
       lives in the player's save, and a save is not a place to grow a diary. */
    diag: { refused: {}, faults: 0, lastFault: '' }
  };
}
function createProgress(storage){
  const store = storage || safeStorage();
  let state = blank();
  try {
    const raw = store.getItem(SAVE_KEY);
    if (raw){
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object'){
        state = Object.assign(blank(), parsed);
        /* A save written before the stamp existed cannot be taken as current.
           blank() carries today's stamp, so merging over it would let a save
           that never had one inherit it and skip the migration below, keeping
           ratings for boards it will never be dealt again. */
        if (!Number.isInteger(parsed.layout)) state.layout = 0;
      }
    }
  } catch (e) { state = blank(); }
  if (!Number.isInteger(state.unlocked) || state.unlocked < 1) state.unlocked = 1;
  if (state.unlocked > lastLevel()) state.unlocked = lastLevel();
  /* a save written before gold existed still deserves a starting purse */
  if (!Number.isFinite(state.gold) || state.gold < 0) state.gold = CONFIG.economy.startingGold;
  if (!state.claimed || typeof state.claimed !== 'object') state.claimed = {};
  if (!state.seen || typeof state.seen !== 'object') state.seen = {};
  if (!state.diag || typeof state.diag !== 'object') state.diag = blank().diag;
  if (!state.diag.refused || typeof state.diag.refused !== 'object') state.diag.refused = {};
  if (!Number.isInteger(state.diag.faults)) state.diag.faults = 0;
  /* The boards moved. What a player earned stays earned: stars and best move
     counts are theirs, and taking them away to keep a record tidy is a worse
     trade than leaving a best that the new board happens not to allow.

     The cached par does go. It is not something anyone earned, it is a note of
     how few pours a particular board needed, and that board is gone. Keeping it
     would let a level be scored against a bar belonging to a different puzzle. */
  if (state.layout !== CONFIG.layout){
    state.layout = CONFIG.layout;
    state.pars = {};
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
    /* Everything the chapters have handed over by now. Taken from how far the
       player has got rather than from the level in front of them, so going back
       to an early board does not take the tools away again. */
    perks(){ return Chapters.perksFor(Levels.sectionOf(state.unlocked)); },
    /* ---- what has gone wrong ----
       Written straight to the save rather than batched. These are rare by
       definition, and a count that is lost because the page went away is a
       count that was not worth keeping. */
    get diag(){ return state.diag; },
    recordRefusal(kind){
      state.diag.refused[kind] = (state.diag.refused[kind] || 0) + 1;
      save();
    },
    recordFault(message){
      state.diag.faults++;
      state.diag.lastFault = String(message).slice(0, 200);
      save();
    },
    hasSeen: section => !!state.seen[section],
    markSeen(section){
      if (state.seen[section]) return false;
      state.seen[section] = true;
      save();
      return true;
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
    /* Gold from outside the economy: a figure the purse is brought up to, not a
       sum added on top of it.

       That is what lets the word stay in the URL. Adding would stack another
       payment on every reload, so the word had to be spent out of the address
       bar to stop it, and then the trick only worked once. Bringing the purse up
       to a number can be done any number of times and land in the same place, so
       the link keeps working and the reload is free.

       It is a floor rather than an assignment, so it can never take anything
       away: a save already holding more than this keeps it.

       Counted, because a purse nobody earned is a debugging trap otherwise: the
       next report from this player has to be able to say that the number was
       handed over rather than played for. */
    fill(gold){
      if (!Number.isInteger(gold) || gold <= 0) return state.gold;
      state.gold = Math.max(state.gold, gold);
      state.diag.grants = (state.diag.grants || 0) + 1;
      save();
      return state.gold;
    },
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

      /* A level pays for the rating it is worth, not for each time it is
         cleared. Clearing at two stars and coming back for the third pays the
         difference, so the level pays the same in total either way and going
         back for it cannot be turned into an income. Without this, free replays
         would be a tap that prints gold. */
      const worth = n => CONFIG.economy.starGold[n] || 0;
      const firstClear = !state.claimed[level];
      const starGold = Math.max(0, worth(stars) - worth(prevStars));
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
globalThis.Progress = { SAVE_KEY, createProgress, memoryStorage, blank, untilNextDay, briefly };
