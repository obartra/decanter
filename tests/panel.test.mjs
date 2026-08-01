import { describe, it, assert, equal, loadPure } from './helpers.mjs';

const { Panel, CONFIG } = loadPure();
/* a cleared run, mid-game, with money in the purse */
const base = {
  level: 10, lastLevel: 120, failed: false, stars: 3, nextUnlocked: true,
  canPayFee: true, canPaySkip: true, improvedStars: false, hadStars: 0,
  par: 20, totalStars: 24
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
  it('an empty purse outranks everything it would be cruel to say instead', () => {
    const broke = 'Not enough gold. The daily draught is on the map.';
    equal(decide({ canPayFee: false }).hint, broke, 'even on a clean clear');
    equal(decide({ level: 120, canPayFee: false }).hint, broke, 'even at the end of the game');
    equal(decide({ failed: true, stars: 0, nextUnlocked: false, canPayFee: false, canPaySkip: false }).hint,
      broke, 'and when both ways out are unaffordable');
  });
  it('reports a new best, but not on a first clear', () => {
    equal(decide({ improvedStars: true, hadStars: 2 }).hint, 'New best for this level.');
    equal(decide({ improvedStars: true, hadStars: 0 }).hint, '',
      'a first clear is not an improvement on anything');
  });
  it('hides retry only on a perfect run', () => {
    equal(decide({ stars: 3 }).retryHidden, true);
    equal(decide({ stars: 2 }).retryHidden, false);
    equal(decide({ stars: 0, failed: true }).retryHidden, false);
  });
  it('disables what cannot be paid for', () => {
    const p = decide({ canPayFee: false, canPaySkip: false, failed: true, stars: 0, nextUnlocked: false });
    assert(p.retryDisabled && p.nextDisabled && p.skipDisabled, 'nothing affordable should be clickable');
  });
});
