/* Saved progress. The storage backend is injected so tests can hand it a fake
   and sandboxed previews can fall back to memory when localStorage throws. */
import { CONFIG } from './00-config.js';
import { Levels } from './30-levels.js';
import { LAST_LEVEL } from './35-pars.js';
import { Chapters } from './36-chapters.js';

export const Progress = (() => {
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
  const lastLevel = () => (Number.isInteger(LAST_LEVEL) ? LAST_LEVEL : Infinity);

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
      /* chapters whose door has been got through, keyed by chapter number. A
         door is opened once and stays open: it is a way in, not a toll. */
      doors: {},
      /* What has gone wrong here, kept across reloads. A player who is stuck
         reloads, and everything the trace was holding goes with the page, so the
         counts that answer "has this happened before, and how often" have to
         outlive it. Deliberately counts and one message rather than a log: this
         lives in the player's save, and a save is not a place to grow a diary. */
      diag: { refused: {}, faults: 0, lastFault: '', endings: {} }
    };
  }
  /* No rise in the purse skips this. The cap exists because the beta word fills
     the purse to it, and a player who then keeps playing would climb past the
     figure they were given — which is both the joke wearing off and an eighth
     digit the header has no room for. */
  const capped = n => Math.min(n, CONFIG.economy.purseCap);

  /* What a run of a given rating would pay on a save in this state.

     A level pays for the rating it is worth rather than for each time it is
     cleared, so what another go is worth depends entirely on what the level
     already has: the difference between the two ratings, plus the one-time
     first-clear bonus if that has never been paid. Five perfect replays pay
     5 x 6, not 5 x 14, and a perfect replay of an already perfect board pays
     nothing at all.

     Written down once and read twice. `complete` pays this out after a run, and
     the card shown before a replay quotes it before one. A card promising six
     gold for a board that then hands over three is worse than a card with no
     number on it, and two copies of "the difference between what you had and
     what you got" is exactly how that happens. */
  const worth = n => CONFIG.economy.starGold[n] || 0;
  function payoutFor(state, level, stars){
    if (!(stars > 0)) return { firstClear: false, starGold: 0, bonus: 0, earned: 0 };
    const firstClear = !state.claimed[level];
    const starGold = Math.max(0, worth(stars) - worth(state.stars[level] || 0));
    const bonus = firstClear ? CONFIG.economy.firstClear : 0;
    return { firstClear, starGold, bonus, earned: starGold + bonus };
  }

  function createProgress(storage){
    const store = storage || safeStorage();
    let state = blank();
    /* Whether the save on disk had a doors record at all, which is a different
       question from whether any door is open in it. Read here because it is only
       answerable before blank()'s empty record is merged over the top. */
    let hadDoors = false;
    try {
      const raw = store.getItem(SAVE_KEY);
      if (raw){
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object'){
          hadDoors = !!parsed.doors && typeof parsed.doors === 'object' && !Array.isArray(parsed.doors);
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
    /* a save written before the cap existed, or by a hand in the console */
    state.gold = capped(state.gold);
    /* A record keyed by level or by chapter, which is the shape five of these
       fields share. `typeof x === 'object'` is not the test: null is an object
       and so is an array, and an array is the one that gets all the way through.
       `stars: [3,2,1]` passed every guard here, kept its shape, and answered
       `starsFor(0)` with 3 — a level nobody can play, holding stars nobody
       earned, quietly correct-looking forever. */
    const record = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    /* The first three were the ones nobody was checking. They are older than
       `claimed` and `seen` and they were trusted, which held for exactly as long
       as every save came from this file. A browser that loses bytes out of
       localStorage, or a hand in a console, or a partial write, and `stars` is
       null — then `starsFor` reads `null[1]` during boot, before anything is
       drawn, and the page is blank with no button to press and nothing saying
       why. That is the one failure in this game with no way back, and the save
       is the one input the game does not control.

       Found by the browser suite fuzzing every field of a real save with every
       shape a field goes wrong in. It took one run. */
    state.stars = record(state.stars);
    state.best = record(state.best);
    state.pars = record(state.pars);
    state.claimed = record(state.claimed);
    state.seen = record(state.seen);
    state.doors = record(state.doors);
    /* A save from before the doors existed.

       That player has already walked past every chapter boundary they have
       reached — they were not there to be stopped at. Gating them now would take
       away levels somebody has already opened, which is the one thing the layout
       migration below is careful never to do, and it would do it to the players
       furthest in. So every door behind the frontier is counted as open.

       Told apart from a save that simply has no doors open yet by `unlocked`
       rather than by a version bump: a new player is at level 1 in chapter 0 and
       this opens nothing for them. The field is absent exactly once, on the load
       that migrates, and present forever after. */
    if (!hadDoors){
      for (let s = 1; s <= Levels.sectionOf(state.unlocked); s++) state.doors[s] = true;
    }
    if (!state.diag || typeof state.diag !== 'object' || Array.isArray(state.diag)) state.diag = blank().diag;
    state.diag.refused = record(state.diag.refused);
    state.diag.endings = record(state.diag.endings);
    if (!Number.isInteger(state.diag.faults)) state.diag.faults = 0;
    /* The boards moved. What a player earned stays earned: stars and best move
       counts are theirs, and taking them away to keep a record tidy is a worse
       trade than leaving a best that the new board happens not to allow.

       The cached par does go. It is not something anyone earned, it is a note of
       how few pours a particular board needed, and that board is gone. Keeping it
       would let a level be scored against a bar belonging to a different puzzle.

       So do the ending counts: they are read against the measured difficulty of
       a particular board, and that board is gone. */
    if (state.layout !== CONFIG.layout){
      state.layout = CONFIG.layout;
      state.pars = {};
      state.diag.endings = {};
    }

    function save(){
      try { store.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
    }

    /* A chapter with no door in front of it is always open, which is chapter one
       and anything past the end of the door list. A local rather than a method,
       so nothing depends on how it was called: `isUnlocked` reads it, and a
       `this` in there would break the moment somebody destructured it. */
    function doorOpen(section){
      if (Levels.doorFor(section) == null) return true;
      return !!state.doors[section];
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
      /* Capped at the last chapter actually entered, not the one the frontier
         has stepped into. Clearing the last board of a chapter puts `unlocked`
         on the first board of the next one, and that board is behind a shut
         door — so reading the grant off `unlocked` alone would hand over a
         chapter's tools while its door is still closed, which is the chapter
         being given away by the thing meant to be guarding it. */
      perks(){
        const at = Levels.sectionOf(state.unlocked);
        return Chapters.perksFor(doorOpen(at) ? at : at - 1);
      },
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
      /* How runs ended, per level and per reason. `lostBecause` already named
         every one and nothing kept the answer. See 15-diagnostics.md. */
      recordEnding(level, reason){
        if (!Number.isInteger(level) || level < 1 || !reason) return;
        const row = state.diag.endings[level] || (state.diag.endings[level] = {});
        row[reason] = (row[reason] || 0) + 1;
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
      /* ---- the doors ----

         A chapter is opened by getting through the floor of casks in front of
         it. Until that happens its boards are not reachable, however far the
         frontier has run: `unlocked` says how far the player has PLAYED, and a
         door says whether they may go on.

         Two numbers rather than one because they answer different questions and
         because folding the door into `unlocked` would lose the difference the
         moment somebody paid past a board. `buyUnlock` moves the frontier; it
         must not also open a door, or the gate is purchasable. */
      isDoorOpen: doorOpen,
      /* The floor standing in front of the chapter this level is in, or null if
         there is nothing in the way. */
      doorBefore(level){
        const section = Levels.sectionOf(level);
        return state.doors[section] ? null : Levels.doorFor(section);
      },
      openDoor(section){
        if (Levels.doorFor(section) == null) return false;
        if (state.doors[section]) return false;
        state.doors[section] = true;
        save();
        return true;
      },
      /* Which door the player is standing at, or null when the way on is clear.
         The first one that is shut at or before the frontier — asked this way so
         a save whose later doors are all shut still names the one in front of
         them rather than the last one in the run. */
      doorAhead(){
        for (let s = 1; s <= Levels.sectionCount(); s++){
          if (Levels.doorFor(s) == null) continue;
          if (state.doors[s]) continue;
          if (s * CONFIG.sectionSize + 1 > state.unlocked) return null;
          return s;
        }
        return null;
      },

      isUnlocked: level => level <= state.unlocked && level <= lastLevel()
        && doorOpen(Levels.sectionOf(level)),
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
      fill(){
        state.gold = CONFIG.economy.purseCap;
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
        state.gold = capped(state.gold + CONFIG.economy.daily);
        save();
        return CONFIG.economy.daily;
      },

      /* Paying past a board opens the next one and nothing else. No stars, no
         best, and the first-clear bonus is left unclaimed, so coming back later
         and actually beating it still pays what it always would have. */
      buyUnlock(level, cost){
        if (level >= lastLevel()) return false;         /* nothing past the last one to open */
        if (state.unlocked > level) return false;       /* already past it */
        /* A door is not for sale. Paying past a board is a way through a board
           you cannot beat; a shut door is not a board you cannot beat, it is the
           next chapter not being open yet. Without this the map would happily
           take the fee for a level whose chapter is still closed and hand back a
           frontier that moved and a level still unplayable — money for nothing,
           and no way to tell that is what happened. */
        if (!doorOpen(Levels.sectionOf(level))) return false;
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
        /* Worked out before anything is written down, because it is decided by
           what the level had rather than by what it is about to have. */
        const pay = payoutFor(state, level, stars);
        if (stars > prevStars) state.stars[level] = stars;

        /* Best is the fewest pours here and the *most* shots on a bubble level,
           because there the run is graded on how long it lasted rather than how
           briefly. Two numbers both called "best" that compare in opposite
           directions is the kind of difference that survives a review and then
           quietly records the worst run of every bubble level forever, with
           nothing about the save looking wrong. So the direction is decided from
           the level, here, rather than passed in by whoever happens to call. */
        const longerIsBetter = Levels.isBubble(level);
        const prevBest = level in state.best ? state.best[level] : null;
        const beatIt = prevBest === null
          || (longerIsBetter ? moves > prevBest : moves < prevBest);
        if (beatIt) state.best[level] = moves;
        if (level >= state.unlocked) state.unlocked = Math.min(level + 1, lastLevel());

        state.claimed[level] = true;
        state.gold = capped(state.gold + pay.earned);

        save();
        return {
          failed: false,
          improvedStars: stars > prevStars,
          improvedBest: beatIt,
          firstClear: pay.firstClear,
          starGold: pay.starGold,
          bonus: pay.bonus,
          earned: pay.earned
        };
      },
      /* What another go at this level would pay if it went that well. Asked by
         the card shown before a replay and answered by the same arithmetic that
         pays out after one, so the offer and the payment cannot disagree. */
      wouldEarn: (level, stars) => payoutFor(state, level, stars),
      reset(){ state = blank(); save(); }
    };
  }

  return { SAVE_KEY, createProgress, memoryStorage, untilNextDay, briefly };
})();
