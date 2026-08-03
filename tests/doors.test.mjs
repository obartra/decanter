/* The doors.

   Every chapter but the first is entered through a floor of casks. The claims
   worth pinning are not about how it looks, they are these:

   - there is exactly one door per chapter, and none in front of the first;
   - the floors behind them get harder, measured against the real par table
     rather than against the order they happen to be listed in;
   - a chapter's boards are genuinely unreachable until its door is open, by
     every route into a level there is, including the one that takes money;
   - and a save written before any of this existed does not lose the chapters
     its owner had already walked into.

   That last one is the one with teeth. The others are a feature not working;
   that one is a player who comes back after an update and finds half the game
   locked, with a floor of casks in front of every chapter they had already
   finished and no way to say so. */
import { describe, it, assert, equal, loadPure, loadGame } from './helpers.mjs';
/* Imported rather than sandboxed. `MapGeom` only touches the document inside
   its functions, so loading the module here runs nothing — see the note at the
   top of tests/map.test.mjs. */
import { MapGeom } from '../src/js/80-map.js';

const { Levels, Progress, CONFIG } = loadPure();
const { CasksPars, CasksLevels } = loadGame('casks');

const fresh = () => Progress.createProgress(Progress.memoryStorage());
/* Every chapter that has a door, which is every one but the first. */
const doorSections = () => Array.from({ length: Levels.sectionCount() - 1 }, (_, i) => i + 1);

