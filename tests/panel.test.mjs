import { describe, it, assert, equal, loadPure } from './helpers.mjs';

const { Panel, CONFIG } = loadPure();
/* a cleared run, mid-game, with money in the purse */
const base = {
  level: 10, lastLevel: 120, failed: false, stars: 3, nextUnlocked: true,
  canPayFee: true, canPayNext: true, canPaySkip: true, improvedStars: false, hadStars: 0,
  par: 20, parExact: true, moves: 20, best: null, totalStars: 24
};
const decide = over => Panel.decide({ ...base, ...over });

describe('end of run panel', () => {
  it('offers the next level in the middle of the game', () => {
    const p = decide({});
    equal(p.nextHidden, false);
    equal(p.atEnd, false);
    assert(p.nextPrimary, 'a clean clear should point at the next level');
  });
  it('offers nothing past the last graded level', () => {
    /* the case that cannot be reached by hand: past the par table a run cannot
       be scored, so a next level would be unfailable and pay out forever */
    const p = decide({ level: 120 });
    equal(p.atEnd, true);
    equal(p.nextHidden, true, 'there is no next level to offer');
    equal(p.nextPrimary, false, 'and nothing to point at');
    equal(p.hint, 'That is the last of them. 24 stars from 120 levels.');
  });
  it('does not offer to buy past the last level either', () => {
    const p = decide({ level: 120, failed: true, stars: 0, nextUnlocked: false });
    equal(p.stuck, false, 'being stuck means there is something ahead to skip to');
    equal(p.skipHidden, true);
    equal(p.nextHidden, true);
    equal(p.hint, 'The last one. Another go?');
  });
  it('offers a way past a board that beat you', () => {
    const p = decide({ failed: true, stars: 0, nextUnlocked: false });
    equal(p.stuck, true);
    equal(p.skipHidden, false);
    equal(p.nextHidden, true, 'a failed run does not open the next level');
    equal(p.hint, `Clear it in ${base.par + CONFIG.stars.one} or fewer.`);
  });
  it('leaves a level you already own open after a failed replay', () => {
    /* The other half of the rule above, and the half nothing was checking: every
       other failed case here has the next level shut, so deciding nextHidden from
       `failed` alone passed the whole suite. Replaying a cleared level is free,
       so failing one is the cheapest way to reach this panel, and taking away a
       level already paid for would be the one move that leaves nothing to press. */
    const p = decide({ failed: true, stars: 0, nextUnlocked: true });
    equal(p.nextHidden, false, 'a level already open stays open after a failed replay');
    equal(p.skipHidden, true, 'nothing to buy past when the next one is already open');
    equal(p.stuck, false);
  });
  it('an empty purse outranks everything it would be cruel to say instead', () => {
    const broke = 'Not enough gold. The daily draught is on the map.';
    equal(decide({ canPayFee: false }).hint, broke, 'even on a clean clear');
    equal(decide({ level: 120, canPayFee: false }).hint, broke, 'even at the end of the game');
    equal(decide({ failed: true, stars: 0, nextUnlocked: false, canPayFee: false, canPaySkip: false }).hint,
      broke, 'and when both ways out are unaffordable');
  });
  it('reports a new best, but not on a first clear', () => {
    equal(decide({ improvedStars: true, hadStars: 2 }).hint, 'High score!');
    equal(decide({ improvedStars: true, hadStars: 0 }).hint, '',
      'a first clear is not an improvement on anything');
  });
  it('says the run matched the minimum, without making you check', () => {
    /* quoting the count twice, "sorted in 20 pours, the minimum is 20", makes the
       reader do the comparison the sentence exists to make for them */
    equal(decide({ moves: 20, par: 20 }).line, 'Solved in the minimum moves.');
    equal(decide({ moves: 22, par: 20 }).line, 'Sorted in 22 pours. The minimum is 20.');
  });
  it('does not claim a minimum it only estimated', () => {
    equal(decide({ moves: 20, par: 20, parExact: false }).line,
      'Sorted in 20 pours. The best found is about 20.');
  });
  it('mentions an earlier better run, but only when it was better', () => {
    equal(decide({ moves: 22, par: 20, best: 21 }).line,
      'Sorted in 22 pours. The minimum is 20. Your best here is 21.');
    equal(decide({ moves: 22, par: 20, best: 22 }).line,
      'Sorted in 22 pours. The minimum is 20.', 'matching your best is not beating it');
  });
  it('names what actually ended the run', () => {
    /* "too many pours" is true of only one of the three ways to lose, and would
       read as plainly wrong to anyone looking at a board with no legal pour */
    equal(decide({ failed: true, stars: 0, reason: 'stuck' }).title, 'Failed');
    equal(decide({ failed: true, stars: 0, reason: 'stuck' }).line, 'You are out of valid moves.');
    equal(decide({ failed: true, stars: 0, reason: 'short' }).line,
      'What is left needs more pours than the run had.');
    equal(decide({ failed: true, stars: 0, reason: 'over', moves: 42, par: 39 }).line,
      'That is 42 pours against a minimum of 39.');
    equal(decide({ stars: 3 }).title, 'Poured clean');
    equal(decide({ stars: 2 }).title, 'Level cleared');
  });
  it('says what it would take to clear it, whatever went wrong', () => {
    for (const reason of ['stuck', 'short', 'over']){
      equal(decide({ failed: true, stars: 0, reason, par: 20 }).hint,
        `Clear it in ${20 + CONFIG.stars.one} or fewer.`);
    }
  });
  it('does not claim a board was sorted when it was not', () => {
    /* a run can end nowhere near the finish, so the count it ended on says
       nothing about how well it went and must not be dressed up as a result */
    const p = decide({ failed: true, stars: 0, moves: 6, par: 39, reason: 'stuck' });
    assert(!/sorted/i.test(p.line), `a failed run must not claim it sorted anything: "${p.line}"`);
    assert(!/sorted/i.test(p.title), `nor in the title: "${p.title}"`);
  });
  it('hides retry only on a perfect run', () => {
    equal(decide({ stars: 3 }).retryHidden, true);
    equal(decide({ stars: 2 }).retryHidden, false);
    equal(decide({ stars: 0, failed: true }).retryHidden, false);
  });
  it('disables what cannot be paid for', () => {
    /* all three fees, named separately: retry, the next board and the skip are
       three different prices and an empty purse fails all of them */
    const p = decide({ canPayFee: false, canPayNext: false, canPaySkip: false,
                       failed: true, stars: 0, nextUnlocked: false });
    assert(p.retryDisabled && p.nextDisabled && p.skipDisabled, 'nothing affordable should be clickable');
  });

  it('refuses the next board when the purse cannot pay for that board', () => {
    /* The bug this pins: retry and next are two different fees. A cleared level
       replays for nothing, so `canPayFee` is true for the rest of the run, and
       deciding next from it left the button enabled on an empty purse. It then
       fell through to the guard in the click handler and refused silently, which
       is a button that lies rather than one that is disabled. */
    const p = decide({ canPayFee: true, canPayNext: false });
    equal(p.nextDisabled, true, 'offered a board the purse cannot pay for');
    equal(p.retryDisabled, false, 'a free replay is still affordable');
    assert(/Not enough gold/.test(p.hint), 'said nothing about why next is dead');
  });

  it('does not cry poverty about a board it is not offering', () => {
    /* past the last level there is no next board, so being unable to afford one
       is not a thing worth telling anybody */
    const p = decide({ level: 120, canPayNext: false });
    equal(p.nextHidden, true);
    assert(!/Not enough gold/.test(p.hint),
      'warned about the price of a button that is not on screen');
  });

  /* ---- the last board of a chapter ----

     The one place where going on and dealing the next level are different acts.
     A cellar door stands between them; it is not graded, it costs nothing, and
     nothing about it is for sale. Everything here is about the panel offering
     the gate rather than the board behind it, which is what it did not do: Next
     dealt the first board of the shut chapter and walked straight through. */
  const atBoundary = over => decide({ doorNext: true, nextUnlocked: false, ...over });

  it('offers the door rather than the board behind it', () => {
    const p = atBoundary({});
    equal(p.nextHidden, false, 'a cleared board still has a way on');
    equal(p.nextIsDoor, true, 'and the way on is the gate');
  });

  it('never prices a door', () => {
    /* A door has no fee, so an empty purse is not a reason to refuse one, and
       must not be reported as one either. This is the whole difference between
       a gate and a toll, made in the one place a player meets it. */
    const p = atBoundary({ canPayNext: false, canPayFee: true });
    equal(p.nextDisabled, false, 'a door cannot be too dear');
    assert(!/Not enough gold/.test(p.hint), 'warned about a price the door does not have');
  });

  it('does not call an ordinary next level a door', () => {
    equal(decide({}).nextIsDoor, false);
    equal(decide({ doorNext: false }).nextIsDoor, false);
    equal(decide({ doorNext: true, level: 120 }).nextIsDoor, false,
      'past the last level there is nothing to go on to, gate or otherwise');
  });

  it('offers the board to be paid past before it offers the door', () => {
    /* Failing the last board of a chapter does not reach the gate: the frontier
       has not passed the board yet. What is offered is the board, at the price
       any board is paid past for, and the gate comes after it. */
    const p = atBoundary({ failed: true, stars: 0 });
    equal(p.stuck, true);
    equal(p.skipHidden, false, 'the board in the way is still for sale');
    equal(p.nextHidden, true);
    equal(p.nextIsDoor, false, 'nothing to go on to until that board is behind you');
  });

  /* The offer to be told a board is beating somebody. Every one of these is a
     way to get it wrong that costs more than it saves: asking somebody who is
     winning, asking again after they said no, or never asking at all because the
     kind of failure that matters most is also the rarest. */
  const losing = { failed: true, stars: 0, nextUnlocked: false, reason: 'over' };
  it('says nothing until a board has actually been beating somebody', () => {
    equal(decide({ ...losing, lostHere: 4 }).reportHidden, true, 'four losses is still playing');
    equal(decide({ ...losing, lostHere: 5 }).reportHidden, false, 'five is stuck');
  });
  it('counts a dead end twice, because it is the one no care avoids', () => {
    /* Three dead ends should reach the same bar as five ordinary losses: it is
       the failure the board selection is measured against, so it is the one
       most worth hearing about. */
    equal(decide({ ...losing, lostHere: 3, bricksHere: 2 }).reportHidden, false);
    equal(decide({ ...losing, lostHere: 2, bricksHere: 1 }).reportHidden, true,
      'three losses with one dead end is not enough on its own');
  });
  it('never asks somebody who just won', () => {
    /* The counts are per level and survive a clear, so a player who struggled
       and then beat it would otherwise be asked on the run that went well. */
    equal(decide({ lostHere: 9, bricksHere: 4 }).reportHidden, true);
  });
  it('does not ask twice', () => {
    equal(decide({ ...losing, lostHere: 20, alreadyAsked: true }).reportHidden, true);
  });
  it('says nothing about it on a board nobody has lost', () => {
    equal(decide({ ...losing }).reportHidden, true, 'absent counts must not read as trouble');
  });

  it('keeps retry and next disabled independently', () => {
    const broke = decide({ canPayFee: false, canPayNext: false });
    equal(broke.retryDisabled, true);
    equal(broke.nextDisabled, true);
    const onlyNext = decide({ canPayFee: false, canPayNext: true });
    equal(onlyNext.retryDisabled, true);
    equal(onlyNext.nextDisabled, false, 'one fee must not decide the other');
  });
});
