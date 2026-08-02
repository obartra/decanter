/* The named states, checked against the game they describe.

   A preset is a claim: "this save puts the game one board from a new chapter",
   "this one is the level before a bubble board". The claims are the whole value
   — the lab shows them as presets and the browser specs open them by name — and
   nothing about a wrong one looks wrong. A preset naming a level that stopped
   being a bubble board still loads, still deals, and quietly tests the ordinary
   case under a name that says otherwise.

   So each claim is asked of the real modules rather than trusted. */
import { describe, it, assert, equal, loadPure, loadFrom } from './helpers.mjs';

const { CONFIG, Levels, Chapters, Progress, LAST_LEVEL } = loadPure();
const { LabStates } = loadFrom('src/lab/js', ['10-states.js']);

/* The same environment the lab hands it, off the same modules the game runs. */
const env = { CONFIG, Levels, Chapters, LAST_LEVEL, today: '2026-01-01' };

const play = LabStates.list.filter(s => s.kind === LabStates.PLAY);
const recovery = LabStates.list.filter(s => s.kind === LabStates.RECOVERY);

describe('the named states', () => {
  it('has both kinds, and enough of them to be a list rather than an example', () => {
    assert(play.length >= 10, `only ${play.length} playable states`);
    assert(recovery.length >= 3, `only ${recovery.length} recovery states`);
    equal(play.length + recovery.length, LabStates.list.length, 'a state has no kind');
  });

  it('gives every state a name and a reason to exist', () => {
    const ids = new Set();
    for (const s of LabStates.list){
      assert(/^[a-z][A-Za-z]+$/.test(s.id), `${s.id} is not a usable id`);
      assert(!ids.has(s.id), `${s.id} is listed twice`);
      ids.add(s.id);
      assert(s.title && s.title.length > 4, `${s.id} has no title`);
      /* The `why` is the point of the file. A preset with no reason attached is
         one nobody can tell from the preset beside it, and the first thing that
         happens to a list like that is that it stops being read. */
      assert(s.why && s.why.length > 60, `${s.id} does not say what it is for`);
    }
  });

  it('resolves every state against the real modules', () => {
    for (const s of LabStates.list){
      const save = LabStates.make(s.id, env);
      assert(save && typeof save === 'object', `${s.id} produced nothing`);
    }
  });

  it('refuses a name it does not have, rather than dealing a fresh save', () => {
    let threw = false;
    try { LabStates.make('nosuchthing', env); } catch (e) { threw = true; }
    assert(threw, 'an unknown state came back as something');
  });

  it('leaves every playable state inside the game', () => {
    for (const s of play) equal(LabStates.faults(s.id, env), [], `${s.id} is not a state a player can be in`);
  });

  /* The check above is only worth something if it can fail, and the failure it
     is guarding against is a preset drifting past the end of the graded run. */
  it('would notice a state that had drifted out of the game', () => {
    const bent = { ...env, LAST_LEVEL: 5 };
    const complaints = play.flatMap(s => LabStates.faults(s.id, bent));
    assert(complaints.length > 0, 'nothing complained about a game five levels long');
  });

  it('every save it produces survives being loaded', () => {
    /* Including the mangled ones — that is what they are for. A save the game
       throws on is a game that cannot be opened again, and the player has no way
       to find out why. */
    for (const s of LabStates.list){
      const save = LabStates.make(s.id, env);
      const store = Progress.memoryStorage();
      store.setItem(Progress.SAVE_KEY, JSON.stringify(save));
      const p = Progress.createProgress(store);
      assert(Number.isInteger(p.unlocked) && p.unlocked >= 1, `${s.id} loads with unlocked ${p.unlocked}`);
      assert(Number.isInteger(p.gold) && p.gold >= 0, `${s.id} loads with gold ${p.gold}`);
    }
  });
});

/* Each of these is a claim the preset's name makes. They are separate tests
   because a broken one should say which claim stopped being true. */
