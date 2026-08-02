/* Tunables for the bubble game. Pure data, safe to load anywhere.

   All geometry is in world units where the bubble diameter is 1 and y increases
   downward from the top left of the playfield. Nothing in game state is ever a
   pixel: there is exactly one transform, in 60-view.js, and everything else
   works in world units. A game whose state is measured in pixels has to be
   rewritten every time the window changes size. */
const BubbleConfig = {
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
     between two neighbours, so a contact distance near it makes two
     indistinguishable shots behave differently. 0.95 sits clear of that
     threshold on both sides. */
  HIT_K: 0.95,
  /* Drawn slightly over half, so neighbours overlap a little and the art never
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

  /* Six liquids, taken from the other game's palette rather than chosen again.
     These are CONFIG.palette indices 0, 7, 11, 9, 3 and 4, picked one per hue
     family so the set spans the wheel and keeps that palette's separation: it
     was built so no two liquids sit closer than about 24 in CIEDE2000, which is
     the whole reason not to invent a second set here.

     The two games have no module in common, so this cannot import that one and
     the indices are written down instead. If that palette is ever retuned, these
     are the six to bring across. */
  PALETTE: ['#E2546F', '#FF9E75', '#D3C9A0', '#629D38', '#95B9F6', '#A36AC4'],

  /* Every colour in the palette gets dealt. This was five against a palette of
     six, so one of them was drawn on the board by nobody and existed only in the
     file. */
  COLOURS: 6,

  /* Shots between the board coming down a row. This is what makes the death line
     a threat rather than a decoration: without it a player can take as long as
     they like and the line is never reached except by their own bad shots. */
  ADVANCE_EVERY: 10,

  /* The board comes down harder the longer a run lasts, one shot off the cadence
     every RAMP_EVERY shots, never below ADVANCE_MIN.

     Not there to make the game harder. Measured over 300 seeds, ramping barely
     moves the median run (84 shots to 90) but pulls the longest from 417 down to
     208, and the p90/p10 spread from 2.9x to 2.1x. A run that can occasionally
     go four times longer than typical cannot be graded, because any threshold is
     either trivial for the lucky or unreachable for everyone else. The ramp is
     what makes "survived N shots" a number worth putting stars on.

     ADVANCE_MIN exists because pressure past a point stops measuring the player:
     at a cadence of three the spread collapses to 1.6x and the board wins
     whatever the player does. See tools/bubble-survival.mjs. */
  RAMP_EVERY: 20,
  ADVANCE_MIN: 4,

  /* Stars. Clearing the board is the par moment, rare and wholly earned, and it
     pays three whatever else happened. Every other run is graded on how long it
     lasted, against the measured distribution of a competent run rather than
     against a number somebody liked the look of. These are p10, p50 and p90 of
     the bot at this cadence and ramp. */
  STAR_SHOTS: { one: 65, two: 80, three: 130 },

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
     changes what the board deals. Picking a colour outright does change it, and
     a run that used one is capped exactly the way a bought vessel is. */
  AID_CAP: 2,
  UNDO_DEPTH: 24,

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

/* Derived, so the walls and the muzzle cannot drift apart from the grid. */
BubbleConfig.WORLD_W = BubbleConfig.COLS + 0.5;
BubbleConfig.LAUNCH_BAND = 3;
BubbleConfig.WORLD_H = BubbleConfig.ROW_H * (BubbleConfig.ROWS - 1) + 1 + BubbleConfig.LAUNCH_BAND;
BubbleConfig.MUZZLE = {
  x: BubbleConfig.WORLD_W / 2,
  y: BubbleConfig.WORLD_H - BubbleConfig.LAUNCH_BAND + 1.5
};

globalThis.BubbleConfig = BubbleConfig;
