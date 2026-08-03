import { describe, it, assert, equal, loadPure } from './helpers.mjs';

const { Preview, Panel } = loadPure();
/* a two-star pour level, cleared, free to replay */
const base = {
  level: 10, stars: 2, best: 22, par: 20, parExact: true, bubble: false,
  goal: null, fee: 0, canPayFee: true, earned: 3
};
const decide = over => Preview.decide({ ...base, ...over });

describe('the card before a replay', () => {
  it('says what a better run is worth, which is the reason it exists', () => {
    const p = decide({});
    equal(p.payoutHidden, false);
    equal(p.earnedLabel, '+3');
    equal(p.why, 'Gold · for three stars');
  });

  it('withdraws the offer rather than offering nothing', () => {
    /* A board at three stars has paid everything it will ever pay. Saying that
       with a "+0" in the slot where the winnings go puts the best result in the
       game in the shape of a refusal, on exactly the levels the player did best
       on. Saying it in words underneath is the same refusal at greater length,
       so the card says neither: the star row has already said it. */
    const p = decide({ stars: 3, best: 20, earned: 0 });
    equal(p.payoutHidden, true);
    equal(p.hint, '', 'a card with nothing to advise should say nothing');
  });

  it('does not withdraw an offer it can still make', () => {
    for (const stars of [0, 1, 2]){
      equal(decide({ stars, earned: 3 }).payoutHidden, false, `${stars} stars still has a star to win`);
    }
  });

  it('names what three stars would take, in the units of the game being played', () => {
    equal(decide({}).hint, 'Three stars needs 20 pours.');
    equal(decide({ bubble: true, par: null, parExact: false, goal: 35 }).hint,
      'Three stars needs all 35 shots, or the board cleared.');
  });

  it('does not offer a target it cannot honor', () => {
    /* An estimated par scores nothing at all, so quoting it as the bar for three
       stars would name a number the run will refuse to measure against. */
    equal(decide({ par: 20, parExact: false }).hint, '');
    equal(decide({ par: null, parExact: false }).hint, '');
  });

  it('reads the record in the direction the level is graded', () => {
    /* fewest pours on one game, longest run on the other, and the sentence has
       to say which, because 35 is a good number on one and a poor one on the
       other */
    equal(decide({ best: 22 }).line, 'Best 22 pours.');
    equal(decide({ bubble: true, best: 35, par: null, parExact: false }).line,
      'Longest run 35 shots.');
  });

  it('does not quote the same number in two sentences', () => {
    /* The minimum and what three stars needs are the same fact on a pour board,
       and printing both is the reader being asked to make the comparison the
       card exists to make for them. */
    const p = decide({ best: 22, par: 20, parExact: true });
    equal(p.line, 'Best 22 pours.');
    equal(p.hint, 'Three stars needs 20 pours.');
  });

  it('keeps the minimum on the line when nothing below will say it', () => {
    /* a perfect board has no target left to name, so the bar goes back on the
       record or it goes unsaid altogether */
    equal(decide({ stars: 3, best: 22, earned: 0 }).line, 'Best 22 pours. The minimum is 20.');
    equal(decide({ stars: 3, best: 20, earned: 0 }).line, 'Best 20 pours, the minimum.',
      'matching the minimum is the whole point of the scoring, so it says that and stops');
  });

  it('does not claim a minimum it only estimated', () => {
    equal(decide({ best: 22, parExact: false }).line,
      'Best 22 pours. The best found is about 20.');
    equal(decide({ best: 22, par: null, parExact: false }).line, 'Best 22 pours.');
  });

  it('survives a save that kept the stars and lost the count', () => {
    const p = decide({ best: null });
    equal(p.line, 'Cleared, with no count recorded.');
    assert(!/null|NaN|undefined/.test(JSON.stringify(p)), `a hole leaked into the card: ${JSON.stringify(p)}`);
  });

  it('names the other game, and does not label the one every level is', () => {
    equal(decide({ bubble: true, par: null, parExact: false, goal: 35 }).kind, 'Bubble run');
    equal(decide({}).kind, '', 'labeling eight cards in ten "pour game" is furniture');
  });

  it('shows free as a price rather than as a blank', () => {
    equal(decide({ fee: 0 }).feeLabel, 'free');
    equal(decide({ fee: 5 }).feeLabel, '5 ◆');
    assert(/◆/.test(decide({ fee: 5 }).feeLabel), 'a number that is money carries the diamond');
  });

  it('refuses a board the purse cannot deal, in the words the panel uses', () => {
    /* the fee is nought today, so this only bites if replay is ever priced,
       which is exactly when a card that offered it anyway would be lying */
    const p = decide({ fee: 5, canPayFee: false });
    equal(p.playDisabled, true);
    equal(p.hint, Panel.BROKE);
  });

  it('an empty purse outranks the advice it would be useless to give', () => {
    const p = decide({ fee: 5, canPayFee: false, stars: 1, par: 20, parExact: true });
    equal(p.hint, Panel.BROKE, 'told them how to earn a star on a board it will not deal');
  });
});