describe('what each state claims about itself', () => {
  it('puts the frontier one board before a bubble level', () => {
    const at = LabStates.make('beforeBubble', env).unlocked;
    assert(!Levels.isBubble(at), `level ${at} is itself a bubble board`);
    assert(Levels.isBubble(at + 1), `level ${at + 1} is not a bubble board`);
  });

  it('puts the frontier on a bubble level', () => {
    const at = LabStates.make('onBubble', env).unlocked;
    assert(Levels.isBubble(at), `level ${at} is not a bubble board`);
  });

  it('strands a purse that cannot deal a board', () => {
    for (const id of ['purseDry', 'oneShortOfABoard']){
      const save = LabStates.make(id, env);
      assert(save.gold < CONFIG.economy.attempt,
        `${id} holds ${save.gold}, which pays the ${CONFIG.economy.attempt} fee`);
    }
    /* and one of them is not merely empty, which is the distinction */
    assert(LabStates.make('oneShortOfABoard', env).gold > 0, 'a purse one short is not an empty one');
  });

  it('closes the way out only in the state that is about the way out', () => {
    equal(LabStates.make('purseDry', env).dailyOn, undefined, 'the draught should still be there');
    equal(LabStates.make('draughtDrawn', env).dailyOn, env.today, 'the draught should be spent');
  });

  it('stands one board from a chapter nobody has read', () => {
    const save = LabStates.make('chapterEdge', env);
    const chapter = Levels.sectionOf(save.unlocked);
    equal(save.unlocked % CONFIG.sectionSize, 0, 'not the last board of its chapter');
    assert(save.seen[chapter], 'the chapter being played has not been read');
    assert(!save.seen[chapter + 1], 'the chapter about to open has already been read');
  });

  it('hands the blast over in the chapter that grants it, and no earlier', () => {
    for (const id of ['blastReady', 'blastUnaffordable']){
      const save = LabStates.make(id, env);
      const chapter = Levels.sectionOf(save.unlocked);
      assert(Chapters.perksFor(chapter).blast, `${id} has not been granted the blast`);
      assert(!Chapters.perksFor(chapter - 1).blast, `${id} could have been a chapter earlier`);
    }
    assert(LabStates.make('blastReady', env).gold >= CONFIG.economy.blast, 'blastReady cannot pay for one');
    assert(LabStates.make('blastUnaffordable', env).gold < CONFIG.economy.blast,
      'blastUnaffordable can pay for one');
  });

  it('offers a beaten board with nothing left to earn, and one with something', () => {
    const save = LabStates.make('replayCleared', env);
    const done = Object.keys(save.stars).filter(l => save.stars[l] === 3);
    const partial = Object.keys(save.stars).filter(l => save.stars[l] > 0 && save.stars[l] < 3);
    assert(done.length && partial.length, 'a replay state needs both, or it is only half a case');
    for (const level of Object.keys(save.stars)){
      assert(Number(level) < save.unlocked, `level ${level} is beaten and not yet open`);
      assert(save.best[level] != null, `level ${level} has stars and no best`);
    }
  });

  it('stands on the last board of the graded run', () => {
    equal(LabStates.make('lastLevel', env).unlocked, LAST_LEVEL);
  });

  it('finishes the game with every board beaten', () => {
    const save = LabStates.make('finished', env);
    equal(Object.keys(save.stars).length, LAST_LEVEL, 'not every level was recorded');
    for (let level = 1; level <= LAST_LEVEL; level++){
      equal(save.stars[level], 3, `level ${level} is not perfect`);
    }
    /* The bubble levels have no par to record, and stamping one would file a
       pour count against a board that is scored the other way round. */
    for (let level = 1; level <= LAST_LEVEL; level++){
      if (Levels.isBubble(level)) equal(save.pars[level], undefined, `level ${level} was given a par`);
    }
  });

  it('mutes only the state that is about muting', () => {
    equal(LabStates.make('muted', env).sound, false);
    for (const s of play){
      if (s.id === 'muted') continue;
      equal(LabStates.make(s.id, env).sound, undefined, `${s.id} has an opinion about sound`);
    }
  });

  it('gives the diagnostics panel something to show', () => {
    const diag = LabStates.make('faulted', env).diag;
    assert(diag.faults > 0 && diag.lastFault, 'nothing has gone wrong in the faulted state');
    assert(Object.keys(diag.refused).length > 0, 'nothing has been refused');
  });
});
