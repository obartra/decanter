/* What each chapter gives you.

   The game is one mechanic for a hundred and twenty levels, and the only things
   that change are how big the board is and which board it is. Handing over every
   tool at level one means the game is as open in the first minute as it will
   ever be. Handing them over a chapter at a time gives it somewhere to go.

   Every grant here is deliberately outside the rules of the board. Nothing in
   this file changes what a pour does, which boards are dealt, or how few pours
   one can be finished in. That matters more than it looks: par is solved
   offline, the difficulty of all 120 levels is measured against it, and the
   order they are played in is derived from that. A grant that changed the board
   would invalidate every one of those and mean re-solving the game. A grant that
   changes what the player can buy, or how much of it, costs nothing.

   Three layers, and it is worth naming them because the file used to claim only
   the first two:

   - A chapter grants access. Free, permanent, outside the rules.
   - A purchase spends it, at the moment of use.
   - A purchase that changes the board pays the third star, because par is the
     minimum for the shelf the level dealt and a changed shelf is not it.

   The vessel has always been the third kind and the blast is the second one.
   Both are rescues, both are once a run, both are capped by the same flag in
   rate(). What neither of them touches is the deal.
   See docs/design/04-economy.md. */
import { CONFIG } from './00-config.js';

export const Chapters = (() => {
  const CHAPTERS = [
    {
      grant: 'undo',
      blurb: 'Pour between bottles to gather each color. A pour only goes onto its own color, or into an empty bottle. Down here you can always take one back.'
    },
    {
      grant: 'hint',
      blurb: 'The apothecary knows which measure comes next. For a price, it will tell you the pour it would make.'
    },
    {
      grant: 'vessel',
      blurb: 'The still has spare glass. Buy an extra bottle when a board leaves you nowhere to put anything, at the cost of the third star.'
    },
    {
      grant: 'undos',
      blurb: 'Nothing here is in a hurry. Two more pours to take back, free, on every run from now on.'
    },
    {
      grant: 'thrift',
      blurb: 'What the vault holds, it keeps. Hints cost you less from here on.'
    },
    {
      grant: 'foresight',
      blurb: 'From up here you can see one move ahead of yourself. The first hint of every run is free.'
    },
    {
      grant: 'blast',
      blurb: 'The furnace takes what the shelf cannot hold. Once a run, choose a bottle and lose it, glass and all — whatever it held stops being asked for, at the cost of the third star.'
    }
  ];

  /* what the grant is called where the player meets it */
  const GRANT_NAMES = {
    undo: 'Undo',
    hint: 'Hints',
    vessel: 'The vessel',
    undos: 'Two more free undos',
    thrift: 'Cheaper hints',
    foresight: 'One free hint a run',
    blast: 'The blast'
  };

  const at = section => CHAPTERS[section] || null;

  /* Everything the player has been given by the time they reach `section`, applied
     in order. Accumulated rather than looked up, so a chapter can deepen something
     an earlier one introduced. */
  function perksFor(section){
    const reached = Math.max(0, Math.min(section, CHAPTERS.length - 1));
    const perks = {
      undo: false,
      hint: false,
      vessel: false,
      blast: false,
      freeUndos: CONFIG.economy.freeUndos,
      hintCost: CONFIG.economy.hint,
      freeHints: 0
    };
    for (let i = 0; i <= reached; i++){
      switch (CHAPTERS[i] && CHAPTERS[i].grant){
        case 'undo': perks.undo = true; break;
        case 'hint': perks.hint = true; break;
        case 'vessel': perks.vessel = true; break;
        case 'undos': perks.freeUndos += 2; break;
        case 'thrift': perks.hintCost = Math.round(CONFIG.economy.hint * 0.6); break;
        case 'foresight': perks.freeHints = 1; break;
        case 'blast': perks.blast = true; break;
      }
    }
    return perks;
  }

  return { count: CHAPTERS.length, at, perksFor, GRANT_NAMES };
})();
