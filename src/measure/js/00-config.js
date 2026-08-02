/* Tunables for the measure. Pure data, safe to load anywhere.

   All geometry is in world units, and the world unit is a unit of wine. One unit
   is one unit tall in every vessel on the bench, whatever that vessel holds, and
   every vessel stands on the same shelf. That is not a drawing decision that
   happened to be convenient: it is the entire picture of the game. A target of
   seven is then a single straight line seven units above the shelf, crossing a
   thimble, a carafe and a demijohn at the same height, and the player can see at
   a glance which of them could hold it and how far each one currently is from it.
   Draw the vessels normalised to their own capacity instead and that line
   fragments into five unrelated marks, and the puzzle stops being visible.

   The consequence, which is deliberate: vessels are all the same WIDTH and
   differ only in height. If they differed in width, equal heights would not be
   equal volumes and the line would be a lie. A three-unit vessel really does
   look like a stub beside a twenty-four unit one, and it should.

   Nothing in game state is ever a pixel. There is exactly one transform, in
   60-view.js. */
const MeasureConfig = {
  /* The field the generator draws capacities from.

     The ceiling was 16 when this mechanic was first measured, and that capped
     par at 12 across the entire field. The long lines live above it: the number
     of pours needed grows roughly with how many times the small vessels have to
     be emptied back into the large one, so it is the ratio between the largest
     capacity and the rest that makes a board long, and 16 simply did not leave
     room for an interesting ratio. 24 does. See tools/measure-field.mjs, which
     re-measured the whole field at this ceiling.

     The floor is 2 rather than 3 because a two-unit vessel is a genuinely useful
     piece of glass here — it is how an odd amount gets carried — and the
     measurement kept choosing boards that had one. */
  CAP_MIN: 2,
  CAP_MAX: 24,

  /* How many vessels a board may have, and the single most important number in
     this file.

     Never two, and the reason is worth two paragraphs because the obvious
     mistake is to think a two-jug puzzle is a puzzle.

     The variant with a tap and a drain was measured first, and there a
     two-vessel board scored a "choice" of EXACTLY ZERO right across the field:
     every step of every optimal line had one move that kept par reachable, so a
     par of fourteen was fourteen turns of a handle rather than fourteen
     decisions. Long, and not a puzzle.

     In THIS variant it is worse, and it collapses rather than merely flattens. A
     two-vessel bench has at most TWO reachable positions in total — pour the
     large one into the small one, pour it back, and that is the whole state
     space, because there is nowhere else for the wine to be. Measured over every
     two-vessel bench up to a capacity of 24, the longest par in existence is
     ONE. There is nothing to ship. See tools/measure-field.mjs.

     And more vessels is EASIER, not harder, which is the opposite of what the
     shape of the board suggests: every extra vessel is another route to the
     target, so par falls as the count rises. Difficulty comes from the
     capacities, never from the count. So the count is held at three or four and
     the generator is left to find hard capacities. */
  VESSELS: [3, 4],

  /* Stars are pours over par, exactly the brackets the other game uses. Both are
     perfect information puzzles graded against an exact minimum, so one over par
     had better be worth the same thing in both rooms of the same cellar. */
  STARS: { three: 0, two: 1, one: 2 },

  /* What the run is allowed to lean on, and what that costs it.

     Both tools cap the run at two stars, and this is where this game parts
     company with the bubble one. There, undo and hint are free because taking an
     optimal move is what earns stars in the first place and neither tool changes
     what the board deals. Here the board is perfect information with a known
     minimum, so an unlimited free undo is not an aid, it is a solver: walk the
     tree, take back everything that did not work, and hand yourself the optimal
     line. The hint is worse, because it simply names it.

     The other game charges gold for both, which is how it keeps them honest.
     This page has no purse, so a run that used one pays in the only currency it
     has. Exactly the way a bought vessel caps a run over there. */
  AID_CAP: 2,
  UNDO_DEPTH: 64,

  /* What the browser search is allowed to spend on a board that is not in the
     committed par table. Generous, because the whole state space of a board here
     is a few thousand positions rather than the millions the other game's solver
     works through: total volume is conserved, so a state is a composition of one
     number into three or four bounded parts. A board that blows through this is a
     board something is wrong with, and it is reported as unrated rather than
     guessed at. */
  SEARCH_CAP: 400000,

  /* Wine, and it is the only liquid in this game, so this is less a palette than
     a decision about what claret looks like by candlelight.

     The two games share no module, so this cannot import the other one's palette
     and the value is written down instead. It is a deepened relative of that
     palette's index 0 (#E2546F), which is the red the pour game already uses for
     its claret: the hue is within a few degrees, and the lightness is dropped
     because a full demijohn is twenty-four units of the stuff rather than four,
     and a colour that reads as claret in a thimble reads as rosé in a tower. */
  WINE: '#A32F49',
  WINE_LIT: '#D9536B',

  /* The bench.

     Every vessel is the same width — see the note at the top of this file for
     why that is forced rather than chosen — but how wide that is in units of
     wine is not fixed, and this is a range rather than a number.

     The height of the world is decided for us: it is the tallest capacity, plus
     the room the labels need. So the only way to fill a tall phone screen with a
     short bench is to make the vessels narrower IN UNITS, which makes the unit
     itself taller in pixels and the graduations easier to read. 60-view.js picks
     a width inside this range from the shape of the screen it was given.

     The range exists because both ends are ugly. Left free, a bench of twelves
     on a phone comes out as four tubes at one part in eight, and on a wide
     desktop window the same bench comes out as four tanks. Clamped, a short
     bench simply keeps a little air above and below it, which is what it should
     do. */
  VESSEL_W_MIN: 1.9,
  VESSEL_W_MAX: 3.4,
  /* Gap as a share of vessel width, so the bench keeps its proportions at every
     width rather than looking crowded at one end of the range. */
  GAP_RATIO: 0.5,
  /* The margin at the two ends of the bench, as a share of the gap between
     vessels. Wider than a gap, which is ordinary composition — a row of objects
     wants air at its ends — but the reason it is a separate number is that the
     target's numeral lives in the left one. At a plain gap's width a two digit
     target ran off the edge of the canvas, and the targets worth having are very
     often two digits. */
  EDGE_RATIO: 1.6,
  /* below the bases, so the glass stands on something rather than floating, with
     room under it for the numeral saying what is in it */
  SHELF: 2.2,
  /* above the tallest rim, for the capacity label and the target's number to sit
     in without covering glass */
  HEADROOM: 2.2,
  /* Wall thickness, in world units. Thick enough to catch the light at the size
     a phone draws a twenty-four unit vessel, which is about eight pixels a unit. */
  GLASS: 0.17,

  /* Etched graduations, one per unit, with a heavier one every fifth so a level
     can be read off without counting up from the base one mark at a time. Five
     rather than four because the targets that matter are rarely multiples of
     four and a player counting in fours has to do arithmetic to use them. */
  GRADUATION_MAJOR: 5,

  /* Seconds for the liquid to move on a pour. Purely cosmetic: the board reaches
     its final state the instant the move is applied and the drawn levels chase
     it, so a slow frame or a backgrounded tab cannot leave the glass and the
     state disagreeing. Long enough to read as liquid, short enough that a
     fourteen-pour line is not a sit-down. */
  POUR_TIME: 0.34,
  /* How far the source rises off the shelf while it pours, in world units.

     It rises rather than tilts, and that is a correction rather than a taste. A
     tilted vessel has to keep its liquid surface horizontal, which means
     clipping a rotated glass against an unrotated plane; done properly it is
     fiddly, and done at the size a phone draws a four-unit vessel it read as a
     rendering fault rather than as a pour. Lifting the vessel and running a
     stream out of it says the same thing, keeps every liquid surface level, and
     leaves the graduations readable throughout — which matters, because the
     graduations are what the player is watching. */
  LIFT: 0.85
};

globalThis.MeasureConfig = MeasureConfig;
