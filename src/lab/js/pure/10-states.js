/* The states a game can be in, named once.

   A save is the whole of the game's memory: what is unlocked, what the purse
   holds, which chapters have been read, which levels were beaten and how well.
   Every interesting screen in this game is a function of one — a stranded purse,
   the last level of the graded run, a chapter about to open, a board that has
   already been cleared and is being replayed for nothing.

   Those states were being written out by hand, one literal per spec, which has
   two costs. The obvious one is that they drift: `{ unlocked: 15, gold: 0 }`
   appears in four specs and means "stranded", and the day the daily draught's
   figure moves, four literals have to be found. The one that actually hurts is
   that a state nobody has written down is a state nobody looks at — there is no
   list to read, so the ones that get tested are the ones somebody thought of
   while writing a spec about something else.

   So they are here, once, with a sentence each saying what they are for. The lab
   offers them as presets and drives the real page into them; the browser specs
   import the same list. A state found by hand in the lab becomes a fixture
   without being retyped, and a preset that stops being reachable fails the suite
   rather than sitting in a panel producing a screen nobody can get to.

   ## Overrides, not whole saves

   Each entry returns only what it changes. The blank save lives in
   `40-progress.js` and is that module's business; restating it here would make a
   second answer to "what does a new game look like", which is the thing this
   file exists to prevent one level up.

   ## `env`

   The interesting levels are not constants: which level ends a chapter depends
   on `sectionSize`, which chapter grants the blast depends on the chapter table,
   and "today" depends on when you ask. So a state is a function of the game's
   own modules rather than a literal with 61 written in it. Both callers have
   them — the lab reaches into the frame, the specs load them in the sandbox. */