describe('the doors', () => {
  it('stands one in front of every chapter but the first', () => {
    equal(Levels.doorFor(0), null, 'the first chapter opens onto the game, not onto a door');
    for (const s of doorSections()){
      assert(Number.isInteger(Levels.doorFor(s)), `chapter ${s + 1} has no door`);
    }
    /* Nothing past the end of the run, so a door cannot be minted for a chapter
       that does not exist and then be impossible to open. */
    equal(Levels.doorFor(Levels.sectionCount()), null, 'there is no chapter past the last one');
    equal(Levels.doorFor(-1), null);
    equal(Levels.doorFor(1.5), null);
  });

  it('names a floor the cellar door game actually has', () => {
    for (const s of doorSections()){
      const floor = Levels.doorFor(s);
      assert(floor >= 1 && floor <= CasksPars.last,
        `chapter ${s + 1} asks for floor ${floor}, and the cellar has ${CasksPars.last}`);
      assert(CasksLevels.make(floor), `floor ${floor} does not deal`);
    }
  });

  it('gets harder every chapter', () => {
    /* Against the shipped par table, not against the numbers being in ascending
       order. Two doors could climb in floor number and fall in difficulty: the
       casks table is ordered by measured par today and nothing here would notice
       the day it stops being. Par is what "harder" means, so par is what is
       read. */
    const pars = doorSections().map(s => CasksPars.par[Levels.doorFor(s)]);
    for (let i = 1; i < pars.length; i++){
      assert(pars[i] > pars[i - 1],
        `the door to chapter ${i + 2} is par ${pars[i]}, no harder than the ${pars[i - 1]} before it`);
    }
    /* And the climb is worth having. Eleven doors all within a move of each
       other would satisfy the check above and still be one difficulty. */
    assert(pars[pars.length - 1] - pars[0] >= 10,
      `the whole run of doors spans par ${pars[0]} to ${pars[pars.length - 1]}`);
  });

  it('keeps a chapter shut until its door is opened', () => {
    const p = fresh();
    for (let level = 1; level <= CONFIG.sectionSize; level++) p.complete(level, 10, 3);
    /* The frontier has moved onto the first board of chapter two and stopped
       there. Those are two different facts and the save holds both. */
    equal(p.unlocked, CONFIG.sectionSize + 1, 'clearing the chapter still moves the frontier');
    assert(!p.isUnlocked(CONFIG.sectionSize + 1), 'but its first board is behind the door');
    assert(p.isUnlocked(CONFIG.sectionSize), 'and the one before it is still open');

    assert(p.openDoor(1), 'getting the gilt cask out opens the chapter');
    assert(p.isUnlocked(CONFIG.sectionSize + 1), 'and now the board is there');
    assert(!p.openDoor(1), 'a door already open cannot be opened again');
  });

  it('opens one chapter, not the rest of the game', () => {
    const p = fresh();
    for (let level = 1; level <= CONFIG.sectionSize; level++) p.complete(level, 10, 3);
    p.openDoor(1);
    for (const s of doorSections()){
      equal(p.isDoorOpen(s), s === 1, `chapter ${s + 1} should${s === 1 ? '' : ' not'} be open`);
    }
  });

  it('will not sell a way past a shut door', () => {
    /* Paying past a board is for a board you cannot beat. A shut door is not a
       board you cannot beat, it is the next chapter not being open yet — and a
       purse charged for one would come back holding a level it still could not
       enter, with nothing to say why. */
    const p = fresh();
    for (let level = 1; level <= CONFIG.sectionSize; level++) p.complete(level, 10, 3);
    const before = p.gold;
    equal(p.buyUnlock(CONFIG.sectionSize + 1, 0), false, 'the door is not for sale');
    equal(p.gold, before, 'and nothing was taken for it');
  });

  it('does not hand over a chapter\'s tools while its door is shut', () => {
    /* The frontier steps into a chapter the moment the one before it is
       finished. Reading the grant off that alone would give away the chapter's
       tools through the thing meant to be guarding it. */
    const p = fresh();
    for (let level = 1; level <= CONFIG.sectionSize; level++) p.complete(level, 10, 3);
    equal(p.perks().hint, false, 'chapter two grants the hint, and chapter two is shut');
    p.openDoor(1);
    equal(p.perks().hint, true, 'and now it does not');
  });

  it('lets a save from before the doors keep the chapters it had walked into', () => {
    const store = Progress.memoryStorage();
    /* Written by hand, exactly as the old code would have left it: a frontier
       well into the run and no doors field at all. */
    store.setItem(Progress.SAVE_KEY, JSON.stringify({
      version: 1, layout: CONFIG.layout, unlocked: 35, gold: 100,
      stars: { 1: 3 }, best: {}, pars: {}, claimed: {}, seen: {}
    }));
    const p = Progress.createProgress(store);
    assert(p.isUnlocked(35), 'the level they were standing on is still theirs');
    for (let s = 1; s <= Levels.sectionOf(35); s++){
      assert(p.isDoorOpen(s), `chapter ${s + 1} was already walked into`);
    }
    /* And no further. The migration is for what was already passed, not an
       amnesty on the rest of the run. */
    assert(!p.isDoorOpen(Levels.sectionOf(35) + 1), 'the next one is still to be opened');
  });

  it('opens nothing for a new player', () => {
    /* The same absence of a doors field, on a save that has been nowhere. The
       migration keys off the frontier rather than off a version number, so this
       is the case that says it keys off it correctly. */
    const store = Progress.memoryStorage();
    store.setItem(Progress.SAVE_KEY, JSON.stringify({ version: 1, layout: CONFIG.layout, unlocked: 1 }));
    const p = Progress.createProgress(store);
    for (const s of doorSections()) assert(!p.isDoorOpen(s), `chapter ${s + 1} should be shut`);
  });

  it('survives a doors field that somebody mangled', () => {
    /* Every other record in the save is guarded against this and doors is a
       record like the rest. An array is the shape that gets all the way
       through: `doors: [true]` would answer isDoorOpen(0) with true forever. */
    for (const bad of [null, [true, true], 'yes', 7]){
      const store = Progress.memoryStorage();
      store.setItem(Progress.SAVE_KEY, JSON.stringify({
        version: 1, layout: CONFIG.layout, unlocked: 1, doors: bad
      }));
      const p = Progress.createProgress(store);
      assert(!p.isDoorOpen(1), `doors: ${JSON.stringify(bad)} should not open a chapter`);
      assert(p.isDoorOpen(0), 'and the first chapter has no door to open');
    }
  });

  it('remembers an opened door across a reload', () => {
    const store = Progress.memoryStorage();
    const p = Progress.createProgress(store);
    for (let level = 1; level <= CONFIG.sectionSize; level++) p.complete(level, 10, 3);
    p.openDoor(1);
    const again = Progress.createProgress(store);
    assert(again.isDoorOpen(1), 'a door that has been got through stays got through');
    assert(again.isUnlocked(CONFIG.sectionSize + 1));
  });

  it('puts a door on the road between the chapters, and nowhere else', () => {
    /* The map walks a list of stops rather than a list of levels now. What it
       must never do is drift: a door one place out puts every medallion after it
       under the wrong number. */
    const size = CONFIG.sectionSize;
    const stops = MapGeom.stops(size + 4, 0, 120);
    const levels = stops.filter(s => s.level != null).map(s => s.level);
    equal(levels, Array.from({ length: size + 4 }, (_, i) => i + 1),
      'every level up to the frontier is still on the road, in order');

    const doors = stops.map((s, i) => (s.door != null ? i : -1)).filter(i => i >= 0);
    equal(doors.length, 1, 'one chapter boundary is in range, so one door');
    equal(stops[doors[0]].door, 1);
    /* immediately between the last board of one chapter and the first of the next */
    equal(stops[doors[0] - 1].level, size);
    equal(stops[doors[0] + 1].level, size + 1);
  });

  it('draws no door in front of the first chapter', () => {
    const stops = MapGeom.stops(3, 0, 120);
    equal(stops.filter(s => s.door != null).length, 0, 'chapter one is walked into');
  });
});
