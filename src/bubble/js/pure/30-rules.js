/* What happens to the board when a bubble lands.

   Two flood fills that look similar and must never be merged into one function
   with a flag. `matchFrom` walks bubbles of the same colour to find what pops.
   `detach` walks bubbles of any colour to find what is still hanging from the
   ceiling. They answer different questions and the day someone unifies them is
   the day the second one starts caring about colour. */
const BubbleRules = (() => {
  const C = BubbleConfig;
  const G = BubbleGrid;

  const key = (j, c) => j * C.COLS + c;

  /* Everything the same colour as the newly placed bubble and connected to it.

     Seeded from the placed cell only, never a scan of the board: on a board that
     was well formed before the shot, no cluster of three can already exist, so a
     scan could only ever find what the seed finds, more slowly.

     Cells are marked at the moment they are pushed, not when they are popped.
     Marking at pop lets a cell enter the stack several times, which on a large
     cluster is how this turns into a hang. */
  function matchFrom(board, j0, c0){
    const colour = G.at(board, j0, c0);
    if (colour === G.EMPTY) return [];
    const seen = new Set([key(j0, c0)]);
    const stack = [[j0, c0]];
    const out = [];
    while (stack.length){
      const [j, c] = stack.pop();
      out.push([j, c]);
      for (const [nj, nc] of G.neighbours(board, j, c)){
        const k = key(nj, nc);
        if (seen.has(k)) continue;
        /* compared as integers against the seed's colour, never as a rendered
           colour string, and never against the neighbour's neighbour */
        if (G.at(board, nj, nc) !== colour) continue;
        seen.add(k);
        stack.push([nj, nc]);
      }
    }
    return out;
  }

  /* Everything no longer hanging from the ceiling.

     Anchoring is membership of row 0, not being near the top of the screen.
     After a row is inserted the old row 0 is row 1 and has to earn its place by
     touching something above it, which is exactly right and is why this is run
     again after every advance. */
  function detach(board){
    const seen = new Set();
    const stack = [];
    for (let c = 0; c < C.COLS; c++){
      if (G.at(board, 0, c) === G.EMPTY) continue;
      seen.add(key(0, c));
      stack.push([0, c]);
    }
    while (stack.length){
      const [j, c] = stack.pop();
      for (const [nj, nc] of G.neighbours(board, j, c)){
        const k = key(nj, nc);
        if (seen.has(k)) continue;
        if (G.at(board, nj, nc) === G.EMPTY) continue;
        seen.add(k);
        stack.push([nj, nc]);
      }
    }
    return G.occupied(board).filter(([j, c]) => !seen.has(key(j, c)));
  }

  const remove = (board, cells) => {
    for (const [j, c] of cells) board.rows[j][c] = G.EMPTY;
  };

  /* Which colours are actually still on the board.

     The shooter must only ever offer one of these. A game that deals from a
     fixed palette regardless keeps handing out bubbles that cannot match
     anything, each one lands and becomes a new colour with a count of one, and
     the board fills faster than it can be cleared through no decision the player
     made. */
  function liveColours(board){
    const seen = new Set();
    for (const [j, c] of G.occupied(board)) seen.add(board.rows[j][c]);
    return [...seen].sort((a, b) => a - b);
  }

  const isWon = board => G.occupied(board).length === 0;
  const isLost = board => G.occupied(board).some(([j]) => j >= C.DEATH_ROW);

  /* Deal a board, a cell at a time, refusing any colour that would complete a
     group of three where it lands. A board built from independent random colours
     arrives with a match already sitting on it, so the opening shot clears
     something the player did not earn; every board generated the naive way had
     one.

     Lives here rather than in the app because the difficulty harness has to deal
     the boards it measures, and a harness that deals them differently from the
     game is measuring a game nobody plays. */
  function dealBoard(rows, pick){
    const b = G.create(0);
    for (let j = 0; j < rows; j++){
      for (let c = 0; c < C.COLS; c++){
        const start = Math.floor(pick() * C.COLOURS);
        let chosen = start;
        for (let n = 0; n < C.COLOURS; n++){
          const col = (start + n) % C.COLOURS;
          b.rows[j][c] = col;
          if (matchFrom(b, j, c).length < C.MATCH_MIN){ chosen = col; break; }
        }
        b.rows[j][c] = chosen;
      }
    }
    /* nothing should be loose on a board nobody has shot at yet */
    remove(b, detach(b));
    return b;
  }

  /* A row to push in at the top, in colours the board still has, so an advance
     cannot introduce a colour the player has already cleared away. */
  function freshRow(board, pick){
    const live = liveColours(board);
    const from = live.length ? live : [0];
    return new Array(C.COLS).fill(0).map(() => from[Math.floor(pick() * from.length) % from.length]);
  }

  /* Can anything be done from here? A board can pack itself so that every
     contact has no empty neighbour to snap into, and then no shot can land at
     all. That is a real ending and the game has to notice it rather than let
     the player fire into a board that silently eats every bubble. */
  function anyLanding(board, resolve){
    for (let deg = -80; deg <= 80; deg += 2){
      const a = deg * Math.PI / 180;
      if (resolve(board, { x: Math.sin(a), y: -Math.cos(a) })) return true;
    }
    return false;
  }

  /* One strict order, and the grid reaches its final state before anything is
     animated. The animator is handed the lists of what was matched and what came
     away with it and never reads the grid, so a slow animation cannot
     desynchronise the board. */
  /* Cells are handed back with the colour they held, because by the time anyone
     wants to draw them falling they are no longer on the board to ask. */
  const withColour = (board, cells) => cells.map(([j, c]) => [j, c, board.rows[j][c]]);

  function resolveTurn(board, landing, colour){
    board.rows[landing.j][landing.c] = colour;

    /* Both lists leave the board the same way, by falling off the bottom of it.
       They stay separate because they are separate shots: `matched` is the group
       you completed, `cut` is everything that was only hanging from it, and the
       second is the one worth aiming for, so it scores differently. */
    const cluster = matchFrom(board, landing.j, landing.c);
    const matched = cluster.length >= C.MATCH_MIN ? withColour(board, cluster) : [];
    if (matched.length) remove(board, matched);

    const cut = matched.length ? withColour(board, detach(board)) : [];
    if (cut.length) remove(board, cut);

    return {
      matched,
      cut,
      won: isWon(board),
      lost: isLost(board)
    };
  }

  /* Everything within one cell of a point on the lattice.

     Radius one is the six neighbours, and they are the six the grid already
     knows: the diagonal table depends on the row's stagger, and a blast that
     worked that out for itself would be the third copy of the single most
     common bug in this genre. So it asks.

     The centre is in the list and is almost always empty — a shot's landing is
     the cell the bubble would have snapped into — but it is asked for rather
     than assumed, because the one thing worse than a blast that clears six is a
     blast that quietly clears five when the geometry surprises it. */
  function within(board, j0, c0){
    return [[j0, c0], ...G.neighbours(board, j0, c0)]
      .filter(([j, c]) => G.at(board, j, c) !== G.EMPTY);
  }

  /* A bomb going off where a bubble would have landed.

     Deliberately not `resolveTurn` with a flag. That function's whole shape is
     "place a bubble, then walk its colour", and a bomb has no colour to walk:
     `matchFrom` could not be seeded by it, and the file already says why those
     two fills must never be merged. What the two do share is the ending, which
     is the part that is genuinely the same — whatever leaves the board takes
     down whatever was only hanging from it — so `detach` is called here exactly
     as it is called there, and the return has the same shape so the animator
     needs no idea which one happened. `matched` is what the shot knocked off,
     whatever did the knocking. */
  function resolveBlast(board, landing){
    const blown = withColour(board, within(board, landing.j, landing.c));
    if (blown.length) remove(board, blown);

    const cut = blown.length ? withColour(board, detach(board)) : [];
    if (cut.length) remove(board, cut);

    return {
      matched: blown,
      cut,
      won: isWon(board),
      lost: isLost(board)
    };
  }

  return { matchFrom, detach, remove, liveColours, isLost, resolveTurn,
           within, resolveBlast, dealBoard, freshRow, anyLanding };
})();
globalThis.BubbleRules = BubbleRules;
