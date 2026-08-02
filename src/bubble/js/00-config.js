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

  /* Six liquids, the same palette discipline as the other game: chosen so the
     closest pair is far enough apart in CIEDE2000 to be told apart on a dim
     phone, and backed by a shape so the difference does not rest on hue alone. */
  PALETTE: ['#DF4A63', '#F09A2E', '#EFE066', '#4CC46B', '#5AA9EE', '#B071D8'],

  /* how many colours a level deals with */
  COLOURS: 5
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
