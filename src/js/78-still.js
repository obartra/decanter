/* A board, small enough to look at rather than play.

   The card before a replay needs a picture, and the picture has one job:
   recognition. Levels are deterministic, so level 47 is the same board for
   everyone forever, but a number cannot tell you which board that was, and
   "the one with the two greens buried under the pink" is how anybody who has
   played it actually remembers the thing.

   So the still is dealt from the level rather than drawn to look like a level.
   That is the same guarantee the map's road has: the decoration is derived from
   the real geometry, so it cannot drift off it. A picture of a board the level
   does not deal would be worse than no picture, because it would be believed.

   Markup rather than canvas, because a bottle here is a stack of coloured
   rectangles and the stylesheet already knows how to draw one. The colours are
   the published --cN properties, so a still cannot show a palette the game no
   longer pours. */
const Still = (() => {
  /* Two rows once there are enough bottles to make one row a thin ribbon. The
     real board picks its rows by measuring the space it has; this one has a
     fixed card to sit in, so the rule can be arithmetic. */
  const columns = n => (n > 8 ? Math.ceil(n / 2) : n);

  /* One element per unit rather than per band. The board merges touching units
     of one colour so no seam shows between them; here nothing is drawn between
     units at all, so there is no seam to hide and no second copy of that rule
     to keep in step. */
  function pour(tubes){
    const cols = columns(tubes.length);
    const bottles = tubes.map(tube => {
      const units = tube
        .map(c => `<i style="height:${(100 / Rules.CAP).toFixed(3)}%;background:var(--c${c})"></i>`)
        .join('');
      return `<span class="stillBottle${Rules.isFull(tube) ? ' done' : ''}">${units}</span>`;
    }).join('');
    return `<div class="still" style="--stillCols:${cols}">${bottles}</div>`;
  }

  /* The other game's board, from the description it hands over: rows of
     colours, each saying whether it is indented. Which rows those are is that
     game's answer and never worked out here. A still that staggers the wrong
     way round is a picture of a board nobody is dealt, and the two games are
     coupled through one object precisely so that this file cannot go and look.

     An empty cell keeps its place and paints nothing, because the gaps in a
     board are part of what it looks like. */
  function bubbles(rows){
    const out = rows.map(row => {
      const dots = row.cells.map(colour => (colour
        ? `<i class="stillDot" style="background:${colour}"></i>`
        : '<i class="stillDot"></i>')).join('');
      return `<span class="stillRow${row.indent ? ' odd' : ''}">${dots}</span>`;
    }).join('');
    return `<div class="still bubbles">${out}</div>`;
  }

  return { pour, bubbles };
})();
globalThis.Still = Still;
