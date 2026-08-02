/* What a level deals, and the one structural decision that separates this game
   from the other two.

   ---- THE BOARDS ARE A SHIPPED TABLE, NOT A SEED ----

   The measure deals its bench from a seed: a level number hashes to a set of
   capacities and a target, and any seed at all produces a real board, so the
   generator is four lines of shuffle and the level table only has to record
   which seeds turned out to be worth playing. The pour game does the same thing
   with colours.

   That does not work here, and the reason is cost rather than principle. A
   random scattering of casks is overwhelmingly likely to be TRIVIAL — measured
   over a dense field, the median layout is worth three to six moves — and there
   is no cheap test that says so. Finding out costs a sweep of the layout's
   entire reachable component, which is thousands of states on a crowded floor
   and tens of thousands on an open one. Dealing from a seed in the page would
   mean either handing out whatever the seed happened to produce, which is
   usually nothing, or running that sweep on every deal, which is a visible stall
   on the device least able to afford it and would still only tell you the board
   was not worth dealing.

   So the search runs once, offline, over a field of thousands of layouts, and
   what ships is the boards it chose. tools/casks-field.mjs writes 32-boards.js
   and 35-pars.js in one pass from one measurement, and PAR IS NEVER RECOMPUTED
   IN THE PAGE. A slow phone and a fast laptop show the same number, and the
   number they show is the one the levels were actually chosen against.

   25-search.js is still in the bundle, because the hint needs it — but a hint is
   asked for, where a deal is not. */
const CasksLevels = (() => {
  /* No config is read here, and that is worth noticing rather than fixing. Every
     dimension of a board — the size of the floor, which row the door is in, how
     long a cask may be — is already baked into the table by the tool that wrote
     it. Reading CasksConfig here would be this module quietly asserting that the
     committed boards still match a value somebody could change, which is exactly
     the assertion CasksRules.wellFormed makes on purpose, in one place, with a
     test behind it. */

  /* ---- the shipped format ----

     Four characters per cask, concatenated, no separators:

       [0] axis     h horizontal, v vertical
       [1] length   2 or 3
       [2] fixed    the row a horizontal cask lies on, or the column a vertical
                    one stands in
       [3] position where it starts along its own axis

     The first cask in the string is always the gilt one. Fixed width so parsing
     is a slice rather than a split, and single digits throughout because the
     floor is six by six and everything in a board is 0 to 5.

     Both the reader and the writer are here, and the generator calls `encode`
     rather than formatting the string itself. A table written by one spelling
     and read by another is the kind of bug that produces a board — just not the
     board that was measured — and the par beside it would be a number about a
     puzzle nobody has ever seen. */
  function parse(text){
    const layout = [];
    const start = [];
    for (let i = 0; i + 4 <= text.length; i += 4){
      const axis = text[i];
      /* Anything that is not 'h' is not automatically 'v'. Read as a boolean, a
         corrupt character silently became a vertical cask and the board went on
         to be a different, plausible-looking game — which is the failure this
         format's whole four-characters-per-cask tidiness is meant to make loud. */
      if (axis !== 'h' && axis !== 'v') return null;
      layout.push({
        horiz: axis === 'h',
        len: Number(text[i + 1]),
        fixed: Number(text[i + 2])
      });
      start.push(Number(text[i + 3]));
    }
    return { layout, start };
  }

  const encode = (layout, pos) => layout
    .map((cask, i) => (cask.horiz ? 'h' : 'v') + cask.len + cask.fixed + pos[i])
    .join('');

  /* The board for a level, or null past the end of the table.

     Null rather than something improvised. The measure can hand over an
     unmeasured bench past its table because dealing one is free and most of them
     are at least playable; there is no equivalent here. Anything this file
     invented would be a layout nobody swept, which is very likely worth three
     moves and might have no way out at all, and handing that over under a level
     number would be worse than saying the cellar has been emptied.

     Read through globalThis so this module can load before the table does —
     filename order is dependency order, and 32-boards.js sorts after this. */
  function make(level){
    const table = globalThis.CasksBoards;
    const text = table && table[level];
    if (typeof text !== 'string' || !text.length) return null;
    return parse(text);
  }

  /* Where the cellar ends, from the par table, because a board without a par is
     a board this game will not grade and there is no reason to deal one. Zero
     when neither table has been generated yet, which is only true in a checkout
     where the tool has not been run. */
  function last(){
    const pars = globalThis.CasksPars;
    return pars && Number.isInteger(pars.last) ? pars.last : 0;
  }

  /* Par for a level, or null if it is not in the table. Never a search: see the
     header. `null` is a real answer and 45-score.js gives it no stars rather
     than the benefit of the doubt. */
  function par(level){
    const pars = globalThis.CasksPars;
    const p = pars && pars.par && pars.par[level];
    return Number.isInteger(p) ? p : null;
  }

  return { parse, encode, make, last, par };
})();
globalThis.CasksLevels = CasksLevels;
