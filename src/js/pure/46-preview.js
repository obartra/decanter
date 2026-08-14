/* What the card shown before a replay should say, as a decision rather than a
   pile of DOM writes. Same split as 45-panel.js: the app does the writing.

   This card exists to answer the one question the map cannot, which is what is
   left in a level you have already beaten. A medallion is fifty pixels of
   circle and shows stars; it has no room for the count you managed, the minimum
   the board allows, or the number that actually decides whether going back is
   worth anything, which is what a better run would pay.

   That number is not guessable from the outside and it is not what anyone
   assumes. A level pays the *difference* between the rating it already has and
   the one you just earned, so a third star on a two-star board is worth three
   gold, and a perfect run on a board already at three stars is worth nothing at
   all. Before this, the only way to find that out was to play the level and be
   handed a +0. A card that shows a picture and says nothing about the gold is an
   extra tap in front of a button; the gold is what earns it its tap.

   Everything here is decided from numbers, so every case can be asserted rather
   than reached by clearing a level three different ways in a browser.

   Not in the critical bundle. This file and 06-preview.css are fetched right
   after the page opens, under the name `preview` in tools/build.mjs, because
   nothing here is reachable until somebody taps a medallion for a level they
   have already cleared. `showPreview` waits on that group before it draws.

   The still is not deferred with it. 78-still.js draws the small bottles on the
   shelf the blast offers too, and that shelf is opened mid-run.

   Closed over, the way every module here is except the one this was modeled on.
   All of these files are concatenated into a single script, so two of them
   declaring a top-level `decide` are one function and the later one wins, for
   the whole script, hoisting being what it is. That is not a clash anything
   reports: it quietly handed `Panel.decide` this function, and the end-of-run
   panel started titling itself "Level 1". A test in the build suite now says so
   before a browser has to. */
import { say } from './08-say.js';
import { Panel } from './45-panel.js';

export const Preview = (() => {
  function decide(input){
    const {
      level, stars, best, par, parExact, bubble, goal, fee, canPayFee, earned
    } = input;

    const perfect = stars >= 3;

    /* What a third star would take, which is the one thing the star row leaves
       unsaid. Named only where it is actually known: an estimated par is not a
       bar anything is scored against, so quoting it as a target would name a
       number this game will not honor. */
    const target = perfect ? null
      : bubble ? (goal == null ? null : `all ${goal} shots, or the board cleared`)
      : (parExact && par != null ? `${par} pours` : null);

    /* Nothing to offer is not the same as an offer of nothing.

       A board at three stars has paid out everything it will ever pay, and this
       card said so with a `+0` in the slot where the winnings go, which puts the
       best result in the game in the shape of a refusal, on the levels the
       player did best on.

       So the offer is not made at all: no winnings row, and no line underneath
       announcing the absence either. Announcing it is the same refusal at
       greater length, and the star row above has already said everything there
       is to say. What is left is what you did and the way back in. */
    const paidUp = !(earned > 0);
    let hint = target ? say('three-stars-needs', { n: target }) : '';

    /* What you did here, in the units the level is graded in. A bubble run is
       scored on how long it lasted and a pour level on how few pours it took, so
       "best" is the largest number on one and the smallest on the other, and the
       sentence has to say which it means rather than quoting a bare figure.

       The minimum is named here only when the line under it is not about to name
       it. Two sentences quoting the same number is the reader being asked to
       make a comparison the card was supposed to make for them, and on a board
       whose target is known those two sentences are the same fact twice. */
    const parClause = bubble || par == null || target ? ''
      : parExact ? ` ${say('the-minimum-is', { n: par })}`
      : ` The best found is about ${par}.`;
    const line = best == null ? 'Cleared, with no count recorded.'
      : bubble ? `Longest run ${best} shots.`
      /* Matching the minimum is the whole point of the scoring, so say that and
         stop, the way the end-of-run panel does. */
      : parExact && par != null && best <= par ? say('best-is-minimum', { n: best })
      : `${say('best-pours', { n: best })}${parClause}`;

    /* Last writer wins, so the order is the priority order. A price the purse
       cannot cover outranks anything else this line could say, because the board
       is not going to be dealt at all. */
    if (!canPayFee) hint = Panel.BROKE;

    return {
      title: `Level ${level}`,
      /* Which game this is, said only where it is news. Every level is the pour
         game unless it is not, and a label reading "pour game" on eight cards in
         ten is furniture. */
      kind: bubble ? 'Bubble run' : '',
      line,
      /* The winnings, and whether there are any to show at all */
      payoutHidden: paidUp,
      earnedLabel: `+${earned}`,
      why: `${say('gold')} · ${say('for-three-stars')}`,
      hint,
      /* Free is a price and says so. A blank where a fee goes reads as the fee
         being unknown rather than as there not being one. */
      feeLabel: fee > 0 ? `${fee} ◆` : 'free',
      playDisabled: !canPayFee
    };
  }
  return { decide };
})();
