/* What the end-of-run panel should say, as a decision rather than a pile of DOM
   writes. The app does the writing; this decides.

   Split out because the interesting cases are the ones hardest to reach by hand:
   the last level of the graded game, a failed run with an empty purse, a board
   nobody can crack. Reaching any of them in a browser means actually playing a
   level, and the pours are animated, so a hidden or throttled tab cannot get
   there at all. Everything here is decided from numbers, so the cases can simply
   be asserted. */
import { CONFIG } from './00-config.js';

export const Panel = (() => {
  /* The one thing worth saying to an empty purse, and the way out of it. Named
     rather than typed twice: the card shown before a replay refuses for the same
     reason and has to refuse in the same words. */
  const BROKE = 'Not enough gold. The daily draught is on the map.';

  function decide(input){
    const {
      level, lastLevel, failed, stars, nextUnlocked, doorNext,
      canPayFee, canPayNext, canPaySkip, canPayBlast,
    blastGranted, blastUsed, blastTargets,
      improvedStars, hadStars, par, parExact, moves, best, totalStars,
      reason
    } = input;

    const perfect = stars === 3;
    /* There is nothing past the graded range: a level with no par cannot be
       scored, and rate() awards full marks when it has no bar to measure against,
       so offering one would hand out a run that can neither be failed nor played
       badly. */
    const atEnd = level >= lastLevel;
    const stuck = !atEnd && failed && !nextUnlocked;

    /* A lost run says so plainly and then says why. Leading with the reason alone
       read as a remark about the board rather than as the run being over. */
    const title = !failed ? (perfect ? 'Poured clean' : 'Level cleared') : 'Failed';
    const because = reason === 'stuck' ? 'You are out of valid moves.'
      : reason === 'short' ? 'What is left needs more pours than the run had.'
      : `That is ${moves} pours against a minimum of ${par}.`;

    /* Two fees, not one, because the panel offers two different boards.

       Retry deals this level again and Next deals the following one, and those
       cost different amounts: a level already beaten replays for nothing, so once
       a run is cleared `canPayFee` is always true. Deciding Next from it meant the
       button was never disabled after a win however empty the purse, and pressing
       it fell through to the guard in the click handler, which refused silently.
       Nothing was stolen and nothing was dealt; the button simply lied. */
    /* The blast, and the four things that all have to be true before it is even
     drawn. It rescues a run, so it is only ever on a failed one; it is once a
     run; it arrives in a chapter like every other tool; and it is offered only
     when some bottle on the shelf would bring the board back alive.

     That last one is the whole point of deciding it here. The three endings are
     not equally rescuable — a blast always lowers the work left so it answers
     `short`, it sometimes opens a move so it sometimes answers `stuck`, and it
     can do nothing whatever about `over`, where the pours are simply spent. The
     caller works out which bottles qualify by applying the blast to a copy and
     asking the same function that ended the run; what arrives here is how many
     of them there were. Offering a rescue that cannot rescue anything is worse
     than not offering one.

     A count and not a list, because nothing here needs to know which bottles
     they were, and a decision function that took the shelf would be one that had
     to understand pouring. */
  const blastHidden = !failed || !blastGranted || !!blastUsed || !(blastTargets > 0);
  const blastDisabled = !canPayBlast;

  const nextHidden = atEnd || (failed && !nextUnlocked);
    /* The way on is a cellar door rather than a board, so it is offered as one:
       free, and named for the gate. See 17-casks.md. Never on a failed run,
       which has a board to beat or pay past first: that is `stuck` above. */
    const nextIsDoor = !nextHidden && !!doorNext;
    const cannotGoOn = (!nextHidden && !nextIsDoor && !canPayNext) || (stuck && !canPaySkip);

    /* Last writer wins, so the order is the priority order. Being told the game is
       over does not help someone who cannot afford another go, so an empty purse
       outranks it; a new best outranks the standing advice. */
    let hint = failed && par != null ? `Clear it in ${par + CONFIG.stars.one} or fewer.` : '';
    if (!failed && improvedStars && hadStars > 0) hint = 'High score!';
    if (atEnd && canPayFee){
      hint = failed
        ? 'The last one. Another go?'
        : `That is the last of them. ${totalStars} stars from ${lastLevel} levels.`;
    }
    /* Said only when the offer is real and payable, and before the empty purse
     line so an empty purse still outranks it: somebody who cannot afford another
     go does not need to hear about a dearer way out first. */
  if (!blastHidden && canPayBlast) hint = 'A blast would leave this board winnable.';
  if (!canPayFee || cannotGoOn) hint = BROKE;

    /* Matching the minimum is the whole point of the scoring, so say that and stop.
       Quoting the count twice ("sorted in 12 pours, the minimum is 12") makes the
       reader do the comparison the sentence was supposed to make for them. */
    const atPar = !failed && parExact && par != null && moves === par;
    const parLine = par == null ? ''
      : parExact ? ` The minimum is ${par}.`
      : ` The best found is about ${par}.`;
    const bestLine = !failed && best != null && best < moves ? ` Your best here is ${best}.` : '';
    const line = failed ? because
      : atPar ? 'Solved in the minimum moves.'
      : `Sorted in ${moves} pours.${parLine}${bestLine}`;

    return {
      atEnd,
      title,
      line,
      stuck,
      retryHidden: perfect,
      retryPrimary: !perfect,
      retryDisabled: !canPayFee,
      nextHidden,
      nextIsDoor,
      nextPrimary: perfect && !atEnd,
      /* a door has no fee, so an empty purse is no reason to refuse one */
      nextDisabled: nextIsDoor ? false : !canPayNext,
      skipHidden: !stuck,
      skipDisabled: !canPaySkip,
    blastHidden,
    blastDisabled,
      hint
    };
  }

  return { decide, BROKE };
})();
