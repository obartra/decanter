import { describe, it, assert, equal, loadPure } from './helpers.mjs';

const { Chapters, Levels, Progress, CONFIG } = loadPure();
const fresh = () => Progress.createProgress(Progress.memoryStorage());

/* Playing forward, the way the game is actually walked now: a chapter is not
   handed over when the last board of the one before it falls, it is entered
   through the floor of casks standing in front of it. A fixture that only
   called complete() would stop dead at level 11 with the frontier there and
   nothing open, which is the game working rather than the test being wrong. */
function playTo(p, last){
  for (let level = 1; level <= last; level++){
    p.openDoor(Levels.sectionOf(level));
    p.complete(level, 10, 3);
  }
  return p;
}

describe('chapters', () => {
  it('opens with one tool and hands over the rest a chapter at a time', () => {
    /* the point of the whole arrangement: the first minute is not as open as
       the game will ever be */
    const first = Chapters.perksFor(0);
    assert(first.undo, 'the first chapter has to leave something to play with');
    assert(!first.hint, 'but not everything');
    assert(!first.vessel);

    const second = Chapters.perksFor(1);
    assert(second.undo && second.hint, 'each chapter keeps what the last one gave');
    assert(!second.vessel);

    assert(Chapters.perksFor(2).vessel, 'and adds one of its own');
  });

  it('never takes anything back', () => {
    const keys = ['undo', 'hint', 'vessel'];
    for (let s = 1; s < Chapters.count + 3; s++){
      const before = Chapters.perksFor(s - 1), now = Chapters.perksFor(s);
      for (const k of keys){
        assert(!before[k] || now[k], `chapter ${s} took away ${k}`);
      }
      assert(now.freeUndos >= before.freeUndos, `chapter ${s} reduced the free undos`);
      assert(now.hintCost <= before.hintCost, `chapter ${s} made hints dearer`);
      assert(now.freeHints >= before.freeHints, `chapter ${s} reduced the free hints`);
    }
  });

  it('deepens what an earlier chapter introduced', () => {
    const base = Chapters.perksFor(0), later = Chapters.perksFor(3);
    equal(later.freeUndos, base.freeUndos + 2, 'the conservatory adds two free undos');
    assert(Chapters.perksFor(4).hintCost < CONFIG.economy.hint, 'the vault makes hints cheaper');
    equal(Chapters.perksFor(5).freeHints, 1, 'the observatory gives one a run');
  });

  it('runs out of new things to say without running out of game', () => {
    /* there are more levels than named chapters, so the ones past the end must
       hold what was granted rather than reset it or fall over */
    const last = Chapters.perksFor(Chapters.count - 1);
    for (const beyond of [Chapters.count, Chapters.count + 5, 40]){
      equal(Chapters.perksFor(beyond), last, `section ${beyond} should hold the last grant`);
      equal(Chapters.at(beyond), null, 'and has no opening of its own to show');
    }
  });

  it('says something about every chapter it names', () => {
    for (let s = 0; s < Chapters.count; s++){
      const c = Chapters.at(s);
      assert(c && c.blurb && c.blurb.length > 20, `chapter ${s} has nothing to say`);
      assert(Chapters.GRANT_NAMES[c.grant], `chapter ${s} grants ${c.grant}, which has no name`);
      assert(Levels.sectionName(s * CONFIG.sectionSize + 1), `chapter ${s} has no name`);
    }
    assert(Chapters.count <= CONFIG.sectionNames.length,
      'a chapter that grants something must have a name to grant it under');
  });

  it('gives the player what they have reached, not what is in front of them', () => {
    /* going back to an early board must not take the tools away again */
    const p = playTo(fresh(), 25);
    assert(p.perks().vessel, 'someone who has reached the distillery keeps the vessel');
    equal(p.perks().vessel, Chapters.perksFor(Levels.sectionOf(p.unlocked)).vessel);
  });

  it('shows a chapter opening once and then never again', () => {
    const p = fresh();
    assert(!p.hasSeen(0), 'nothing has been read yet');
    assert(p.markSeen(0), 'the first time counts');
    assert(p.hasSeen(0));
    assert(!p.markSeen(0), 'the second time does not');
  });

  it('remembers what was read across a reload', () => {
    const store = Progress.memoryStorage();
    Progress.createProgress(store).markSeen(2);
    assert(Progress.createProgress(store).hasSeen(2), 'an opening should not come back');
  });
});
