/* The laws of the cellar, and nothing else. No DOM, no timing, no state.

   A cask lies flat on the floor and is pinned to one axis:

     horizontal — `fixed` is its row, and its position is its leftmost column
     vertical   — `fixed` is its column, and its position is its topmost row

   It slides ONLY along its own length, any distance, stopped by another cask or
   by a wall. Cask 0 is the gilt one: horizontal, lying on CONFIG.EXIT_ROW, and
   it is out when its far end reaches the east wall, where the door is.

   ONE MOVE IS ONE MOVE WHATEVER IT CARRIES. Shoving a cask four cells and
   nudging it one both cost exactly one, exactly as a pour does in the pour game
   and in the measure — see docs/design/01-puzzle.md, which decides it for all
   three. That is what makes par a measure of thinking rather than of clicking,
   and it is the only reason the star brackets can be as tight as three-at-par:
   if distance counted, a board would be graded on how neatly the player happened
   to break one shove into two.

   ---- the layout and the position are separate things, on purpose ----

   A LAYOUT is the set of casks, their lengths, their axes and which row or
   column each is pinned to. A POSITION is one integer per cask saying where
   along that axis it currently sits. Nothing a player does can change the
   layout, so the whole game is a walk over integer arrays of a fixed shape, and
   a board is a layout plus a starting position. 25-search.js leans on that
   separation completely and so does the generator: the layout decides the
   reachable component, and the start is then chosen from inside it. */
