/* What a run was worth.

   THIS GAME IS GRADED BY EXACT PAR. The bubble game is not, and its 45-score.js
   says why: "the next bubble is dealt at random, so the board is not perfect
   information, and the aim discretizes to about thirty landing cells across a
   run of thirty-odd shots. There is nothing to search." That is a real claim
   about a real thing, and it grades against a measured distribution of run
   lengths instead, which is a different kind of exact.

   NONE OF THAT ARGUMENT APPLIES HERE, and the next reader will assume it does,
   because the games sit in one repository with the same shape of score module.
   So, plainly:

   A cellar floor is PERFECT INFORMATION. Every cask is on the board at the deal,
   nothing is dealt afterwards, nothing is hidden, and there is no randomness
   anywhere in play — the same board is the same board for everybody, forever.
   The whole reachable state space is a few thousand positions and 25-search.js
   walks all of it. The minimum is not estimated, sampled, or set at a percentile
   of anything: it is found by an exhaustive sweep in tools/casks-field.mjs,
   committed to 35-pars.js beside the board it belongs to, and a run is graded by
   its distance from it. A distribution would be the wrong instrument entirely.
   It would grade the player against other players' luck on a board where there
   is no luck.

   ---- THE INVERSION ----

   src/js/20-rules.js `Rules.rate()` returns FULL MARKS when par is null or
   inexact. This returns ZERO STARS. Exactly the other way round, and on purpose.

   That default is right over there and docs/design/03-par.md explains it: the
   pour game's search can genuinely run out of budget on a big board, an inexact
   par is an UPPER BOUND rather than a minimum, and grading against one could
   FAIL a run for the search's shortcomings rather than the player's. Given two
   wrongs it takes the generous one, and then clamps the graded game to the
   length of its par table so the generous path is never reached in normal play.

   Here every one of those conditions is absent:

     Nothing is minted by being strict. There is no economy on this page, so a
     generous default buys nobody anything; the whole cost of refusing is that
     somebody sees the word "unrated", which is true.

     Par is not an estimate that might be a little high. It is a lookup in a
     table written by a sweep that visited every reachable position. There is no
     "roughly par" here to be charitable about.

     And a missing par means something is WRONG rather than that a board was
     hard. Boards and pars ship together out of the same measurement, so a board
     with no par is the two tables having come apart — a regenerated 32-boards.js
     committed without its 35-pars.js, most likely. Full marks would turn that
     into a game that pays three stars on every level and looks entirely healthy
     while doing it.

     Most of all: three stars means THIS RUN MATCHED THE MINIMUM. Awarding it
     when the minimum is unknown is the program stating, in the most emphatic way
     it has, something it does not know. So the board is still dealt, still
     played, and reads `unrated` where par would be. */
import { CasksConfig } from './00-config.js';

export const CasksScore = (() => {
  const C = CasksConfig;

  /* Stars for a finished board: par earns three, one over earns two, two over
     earns one, three or more earns nothing.

     `par == null` is the line the whole header is about. */
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
     the bar, the end panel and the scorer cannot reach different conclusions
     about the same board — which is how a page ends up saying "unrated" at the
     top and "perfect" at the bottom. */
  const rated = par => par != null && Number.isInteger(par);

  /* Moves left before the run stops being worth anything, or null on an unrated
     board because there is no bar to run out of.

     The board is NOT locked when this reaches zero, the same call the measure
     makes. Over in the pour game a run past par + 2 ends, because a board dealt
     costs gold and failing has to have a price. Nothing was paid here, undo is
     right there, and locking a perfect information puzzle at the moment somebody
     is working it out would be taking the board away for no reason. It counts
     down, reaches nothing, and play carries on unrated. */
  function left(moves, par){
    if (!rated(par)) return null;
    return Math.max(0, par + C.STARS.one + 1 - moves);
  }

  /* Best is the FEWEST moves, as it is in the pour game and the measure, and the
     opposite of the bubble game where best is the LONGEST run. Both are "best"
     and they compare in opposite directions, which is exactly the kind of
     difference that survives a review and then quietly records the worst run of
     every board forever. Anything comparing two results goes through this. */
  const better = (a, b) => (a == null ? b : b == null ? a : Math.min(a, b));

  return { stars, rated, left, better };
})();
