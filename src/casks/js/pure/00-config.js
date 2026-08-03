/* Tunables for the cellar door. Pure data, safe to load anywhere.

   All geometry is in world units where ONE CELL OF THE FLOOR IS 1 ACROSS, and y
   increases downward from the outside corner of the north-west wall. Nothing in
   game state is ever a pixel: a position is an integer cell index along a cask's
   own axis, and there is exactly one transform, in 60-view.js. The other two
   games are built the same way, for the same reason — a game whose state is
   measured in pixels has to be recomputed every time the window moves, and
   anything mid-animation lands somewhere else when it does.

   The state of a whole board is therefore an array of small integers, one per
   cask, which is what makes the search in 25-search.js cheap enough to sweep a
   layout's entire reachable component. */
export const CasksConfig = {
  /* The floor. Six by six is the size this mechanic was measured at and it is
     not an arbitrary square: a cask is two or three cells long, so a six-cell
     row holds two casks with a cell to spare, which is the shortest row on which
     a blocking cask can itself be blocked. Five would make almost every board
     trivial and seven multiplies the reachable component by roughly an order of
     magnitude for boards that measured no harder. See tools/casks-field.mjs. */
  W: 6,
  H: 6,

  /* Which row the door is in, counted from the top.

     Not row 0 and not row 5. A cask on an edge row can only ever be blocked by
     vertical casks hanging off one side of it, which throws away half of the
     ways a board can be interesting; the two rows of clearance above this one
     and three below are what let obstructions arrive from both directions. The
     whole measured field in tools/casks-field.mjs was measured at this row. */
  EXIT_ROW: 2,

  /* How long a cask may be. Two and three, and nothing else: a four-cell cask on
     a six-cell row has three positions and is furniture rather than a puzzle
     piece, and a one-cell cask cannot be said to lie along an axis at all, so it
     would need a rule about which way it slides. */
  LENGTHS: [2, 3],

  /* The gilt cask is two cells, always.

     At three it fills half the exit row on its own, the run from any start to
     the door is at most three cells, and there is only room for one other thing
     on that row — which there is not, because a second horizontal cask on the
     exit row is never dealt at all (it can wall the gilt one in from the far
     side, which makes a board unsolvable rather than hard; see
     tools/casks-field.mjs). Two leaves four starting columns and room for the
     obstruction to be somewhere interesting. */
  GILT_LEN: 2,

  /* Stars are moves over par, exactly the brackets the pour game and the measure
     use. All three are graded against an exact minimum, and one move over par
     had better be worth the same thing in every room of the same cellar. */
  STARS: { three: 0, two: 1, one: 2 },

  /* What the run is allowed to lean on, and what that costs it.

     The same call the measure makes, for the same reason. This board is perfect
     information with a known minimum, so an unlimited free undo is not an aid,
     it is a solver: slide things about, take back whatever did not work, and
     hand yourself the optimal line. The hint is worse, because it simply names
     the next move of it. The pour game charges gold for both; this page has no
     purse, so a run that used one pays in the only currency it has.

     The bubble game leaves its undo and hint free, and is right to — there,
     neither changes what the board deals and taking a good shot is what earns
     stars in the first place. Nothing about that argument survives the move to a
     board with nothing hidden in it. */
  AID_CAP: 2,
  UNDO_DEPTH: 64,

  /* The tripwire on the hint's search, in states.

     A budget in name only. The reachable component of a dealt board is a few
     thousand positions on a crowded floor and tens of thousands on an open one,
     and the shipped boards are crowded by construction, so nothing that is
     actually dealt comes anywhere near this. A board that trips it is a board
     something is wrong with, and the hint says nothing rather than guessing.

     Note this is NOT how par is obtained. Par ships in 35-pars.js and is never
     recomputed in the page; see the note at the top of 30-levels.js for why the
     boards are a shipped table here where the measure deals its own from a
     seed. */
  SEARCH_CAP: 200000,

  /* ---- the cellar ----

     The ink, the gold and the glass line come from the shared token block in
     00-base.css, which is the pour game's verbatim. What is written out here is
     the wood, because canvas cannot read a custom property without going through
     getComputedStyle on every frame. If that block is ever retuned, the two gilt
     values below are the ones to bring across.

     Oak by candlelight is not brown, it is a very dark red-orange that only
     reads as wood where the light actually lands, which is why there are two
     values rather than one: the body is drawn as a gradient between them across
     the cask's short axis, so a cask reads as a cylinder lying on its side. */
  OAK: '#2A1B10',
  OAK_LIT: '#6B4A28',
  /* Iron hoops and the staves between them. The staves are drawn in the shadow
     color rather than as lines of their own, so they read as the gaps between
     boards rather than as stripes painted on one. */
  HOOP: '#8A7A62',
  STAVE: 'rgba(12,7,3,.55)',

  /* The gilt cask. The same two golds the wordmark and the stars use, so the one
     cask that matters is the same color as everything else on the page that
     matters. It is the only object in the room that is not brown, which is the
     entire reason it needs no label. */
  GILT: '#E0B15C',
  GILT_LIT: '#F4D9A0',

  /* The floor and the walls. Flagstones lit from the door rather than from
     above: the only light in this room comes through the gap in the east wall,
     and a floor lit from the top would say there is a window. */
  FLOOR: '#1B140D',
  FLOOR_JOINT: 'rgba(6,4,2,.75)',
  WALL_FACE: '#241A11',
  WALL_EDGE: 'rgba(244,217,160,.14)',

  /* How thick the walls are, in cells. They are drawn rather than implied
     because the door has to be a gap in something. */
  WALL: 0.55,

  /* Seconds for a cask to travel one cell. A cask is a heavy object and it
     should not teleport, but a fifteen-move line must not become a sit-down
     either, so the time is per cell with a ceiling: a four-cell slide takes
     rather less than four times as long as a one-cell slide, the way a shove
     that gets going does. */
  SLIDE_PER_CELL: 0.075,
  SLIDE_MAX: 0.26,

  /* How far a cask can be dragged past the end of its run before the drag stops
     following the finger, in cells. Zero would be correct and feels broken: the
     cask stops dead under a finger that is still moving and the player cannot
     tell whether the game noticed. A little overshoot that springs back says
     "as far as it goes" without ever letting go of a cell the cask could not
     slide through — the drag is drawn past the stop, the state never is. */
  DRAG_OVERSHOOT: 0.22,

  /* How far a pointer must travel before a press counts as a drag rather than a
     tap, in cells. Below this the press selects the cask and waits for a second
     tap. Measured in world units rather than pixels so it means the same thing
     on a phone and on a desktop, where a cell is four times the size. */
  DRAG_SLOP: 0.28
};