export const LabStates = (() => {

  /* Two kinds, because they are asked different questions.

     `play` is a state a player can actually be in, and every one of them has to
     be a save the game accepts as current. `recovery` is a save that is wrong on
     purpose — an older layout, a missing field, a file somebody's browser
     mangled — and the only thing being asked is that the game comes up at all.
     A check that demanded those be valid would be asking for the opposite of
     what they are for. */
  const PLAY = 'play', RECOVERY = 'recovery';

  /* Where the chapters fall. `sectionOf` is the game's own arithmetic rather than
     a division written again here: the day chapters stop being a fixed ten
     levels, these move with them. */
  const firstOf = (env, chapter) => chapter * env.CONFIG.sectionSize + 1;
  const lastOf = (env, chapter) => (chapter + 1) * env.CONFIG.sectionSize;

  /* The chapter that hands over a named grant, found in the table rather than
     written down, because "the blast is chapter seven" is exactly the kind of
     fact that survives the chapter being moved. */
  function chapterGranting(env, grant){
    for (let i = 0; i < env.Chapters.count; i++){
      const before = i === 0 ? {} : env.Chapters.perksFor(i - 1);
      const after = env.Chapters.perksFor(i);
      if (after[grant] && !before[grant]) return i;
    }
    return null;
  }

  /* Every chapter up to and including this one already read, so an opening card
     does not land on top of the state being looked at. The states that ARE about
     the card say so by leaving the last one out.

     Capped at the last chapter that exists. The graded run is twelve sections
     long and there are seven chapters, so `Chapters.at` returns null past the
     seventh and those sections open no card at all. Marking them read is not
     merely harmless, it is a claim about a card nobody can be shown, and the
     validator below is right to call it one. */
  function seenUpTo(env, chapter){
    const seen = {};
    const last = Math.min(chapter, env.Chapters.count - 1);
    for (let i = 0; i <= last; i++) seen[i] = true;
    return seen;
  }

  /* A level cleared, at a given number of pours, the way a real run records it.
     `pars` is stamped too because the save keeps the par a level was scored
     against: a run banked before the table moved is still worth what it was. */
  function cleared(save, level, moves, par, stars){
    save.stars[level] = stars;
    save.best[level] = moves;
    save.pars[level] = par;
    save.claimed[level] = true;
    return save;
  }

  const STATES = [
    {
      id: 'fresh',
      title: 'A new player',
      kind: PLAY,
      why: 'Nothing read, nothing beaten, the starting purse. The one state every player passes through and the easiest to stop testing.',
      make: () => ({})
    },
    {
      id: 'firstChapter',
      title: 'Three levels in',
      kind: PLAY,
      why: 'The ordinary case: a chapter opened, a few boards cleared, money in the purse.',
      make: env => {
        const s = { unlocked: 4, gold: 200, seen: seenUpTo(env, 0), stars: {}, best: {}, pars: {}, claimed: {} };
        cleared(s, 1, 8, 8, 3);
        cleared(s, 2, 11, 9, 2);
        cleared(s, 3, 14, 11, 1);
        return s;
      }
    },
    {
      id: 'beforeBubble',
      title: 'The level before a bubble board',
      kind: PLAY,
      why: 'Where paying past a board dealt the wrong game. The frontier is a pour level whose successor is the other one, which is exactly when the panel offers Move on.',
      make: env => {
        let at = null;
        for (let level = 2; level <= env.LAST_LEVEL - 1; level++){
          if (!env.Levels.isBubble(level) && env.Levels.isBubble(level + 1)){ at = level; break; }
        }
        return { unlocked: at, gold: 400, seen: seenUpTo(env, env.Levels.sectionOf(at)) };
      }
    },
    {
      id: 'onBubble',
      title: 'Sitting on a bubble board',
      kind: PLAY,
      why: 'The frontier IS the other game. Its board is not in the critical bundle, so this is also the state that catches the deferred fetch failing.',
      make: env => {
        let at = null;
        for (let level = 2; level <= env.LAST_LEVEL - 1; level++){
          if (env.Levels.isBubble(level)){ at = level; break; }
        }
        return { unlocked: at, gold: 400, seen: seenUpTo(env, env.Levels.sectionOf(at)) };
      }
    },
    {
      id: 'atDoor',
      title: 'Standing at a shut cellar door',
      kind: PLAY,
      why: 'A chapter finished and the next one still closed. The frontier has moved onto a board that cannot be dealt, which is the one state where those two facts come apart, and the only screen in the game with no way forward except the other game.',
      make: env => {
        const first = env.CONFIG.sectionSize + 1;
        /* Said outright, against the fill-in above: the frontier has passed the
           boundary and the door is still shut. That is the whole state. */
        return { unlocked: first, gold: 400, doors: {},
                 seen: seenUpTo(env, env.Levels.sectionOf(first) - 1) };
      }
    },
    {
      id: 'doorJustOpened',
      title: 'A cellar door just got through',
      kind: PLAY,
      why: 'The same save with the floor of casks behind it. Everything the state above refuses, this one allows, so the pair is what says the door is the thing doing the refusing and not something else.',
      make: env => {
        const first = env.CONFIG.sectionSize + 1;
        return { unlocked: first, gold: 400,
                 seen: seenUpTo(env, env.Levels.sectionOf(first) - 1) };
      }
    },
    {
      id: 'atUnnamedDoor',
      title: 'A cellar door into a chapter with no name',
      kind: PLAY,
      why: 'The run is twelve chapters long and seven of them have names, so five doors open onto Reserve 1 to Reserve 5. Those carry a name no chapter list provides and there is no opening card behind them, which is two things nothing else here shows.',
      make: env => {
        /* The first chapter past the named ones. Found rather than written down:
           the number of names is a list in CONFIG and the number of chapters
           follows from where the run ends, so a name added anywhere moves this. */
        let section = null;
        for (let s = 1; s < env.Levels.sectionCount(); s++){
          if (env.Levels.doorFor(s) != null && s >= env.CONFIG.sectionNames.length){ section = s; break; }
        }
        if (section == null) return {};
        const first = section * env.CONFIG.sectionSize + 1;
        return { unlocked: first, gold: 400, doors: doorsWalked(env, first - 1),
                 seen: seenUpTo(env, env.Chapters.count - 1) };
      }
    },
    {
      id: 'purseDry',
      title: 'Stranded with an empty purse',
      kind: PLAY,
      why: 'The state the daily draught exists for. Every medallion is refused, the panel says so in the same words the replay card does, and the draught is the only way out.',
      make: env => ({ unlocked: 15, gold: 0, seen: seenUpTo(env, 1) })
    },
    {
      id: 'oneShortOfABoard',
      title: 'One gold short of a board',
      kind: PLAY,
      why: 'A purse that is not empty and still cannot pay. The off-by-one either side of a fee is where a disabled button and a silent refusal part company.',
      make: env => ({ unlocked: 15, gold: env.CONFIG.economy.attempt - 1, seen: seenUpTo(env, 1) })
    },
    {
      id: 'draughtDrawn',
      title: 'The draught already taken today',
      kind: PLAY,
      why: 'The way out, closed. The map has to say when it comes back rather than only that it has gone, and the countdown has to run down on its own.',
      make: env => ({ unlocked: 15, gold: 0, seen: seenUpTo(env, 1), dailyOn: env.today })
    },
    {
      id: 'chapterEdge',
      title: 'One board from a new chapter',
      kind: PLAY,
      why: 'The frontier is the last level of a chapter and the next chapter has never been read, so beating it opens a card. The opening is one-time, which makes it easy to spend by accident.',
      make: env => ({ unlocked: lastOf(env, 1), gold: 400, seen: seenUpTo(env, 1) })
    },
    {
      id: 'blastReady',
      title: 'The blast, granted and unused',
      kind: PLAY,
      why: 'The rescue is on the panel only when the run failed, the chapter handed it over, it has not been used, and some bottle would bring the board back. Four conditions, and three of them are states rather than moves.',
      make: env => {
        const chapter = chapterGranting(env, 'blast');
        return { unlocked: firstOf(env, chapter), gold: 400, seen: seenUpTo(env, chapter) };
      }
    },
    {
      id: 'blastUnaffordable',
      title: 'The blast, granted and unaffordable',
      kind: PLAY,
      why: 'Offered and disabled, which is a different screen from not offered at all: the run can see the way out and cannot take it.',
      make: env => {
        const chapter = chapterGranting(env, 'blast');
        return { unlocked: firstOf(env, chapter), gold: env.CONFIG.economy.blast - 1, seen: seenUpTo(env, chapter) };
      }
    },
    {
      id: 'replayCleared',
      title: 'Going back to a beaten board',
      kind: PLAY,
      why: 'A replay is free and pays stars only, so the card shown before one has to say what it is worth. A level with a best and a full three stars has nothing left to earn, which is the case that reads as broken when it is not.',
      make: env => {
        const s = { unlocked: 20, gold: 400, seen: seenUpTo(env, 1), stars: {}, best: {}, pars: {}, claimed: {} };
        cleared(s, 12, 14, 14, 3);
        cleared(s, 13, 21, 17, 1);
        return s;
      }
    },
    {
      id: 'lastLevel',
      title: 'The last graded board',
      kind: PLAY,
      why: 'There is nothing past it: no next board to offer, no next fee to check, and a run that cannot be scored against a table that has run out. The panel says something different here and it is the hardest screen in the game to reach by playing.',
      make: env => ({ unlocked: env.LAST_LEVEL, gold: 400, seen: seenUpTo(env, env.Levels.sectionOf(env.LAST_LEVEL)) })
    },
    {
      id: 'finished',
      title: 'Every board beaten, three stars each',
      kind: PLAY,
      why: 'The end of the game, with the total the last panel quotes. Reaching it honestly is a hundred and twenty perfect runs.',
      make: env => {
        const s = { unlocked: env.LAST_LEVEL, gold: 400,
                    seen: seenUpTo(env, env.Levels.sectionOf(env.LAST_LEVEL)), stars: {}, best: {}, pars: {}, claimed: {} };
        for (let level = 1; level <= env.LAST_LEVEL; level++){
          if (env.Levels.isBubble(level)) s.stars[level] = 3;
          else cleared(s, level, 10, 10, 3);
        }
        return s;
      }
    },
    {
      id: 'everythingOpen',
      title: 'The whole run open, nothing beaten',
      kind: PLAY,
      why: 'Every board reachable and every chapter already read, so a spec can open any level without playing to it or having a card land on top of what it came to look at. The workhorse rather than an edge case.',
      make: env => ({ unlocked: env.LAST_LEVEL, gold: 400, seen: seenUpTo(env, env.Chapters.count - 1) })
    },
    {
      id: 'muted',
      title: 'Muted in an earlier sitting',
      kind: PLAY,
      why: 'The preference is read from the save at boot and has to reach both games. On this build the other one is fetched after the page opens, so the hand-over happens later than the read.',
      make: env => ({ unlocked: 15, gold: 400, seen: seenUpTo(env, 1), sound: false })
    },
    {
      id: 'faulted',
      title: 'Something has already gone wrong',
      kind: PLAY,
      why: 'The diagnostics panel answers "it did nothing when I tapped it", offline, from counts that outlive a reload. It is only worth anything when there is something in it.',
      make: env => ({
        unlocked: 15, gold: 400, seen: seenUpTo(env, 1),
        diag: { refused: { attempt: 3, hint: 1 }, faults: 2, lastFault: 'solver timed out' }
      })
    },
    {
      id: 'staleLayout',
      title: 'A save from older boards',
      kind: RECOVERY,
      why: 'The layout stamp says these bests were set against boards that are no longer dealt. Keeping them would show a best nobody can match on a board nobody has played.',
      make: env => ({ layout: env.CONFIG.layout - 1, unlocked: 30, gold: 400, seen: seenUpTo(env, 2),
                      stars: { 5: 3, 6: 2 }, best: { 5: 9, 6: 12 }, pars: { 5: 9, 6: 11 } })
    },
    {
      id: 'oldVersion',
      title: 'A save with fields that did not exist yet',
      kind: RECOVERY,
      why: 'Everything added since has to arrive with a default rather than as undefined, and the run that reads it must not be the one that finds out.',
      make: () => ({ version: 1, unlocked: 8, gold: 40, stars: { 1: 3 },
                     best: undefined, pars: undefined, claimed: undefined, seen: undefined,
                     dailyOn: undefined, diag: undefined })
    },
    {
      id: 'nonsense',
      title: 'A save somebody mangled',
      kind: RECOVERY,
      why: 'Types that cannot be right at all. A game that throws here is a game that cannot be opened again, and the player has no way to know why.',
      make: () => ({ unlocked: 'twelve', gold: null, stars: [], best: 7, pars: 'none',
                     claimed: 0, seen: 'yes', dailyOn: 12, diag: 'fine' })
    }
  ];

  const byId = id => STATES.find(s => s.id === id) || null;

  /* The overrides for a state, resolved against the game's own modules.
     Throws rather than returning something half-built: a preset that cannot be
     resolved is a preset describing a game that no longer exists, and quietly
     handing back `{}` would deal a fresh save under the wrong name. */
  /* The doors a save's own frontier says have been got through.

     Every chapter but the first is entered through a floor of casks, so a player
     standing on level 15 has been through the door in front of chapter two.
     There is no other way they could be there.

     Filled in here, once, rather than written into each state, and that is not
     only to save fifteen edits. A state says one thing — an empty purse, a
     chapter about to open, a save somebody mangled — and the doors are not that
     thing in any of them; they are a consequence of the level the state names. A
     preset that had to restate them would be a preset with a second number to
     keep in step with its first, which is exactly the drift this file's header
     is about. `{ unlocked: 15 }` with no door open is not a harder state to test,
     it is a save no player can be in.

     A state that names `doors` means it, and is taken whole. Not merged: the two
     states that are ABOUT a door need to describe one that is SHUT behind a
     frontier that has already passed it, and `{ ...filled, ...{} }` cannot say
     that — spreading an empty record adds nothing and removes nothing, so the
     fill-in wins and the state quietly becomes the opposite of itself. Which is
     exactly what it did: `atDoor` came up with its door open and every
     assertion about a refusal failed. */
  function doorsWalked(env, unlocked){
    const out = {};
    if (!Number.isInteger(unlocked)) return out;
    for (let s = 1; s <= env.Levels.sectionOf(unlocked); s++) out[s] = true;
    return out;
  }

  function make(id, env){
    const state = byId(id);
    if (!state) throw new Error(`no such state: ${id}`);
    const out = state.make(env);
    if (!out || typeof out !== 'object') throw new Error(`${id} produced no save`);
    /* Not on a recovery state. Those are saves that are wrong on purpose, and
       repairing one on the way out would be this file quietly fixing the thing
       the state exists to hand to the game broken. */
    if (state.kind === PLAY && out.unlocked != null && out.doors == null)
      out.doors = doorsWalked(env, out.unlocked);
    return out;
  }

  /* What has to be true of a state a player can actually be in. Not a schema
     check — that is `40-progress.js`'s job and it does it on the way in — but a
     check that the preset means what its name says: a level inside the graded
     run, a purse the economy allows, a chapter list that stops where the
     chapters do. */
  function faults(id, env){
    const state = byId(id);
    const out = [];
    if (!state) return [`no such state: ${id}`];
    if (state.kind !== PLAY) return out;
    const save = make(id, env);
    if (save.unlocked != null){
      if (!Number.isInteger(save.unlocked)) out.push(`unlocked is ${save.unlocked}`);
      else if (save.unlocked < 1 || save.unlocked > env.LAST_LEVEL)
        out.push(`unlocked ${save.unlocked} is outside 1..${env.LAST_LEVEL}`);
    }
    if (save.gold != null){
      if (!Number.isInteger(save.gold) || save.gold < 0) out.push(`gold is ${save.gold}`);
      else if (save.gold > env.CONFIG.economy.purseCap) out.push(`gold ${save.gold} is over the cap`);
    }
    for (const key of Object.keys(save.seen || {})){
      if (Number(key) >= env.Chapters.count) out.push(`chapter ${key} does not exist`);
    }
    for (const key of Object.keys(save.stars || {})){
      const level = Number(key);
      if (!Number.isInteger(level) || level < 1 || level > env.LAST_LEVEL)
        out.push(`stars recorded for level ${key}`);
      const n = save.stars[key];
      if (!Number.isInteger(n) || n < 0 || n > 3) out.push(`level ${key} has ${n} stars`);
    }
    return out;
  }

  return { list: STATES, make, faults, PLAY, RECOVERY };
})();
