/* Tunables for the bubble game. Pure data, safe to load anywhere.

   All geometry is in world units where the bubble diameter is 1 and y increases
   downward from the top left of the playfield. Nothing in game state is ever a
   pixel: there is exactly one transform, in 60-view.js, and everything else
   works in world units. A game whose state is measured in pixels has to be
   rewritten every time the window changes size. */
export const BubbleConfig = {
  /* Every row holds the same number of cells, both parities. The alternative,
     rows of COLS and COLS-1, cannot survive a parity flip on advance: a bubble
     in the last column of a wide row has nowhere to go when that row becomes a
     narrow one, and you end up writing an eviction rule for a situation that
     should not be able to arise. The cost is a half bubble of wall gap that
     alternates sides, which nobody has ever noticed in this genre. */
  COLS: 10,
  ROWS: 18,
  /* A fixed row index, never a pixel line. Compared against the grid, so it
     cannot drift with the viewport. */
  DEATH_ROW: 15,

  /* Rows of touching circles sit sqrt(3)/2 apart, not 1. This is derived, not
     chosen: two touching unit circles offset by half a diameter differ by
     sqrt(1 - 0.25). Getting it wrong is the classic bug of the genre, and it
     shows up as bubbles that visibly touch refusing to pop together. */
  ROW_H: Math.sqrt(3) / 2,

  MATCH_MIN: 3,

  /* Contact at 0.95 rather than a full diameter. A little forgiveness makes a
     near miss land where the player expected, but the value cannot be chosen
     freely: 0.866 is exactly the width of the gap a bubble can pass through
     between two neighbors, so a contact distance near it makes two
     indistinguishable shots behave differently. 0.95 sits clear of that
     threshold on both sides. */
  HIT_K: 0.95,
  /* Drawn slightly over half, so neighbors overlap a little and the art never
     shows a slit the physics will not let anything through. */
  DRAW_R: 0.51,

  /* Diameters per second. Feel only: the shot is resolved analytically at
     launch, so speed cannot change where a bubble lands. */
  SPEED: 20,

  /* From vertical, so ten degrees above horizontal on each side. Flatter than
     this and a shot skims the wall for the width of the board and lands
     somewhere nobody could have predicted. */
  AIM_CLAMP: 80 * Math.PI / 180,

  /* Safety valves on the segment solver. Neither should ever fire; if one does
     it is a geometry bug and the test suite should have caught it. */
  MAX_SEGMENTS: 32,

  /* The guide shows the first stretch of the path and one bounce. Showing the
     landing cell turns aiming from a judgement into a readout, which is why the
     games that have it sell it as a power up rather than giving it away. */
  GUIDE_LEN: 5,
  GUIDE_DOT_GAP: 0.7,
  GUIDE_DOT_R: 0.08,
  GUIDE_BOUNCES_DRAWN: 1,
  /* How fast the dots crawl along the path, in world units per second. This was
     effectively ten, which carried the pattern past its own 0.7 spacing about
     fourteen times a second: far too fast for an eye to resolve the dots at all,
     so the guide read as one solid line and the motion said nothing. It has to
     be slow enough to be seen moving, because the movement is what points. */
  GUIDE_SPEED: 1.8,

  /* Six liquids, solved for rather than borrowed.

     These were six of the pour game's twelve, picked one per hue family. That
     works for a shelf of bottles, where the colors are read one at a time and
     with a label under each. It does not work here, where the whole thing is
     telling six apart at a glance in a grid: the closest pair sat at 24.1 in
     CIEDE2000 and read as one color in play. The orange and the sand were the
     worst of it, with the red not far behind.

     So these are the answer to the actual question, which is "place six colors
     to maximize the smallest gap between any two". The closest pair here is 32.2,
     a third further apart than before, and no two share a hue family: blue,
     gold, coral, turquoise, purple, green.

     Two constraints on the search, and they are why this is not the highest
     number that could be reached. Chroma is banded, because unbanded the answer
     runs to the corners of sRGB and comes back with neon cyan, electric magenta
     and a near white, which is a bigger number and a different game's palette.
     And lightness is kept well above the board, which is near black, so each one
     reads as a lit bead rather than a hole.

     Borrowing was the right instinct and the wrong constraint: over every choice
     of six from the twelve as they were, the best available gap is 27.9, and it
     spends two of its six on teals. So the twelve were re-solved around these
     instead, and these are now CONFIG.palette indices 0 to 5 exactly: the two
     games are painted out of one set again, this time one built for the harder
     of the two jobs first.

     The two games have no module in common, so this still cannot import that one
     and the six are written out. A test asserts they match rather than trusting
     the comment. See tests/palette.test.mjs. */
  PALETTE: ['#FD685F', '#C99329', '#519B3D', '#3ED1D5', '#1887ED', '#C269D5'],
  /* The hatch that goes with each of those, for telling six bubbles apart
     without the color. Copied rather than imported for the same reason the six
     hexes above are: the two games share no module, and a test pins these
     against the pour game's first six so the pair cannot drift. Same shape as
     src/js/pure/07-patterns.js, which explains what the numbers mean. */
  PATTERNS: [[0, 0, 0], [1, 45, 8], [1, 135, 8], [1, 90, 8], [1, 0, 8], [1, 45, 16]],

  /* Every color in the palette gets dealt. This was five against a palette of
     six, so one of them was drawn on the board by nobody and existed only in the
     file. */
  COLORS: 6,

  /* Shots between the board coming down a row. This is what makes the death line
     a threat rather than a decoration: without it a player can take as long as
     they like and the line is never reached except by their own bad shots.

     Constant, and at the floor of what still measures the player: at a cadence
     of three the board wins whatever anyone does. There is no ramp any more
     because there is nothing left for one to do. The ramp existed to pull in the
     tail of an unbounded run so that its length could be graded at all, and a
     run that ends at RUN_SHOTS has no tail to pull in. */
  ADVANCE_EVERY: 4,

  /* How long a run is. Reaching it is a win, the way clearing the board is.

     The run used to be unbounded and could only end in a loss. Measured over 300
     seeds against a player who takes the shot the hint would offer but misses
     three times in ten, which is a nearer model of a person than the flawless
     bot the old thresholds were read off, that shape ran a median of 67 shots,
     ended in death 99% of the time, and reached the one star that unlocks the
     next level only 53% of the time. Long, then a loss, and then half the time
     nothing to show for it either.

     At this cadence the same player finishes all 35 shots 46% of the time and a
     good one 70%, while a player putting the bubble in any reachable cell at all
     never gets past 30. Thirty five is also where the
     board wins: the share of runs that reach 38 is barely half the share that
     reach 35, at every level of play, because the board passes the point where
     clearing keeps up with the drops. Ending the run on that edge is what makes
     finishing worth something. See tools/bubble-survival.mjs. */
  RUN_SHOTS: 35,

  /* Stars, from measured pass rates rather than percentiles of a bot nobody
     plays like. Over 300 seeds a competent run reaches the first on 98% of
     boards, the second on 83%, and finishes 46% of the time; one aiming at any
     reachable cell at all manages 19%, 0% and 0%.

     Those two rows are what put the bars where they are rather than at rounder
     numbers. Twenty five was the first choice and a player aiming at nothing in
     particular cleared it on a third of boards, which is not a bar, and the
     second star at thirty sat where the same player still got through 2% of the
     time. Both moved up until the gap between playing and flailing was the whole
     of it.

     The third is not written here. Finishing the run is the top grade by
     definition, so it is taken from RUN_SHOTS below and the two cannot drift
     apart. */
  STAR_SHOTS: { one: 28, two: 32 },

  /* Scoring. A bubble cut loose is worth more than one you matched, because
     cutting a chunk free is the shot worth aiming for. */
  SCORE_MATCH: 10,
  SCORE_CUT: 25,

  /* What the run is allowed to lean on, and what that costs it.

     The same split the other game makes, for the same reason. Its undo takes
     back one mistake and its hint names the move it would have played, and
     neither costs a star, because taking an optimal move is what earns stars in
     the first place. Its extra bottle does cost one, because from then on the
     board is easier than the number being scored against.

     So: undo, hint and swap leave the run gradeable, because none of them
     changes what the board deals. Picking a color outright does change it, and
     a run that used one is capped exactly the way a bought vessel is.

     The blast is the second of the second kind. It clears everything within one
     cell of where it lands, which is six bubbles before anything falls and
     nearer twenty after, so it plainly makes the board easier than the shot
     counts it is graded against — and being graded against measured percentiles
     is exactly why that has to be said. The cap is what lets those thresholds
     stand: tools/bubble-survival.mjs measures play with none of this, and an
     aided run never reaches the third star to be compared against it. So no
     re-measurement is owed for adding this, which is the whole reason the flag
     was worth having. */
  AID_CAP: 2,
  UNDO_DEPTH: 24,

  /* What is loaded when a blast has been bought. Not a color and never on the
     board, so it must not collide with BubbleGrid.EMPTY, which is -1: a sentinel
     that compared equal to an empty cell would have the shooter dealing holes. */
  BOMB: -2,

  /* How a cleared group leaves. Nothing is deleted in place: the group is
     knocked off the board and falls, so what a shot was worth is something the
     player watches come down rather than a gap that appears.

     The kick is outward from the bubble that landed, so the burst reads as the
     shot doing it. Gravity is strong enough that the hop is a beat rather than
     an arc: at this strength a kick of 9 lifts a bubble about three quarters of
     its own diameter before it turns over. */
  GRAVITY: 55,
  KICK_UP: 9,
  KICK_OUT: 4.5,
  /* what merely lets go, having been cut free rather than hit */
  CUT_DRIFT: 1.5,

  /* A lost run takes the whole board down with it before the panel arrives.
     Seconds between one row letting go and the row above it following, released
     from the bottom up so it reads as the support giving way rather than as
     everything being deleted at once. The panel waits until the last bubble is
     off the screen, because a result that appears over a board still standing is
     the game telling you it is over while showing you that it is not. */
  COLLAPSE_STAGGER: 0.045
};

/* Surviving the run is the third star, by definition rather than by coincidence,
   so it is one number here rather than two somebody has to keep in step. */
BubbleConfig.STAR_SHOTS.three = BubbleConfig.RUN_SHOTS;

/* Derived, so the walls and the muzzle cannot drift apart from the grid. */
BubbleConfig.WORLD_W = BubbleConfig.COLS + 0.5;
BubbleConfig.LAUNCH_BAND = 3;
BubbleConfig.WORLD_H = BubbleConfig.ROW_H * (BubbleConfig.ROWS - 1) + 1 + BubbleConfig.LAUNCH_BAND;
BubbleConfig.MUZZLE = {
  x: BubbleConfig.WORLD_W / 2,
  y: BubbleConfig.WORLD_H - BubbleConfig.LAUNCH_BAND + 1.5
};