const CasksRules = (() => {
  const C = CasksConfig;

  /* ---- the canonical key ----

     One character per cask, in cask order, never sorted.

     Not sorted because casks are not interchangeable: cask 3 being at 2 and cask
     4 being at 2 are different boards, since the two are pinned to different
     rows or columns and have different lengths. The pour game sorts its bottles
     before comparing and is right to, because two bottles holding the same stack
     really are one position there. Bringing that reflex across here would
     collapse states that are genuinely different and par would come back shorter
     than the truth — a number nobody can achieve, published as a minimum. The
     measure records the same trap for the same reason.

     A character rather than a joined string because this is the inner loop of a
     sweep over tens of thousands of states. A position is at most W - 2 = 4, so
     every value fits in one code unit with room to spare, and the key is as many
     characters as there are casks instead of three times that. It is not meant
     to be read; nothing ever parses it back. */
  const key = pos => String.fromCharCode.apply(null, pos);

  /* The largest position a cask can hold: its axis is W or H long and the cask
     takes up `len` of it. */
  const span = cask => (cask.horiz ? C.W : C.H) - cask.len;

  /* The cells a cask covers at a given position, as a rectangle on the floor.
     One place, so the renderer draws a cask where this says it is and the input
     decides what was grabbed from the same numbers. A hit test with its own idea
     of where a cask is gives the worst bug a game played by touching things can
     have: the one where the touch works, just not on the thing under the
     finger. */
  const boxOf = (cask, p) => (cask.horiz
    ? { r: cask.fixed, c: p, h: 1, w: cask.len }
    : { r: p, c: cask.fixed, h: cask.len, w: 1 });

  /* Which cask covers each cell, or -1. A plain array rather than a typed one:
     the pure modules of every game here run in a bare sandbox in the tests, and
     a floor is thirty-six entries. */
  function occupancy(layout, pos){
    const g = new Array(C.W * C.H).fill(-1);
    for (let i = 0; i < layout.length; i++){
      const b = boxOf(layout[i], pos[i]);
      for (let r = b.r; r < b.r + b.h; r++){
        for (let c = b.c; c < b.c + b.w; c++) g[r * C.W + c] = i;
      }
    }
    return g;
  }

  /* What is on a cell, treating anything off the floor as occupied by the wall.
     The only caller already keeps itself inside the board, so the bounds test is
     belt and braces — but it is the difference between a wall that stops a cask
     and a wall that reads as empty space because the index wrapped onto the row
     above, which is a bug that would look exactly like a rule. */
  const at = (g, r, c) => (r < 0 || r >= C.H || c < 0 || c >= C.W ? -2 : g[r * C.W + c]);

  /* How far a cask can go in each direction, as the inclusive range of positions
     it may legally hold right now.

     This is the primitive the whole game is built on rather than a convenience:
     the search enumerates it, the drag clamps to it, and the tap-then-tap input
     refuses a destination outside it. A cask must never end up on a cell it
     could not have slid through, and stating the reachable run once is what
     makes that true everywhere instead of true in the three places somebody
     remembered.

     Walking outward one cell at a time and stopping at the first obstruction is
     what makes it a run rather than a set: a cask cannot jump over the cask in
     front of it to land in the space beyond, and a version of this that simply
     tested whether the destination cells were empty would let it. */
  function runOf(layout, pos, i, g){
    const grid = g || occupancy(layout, pos);
    const cask = layout[i];
    const lim = span(cask);
    let min = pos[i], max = pos[i];
    /* Only the newly covered cell needs testing at each step out: everything
       behind it is either where the cask already was or a cell it has just been
       checked through. */
    while (min > 0){
      const lead = min - 1;
      if (at(grid, cask.horiz ? cask.fixed : lead, cask.horiz ? lead : cask.fixed) !== -1) break;
      min--;
    }
    while (max < lim){
      const lead = max + cask.len;
      if (at(grid, cask.horiz ? cask.fixed : lead, cask.horiz ? lead : cask.fixed) !== -1) break;
      max++;
    }
    return { min, max };
  }

  /* Every move available, as {cask, to}.

     These are distinct outcomes as well as distinct moves, and here the two are
     the same thing rather than by luck: a move changes exactly one cask's
     position, to a value it did not already hold, so two different moves always
     disagree about some cask. docs/design/02-levels.md records what counting
     legal moves instead of distinct outcomes cost the pour game's account of its
     own difficulty, which is why every game in this repository states the
     difference even where, as here, there is nothing for the reduction to
     collapse. */
  function moves(layout, pos){
    const grid = occupancy(layout, pos);
    const out = [];
    for (let i = 0; i < layout.length; i++){
      const { min, max } = runOf(layout, pos, i, grid);
      for (let to = min; to <= max; to++) if (to !== pos[i]) out.push({ cask: i, to });
    }
    return out;
  }

  /* Applying a move copies. Every state in the search is kept, so a mutation in
     place would rewrite states already visited and the sweep would measure a
     board that never existed. */
  function apply(layout, pos, move){
    const next = pos.slice();
    next[move.cask] = move.to;
    return next;
  }

  /* Whether a move is one the board actually offers. The search never needs this
     — it only ever plays moves it just enumerated — but the input does, on every
     tap and at the end of every drag, and it is the one place a cask could be
     put somewhere it could not have slid. */
  function canMove(layout, pos, i, to){
    if (i < 0 || i >= layout.length || to === pos[i]) return false;
    const { min, max } = runOf(layout, pos, i);
    return to >= min && to <= max;
  }

  /* Out when the gilt cask's far end reaches the east wall, where the door is.
     It does not have to travel through the doorway to count: the door is the gap
     the cask is being aimed at, and a rule that made it roll out of the room
     would add a move to every board and change nothing about any of them. */
  const isOut = (layout, pos) => pos[0] + layout[0].len === C.W;

  /* Whether a layout is one this game is willing to deal. Not a rule of play —
     nothing here can make a legal board illegal — but the invariants the search,
     the renderer and the generator all assume, in the one place they can be
     asserted. A board that broke any of them would not crash; it would quietly
     be a different game.

     The second horizontal cask on the exit row is the interesting one. It can
     wall the gilt cask in from the far side, and a board where the door cannot
     be reached at all is not a hard board, it is a broken one. The generator
     never places one; this says so where a test can read it. */
  function wellFormed(layout, pos){
    if (!Array.isArray(layout) || !layout.length) return false;
    if (!Array.isArray(pos) || pos.length !== layout.length) return false;
    const gilt = layout[0];
    if (!gilt.horiz || gilt.fixed !== C.EXIT_ROW || gilt.len !== C.GILT_LEN) return false;
    const seen = new Array(C.W * C.H).fill(false);
    for (let i = 0; i < layout.length; i++){
      const cask = layout[i];
      if (!C.LENGTHS.includes(cask.len)) return false;
      if (i > 0 && cask.horiz && cask.fixed === C.EXIT_ROW) return false;
      if (pos[i] < 0 || pos[i] > span(cask)) return false;
      const b = boxOf(cask, pos[i]);
      for (let r = b.r; r < b.r + b.h; r++){
        for (let c = b.c; c < b.c + b.w; c++){
          if (seen[r * C.W + c]) return false;
          seen[r * C.W + c] = true;
        }
      }
    }
    return true;
  }

  return { key, span, boxOf, occupancy, runOf, moves, apply, canMove, isOut, wellFormed };
})();
globalThis.CasksRules = CasksRules;
