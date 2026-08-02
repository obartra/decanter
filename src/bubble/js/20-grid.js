/* The lattice, and the board that sits on it.

   This file knows about cells, where they are, and which ones touch. It knows
   nothing about colour, matching, shots or drawing. Everything above it depends
   on the six-neighbour adjacency here being exactly right, so it is worth
   keeping small enough to hold in your head.

   Rows are staggered. A row is either flush against the left wall or indented by
   half a bubble, and which one depends on the board's parity bit rather than on
   the row index alone, because inserting a row at the top flips every row's
   stagger at once. Writing `j % 2` anywhere outside `indent` is how that bug
   gets in. */
const BubbleGrid = (() => {
  const C = BubbleConfig;
  const EMPTY = -1;

  /* 0 for a flush row, 1 for one indented by half a bubble. The board's parity
     is folded in here so that an advance is a single flip rather than a rewrite
     of every row. */
  const indent = (board, j) => (j + board.parity) & 1;

  /* Exact and total: computed from the indices every time, never accumulated by
     stepping down the rows, which drifts. */
  function centreOf(board, j, c){
    return { x: 0.5 + c + 0.5 * indent(board, j), y: 0.5 + C.ROW_H * j };
  }

  const inBounds = (j, c) => j >= 0 && j < C.ROWS && c >= 0 && c < C.COLS;
  const at = (board, j, c) => (inBounds(j, c) ? board.rows[j][c] : EMPTY);
  const isEmpty = (board, j, c) => at(board, j, c) === EMPTY;

  /* The six that touch, in a fixed order so that anything iterating them is
     deterministic. West and east never depend on the stagger; the four
     diagonals do, and getting that table wrong is the single most common bug in
     this genre. It presents as bubbles that plainly touch not popping together,
     or as a solid board raining down after the first row is inserted. */
  const FLUSH = [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  const INDENTED = [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]];

  function neighbours(board, j, c){
    const table = indent(board, j) ? INDENTED : FLUSH;
    const out = [];
    for (const [dj, dc] of table){
      const nj = j + dj, nc = c + dc;
      /* filtered, never clamped: a clamped neighbour is a cell that is not
         actually adjacent, and it will happily join a cluster it does not touch */
      if (inBounds(nj, nc)) out.push([nj, nc]);
    }
    return out;
  }

  const emptyRow = () => new Array(C.COLS).fill(EMPTY);

  function create(parity = 0){
    const rows = [];
    for (let j = 0; j < C.ROWS; j++) rows.push(emptyRow());
    return { rows, parity };
  }

  const clone = board => ({ rows: board.rows.map(r => r.slice()), parity: board.parity });

  /* Push a row in at the top. The parity flip and the insertion are one
     operation on purpose: either without the other leaves every bubble on the
     board half a diameter from where it is drawn. */
  function advance(board, row){
    board.parity ^= 1;
    board.rows.unshift(row.slice());
    board.rows.length = C.ROWS;
    return board;
  }

  /* Which cell contains a point. Nothing in the turn loop needs this; it exists
     for tests and tooling. Rounding x and y independently is wrong on a
     staggered lattice, so the nearest row is checked along with the next nearest
     and the closer of the two candidates wins. Two rows are provably enough:
     the best candidate in the nearer row is at most 0.662 away and the row
     beyond is at least 0.866. */
  function cellAt(board, x, y){
    const jf = (y - 0.5) / C.ROW_H;
    const clampRow = j => Math.max(0, Math.min(C.ROWS - 1, j));
    const j1 = clampRow(Math.round(jf));
    const j2 = clampRow(j1 + (jf >= j1 ? 1 : -1));
    let best = null;
    for (const j of j1 === j2 ? [j1] : [j1, j2]){
      const c = Math.max(0, Math.min(C.COLS - 1, Math.round(x - 0.5 - 0.5 * indent(board, j))));
      const p = centreOf(board, j, c);
      const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (!best || d2 < best.d2 - 1e-12) best = { j, c, d2 };
    }
    return { j: best.j, c: best.c };
  }

  /* A cheap stable summary of the board, for asserting that the same seed and
     the same shots produce the same game twice. */
  function hash(board){
    let h = 2166136261 ^ board.parity;
    for (let j = 0; j < C.ROWS; j++){
      for (let c = 0; c < C.COLS; c++){
        h ^= board.rows[j][c] + 2;
        h = Math.imul(h, 16777619);
      }
    }
    return h >>> 0;
  }

  const occupied = board => {
    const out = [];
    for (let j = 0; j < C.ROWS; j++){
      for (let c = 0; c < C.COLS; c++) if (board.rows[j][c] !== EMPTY) out.push([j, c]);
    }
    return out;
  };

  return { EMPTY, indent, centreOf, inBounds, at, isEmpty, neighbours,
           create, clone, advance, cellAt, hash, occupied, emptyRow };
})();
globalThis.BubbleGrid = BubbleGrid;
