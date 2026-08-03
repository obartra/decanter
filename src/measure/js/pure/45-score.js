/* What a run was worth, and the one place in this game that disagrees with both
   of the others on purpose.

   THIS GAME IS GRADED BY EXACT PAR. The bubble game is not, and 45-score.js over
   there says why: "the next bubble is dealt at random, so the board is not
   perfect information, and the aim discretises to about thirty landing cells
   across a run of thirty-odd shots. There is nothing to search." So it grades
   against a measured distribution of run lengths instead, which is a real claim
   about a real thing, just a different kind of thing than par.

   NONE OF THAT ARGUMENT APPLIES HERE, and the next reader will assume it does,
   because the two games sit in the same repository with the same shape of score
   module. So, plainly: this board is perfect information. Nothing is dealt after
   the first pour, nothing is hidden, and the whole reachable state space is a
   few thousand positions that 25-search.js walks exhaustively in about a
   millisecond. The minimum is not estimated, sampled, or set at a percentile of
   anything. It is found, it is committed to 35-pars.js, and a run is graded by
   how far it landed from it. A distribution would be the wrong instrument
   entirely: it would grade the player against other players' luck on a board
   where there is no luck.

   ---- THE INVERSION, which is the other thing to hold onto ----

   src/js/20-rules.js Rules.rate() returns FULL MARKS when par is null or
   inexact. That is right over there and it is documented in
   docs/design/03-par.md: its search can genuinely fail on a big board, an
   inexact par is an upper bound rather than a minimum, and a bad estimate that
   could FAIL a run would end somebody's level for the search's shortcomings
   rather than their own. Given a choice between two wrongs it picks the generous
   one, and then clamps the graded game to the length of its par table so the
   generous path is never actually reached in normal play.

   THIS SCORER RETURNS ZERO STARS FOR AN UNKNOWN PAR. Exactly the other way
   round, and for three reasons:

     There is no economy here. The reason full marks is dangerous over there is
     that stars are gold and an ungradeable level would mint it forever. There is
     nothing to mint. So the cost of being strict is that somebody sees "unrated"
     on a board past the end of the table, which is true and is what they should
     see.

     A failed search here is not an ordinary event. Par is exact or it is
     nothing: the state space is small enough that the search either walks all of
     it or the board is broken. So an unknown par is not "we ran out of budget on
     a hard board", it is "something is wrong", and answering "three stars" to
     that is answering a question that was not asked.

     Most of all: three stars means THIS RUN MATCHED THE MINIMUM. Awarding it
     when the minimum is unknown is the program stating, in the most emphatic way
     it has, something it does not know. An unrated board must read as unrated,
     and the page says so in those words rather than showing three gilt stars
     over a board nobody has ever measured. */
import { MeasureConfig } from './00-config.js';

export const MeasureScore = (() => {
  const C = MeasureConfig;

  /* Stars for a finished board: par earns three, one over earns two, two over
     earns one, three or more over earns nothing.

     `par == null` covers both an unreachable target and a search that gave up,
     and both come back zero. See the note above; this is the line the whole
     header is about. */
  function stars(moves, par, aided){
    if (par == null || !Number.isInteger(par)) return 0;
    const over = moves - par;
    const earned = over <= C.STARS.three ? 3
      : over <= C.STARS.two ? 2
      : over <= C.STARS.one ? 1
      : 0;
    return aided ? Math.min(earned, C.AID_CAP) : earned;
  }

  /* Whether this board can be graded at all. One question asked in one place, so
     the HUD, the end panel and the scorer cannot come to different conclusions
     about the same board — which is how a page ends up saying "unrated" at the
     top and "perfect" at the bottom. */
  const rated = par => par != null && Number.isInteger(par);

  /* Pours left before the run stops being worth anything. Null when the board is
     unrated, because there is no bar to run out of.

     The board is NOT locked when this reaches zero, which is where this parts
     company with the other game. Over there a run past par + 2 is over, because
     a board dealt costs gold and a failed run has to have a price or failing
     costs nothing. Here nothing was paid, undo is right there, and locking a
     perfect information puzzle somebody can still see the answer to would be
     taking the board away at the exact moment they were about to work it out.
     So it counts down, it reaches nothing, and the player carries on unrated. */
  function left(moves, par){
    if (!rated(par)) return null;
    return Math.max(0, par + C.STARS.one + 1 - moves);
  }

  /* Best is the FEWEST pours here, the way it is in the pour game, and the
     opposite of the bubble game where best is the longest run. Both are "best"
     and they compare in opposite directions, which is the kind of difference
     that survives a review and then quietly records the worst run of every level
     forever. Anything comparing two results goes through this. */
  const better = (a, b) => (a == null ? b : b == null ? a : Math.min(a, b));

  return { stars, rated, left, better };
})();
