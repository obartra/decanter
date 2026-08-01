/* What the end-of-run panel should say, as a decision rather than a pile of DOM
   writes. The app does the writing; this decides.

   Split out because the interesting cases are the ones hardest to reach by hand:
   the last level of the graded game, a failed run with an empty purse, a board
   nobody can crack. Reaching any of them in a browser means actually playing a
   level, and the pours are animated, so a hidden or throttled tab cannot get
   there at all. Everything here is decided from numbers, so the cases can simply
   be asserted. */
function decide(input){
  const {
    level, lastLevel, failed, stars, nextUnlocked,
    canPayFee, canPaySkip, improvedStars, hadStars, par, parExact, moves, best, totalStars
  } = input;

  const perfect = stars === 3;
  /* There is nothing past the graded range: a level with no par cannot be
     scored, and rate() awards full marks when it has no bar to measure against,
     so offering one would hand out a run that can neither be failed nor played
     badly. */
  const atEnd = level >= lastLevel;
  const stuck = !atEnd && failed && !nextUnlocked;

  /* Last writer wins, so the order is the priority order. Being told the game is
     over does not help someone who cannot afford another go, so an empty purse
     outranks it; a new best outranks the standing advice. */
  let hint = failed && par != null ? `Clear it in ${par + CONFIG.stars.one} or fewer.` : '';
  if (!failed && improvedStars && hadStars > 0) hint = 'New best for this level.';
  if (atEnd && canPayFee){
    hint = failed
      ? 'The last one. Another go?'
      : `That is the last of them. ${totalStars} stars from ${lastLevel} levels.`;
  }
  if (!canPayFee || (stuck && !canPaySkip)) hint = 'Not enough gold. The daily draught is on the map.';

  /* Matching the minimum is the whole point of the scoring, so say that and stop.
     Quoting the count twice ("sorted in 12 pours, the minimum is 12") makes the
     reader do the comparison the sentence was supposed to make for them. */
  const atPar = !failed && parExact && par != null && moves === par;
  const parLine = par == null ? ''
    : parExact ? ` The minimum is ${par}.`
    : ` The best found is about ${par}.`;
  const bestLine = !failed && best != null && best < moves ? ` Your best here is ${best}.` : '';
  const line = atPar
    ? 'Solved in the minimum moves.'
    : `Sorted in ${moves} pours.${parLine}${bestLine}`;

  return {
    atEnd,
    line,
    stuck,
    retryHidden: perfect,
    retryPrimary: !perfect,
    retryDisabled: !canPayFee,
    nextHidden: atEnd || (failed && !nextUnlocked),
    nextPrimary: perfect && !atEnd,
    nextDisabled: !canPayFee,
    skipHidden: !stuck,
    skipDisabled: !canPaySkip,
    hint
  };
}
globalThis.Panel = { decide };
