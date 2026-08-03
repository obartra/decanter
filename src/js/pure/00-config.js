/* Tunables that other modules read. Pure data, safe to load anywhere. */
export const CONFIG = {
  capacity: 4,
  maxColors: 12,
  minColors: 4,
  /* Bumped whenever a level number starts dealing a different board, which so
     far means regenerating src/js/32-order.js. It invalidates the par a save has
     cached, which belongs to a board that no longer exists. It does not touch
     what a player earned; see 40-progress.js. */
  layout: 5,
  /* Liquid palette, index === colour id, and the only place a liquid colour is
     written down. The --cN custom properties the stylesheets use are published
     from here at boot, so the bands, the pour and the particle sim cannot drift
     apart the way they did when the palette lived in two files.

     Chosen so that no two liquids are close to the eye. The previous set was
     picked by hand and two pairs sat at a CIEDE2000 distance of about 12, which
     is close enough to lose a level to, and seven pairs sat under 20. Every hue
     here is within twelve degrees of the one it replaced, so the family is the
     same; the separation is bought with lightness and chroma instead. The worst
     pair is now about 24. See the test, which measures it. */
  palette: ['#E2546F','#B08016','#32D8B5','#95B9F6','#A36AC4','#36756F',
            '#F1B7D1','#FF9E75','#1A64A6','#629D38','#734555','#D3C9A0'],
  sectionSize: 10,
  /* Which boards are the other game is not a setting and is not here. It is
     `Levels.bubbleSlots`, which explains why. What belongs here is what turning
     it on did not cost: ORDER is monotone in measured difficulty and a
     subsequence of a sorted sequence is still sorted, so taking boards out
     recomputes no par and regenerates no ordering. */
  sectionNames: ['The Cellar','The Apothecary','The Distillery',
                 'The Conservatory','The Vault','The Observatory','The Furnace'],
  sectionTints: ['#7BC142','#F5B932','#3AA3E3','#9B5DE5','#FF6FA5','#1FC7A8','#FF5A36'],
  /* how far past the frontier the map lets you see */
  lookahead: 2,
  /* A word in the query string that fills the purse, for handing to a beta
     player who has run dry mid-report rather than making them wait out a day.

     It fills the purse to `purseCap` rather than paying a sum into it, so the
     link can be opened as many times as you like and always lands on the same
     number, and playing on afterwards cannot climb past it either. Absurd on
     purpose: this is not a top-up to be balanced against anything, it is the
     end of the economy for one save.

     It guards nothing. The save is localStorage on the player's own device and
     anyone who wants gold can type it into a console, so this is a convenience
     with a password-shaped hole in it, not a lock. It is written down here in
     plain sight for the same reason: pretending otherwise would only make the
     next person think it was load-bearing. It comes out with the beta. */
  beta: { word: 'jabarimoneeey' },
  solver: { nodeCap: 400000, msCap: 8000 },
  /* Gold is deliberately thin: the only rescue worth buying costs about three
     well-played new levels, and replaying old ones barely pays, so a stockpile
     has to be earned on new boards rather than ground out on cleared ones.
     A good first run pays 14, a replay 6, a sloppy replay 1. */
  economy: {
    startingGold: 86,
    /* The most the purse will ever hold. Nothing earned in the game gets near
       it — a good clear pays 14 — so this exists for the one thing that can:
       the beta word, which fills the purse to exactly this. It is a ceiling
       rather than a starting point, so playing on afterwards cannot climb past
       it and turn the joke into an eight digit number the header has no room
       for. Every rise in 40-progress.js goes through it. */
    purseCap: 9999999,
    starGold: { 3: 6, 2: 3, 1: 1 },
    firstClear: 8,
    daily: 12,
    vessel: 45,
    /* The dearest thing in the game, and deliberately not by much.

       A blast is bought on a board that is beating you, so its real competition
       is not the vessel: it is another go at five, and paying past the board at
       ten. Against those, what it sells is a two star clear on a level that
       would otherwise stay unbeaten — worth three in star gold and eight in the
       one-off bonus. So a large number is the wrong instinct. The purse opens at
       86, a good level pays 14, and this economy loses its pressure above about
       150; a tool priced up there is priced above the figure the whole thing is
       tuned to keep you under, and becomes an item you can only afford by not
       playing.

       Sixty five is dear where dear means something here: four and a half good
       levels against the vessel's three, affordable on an opening purse, and
       never affordable alongside a vessel in the same run. Having to choose
       which rescue you can carry is the tension; owning both is not. The tests
       pin all three of those. */
    blast: 65,
    freeUndos: 3,
    undoCost: 8,
    /* A hint names the move the solver would play, so it never costs a star: it
       tells you the optimal move, and taking an optimal move is what earns the
       stars in the first place.

       Which is exactly why it has to be dear. An undo takes back one mistake; a
       hint stops you making it, and a player who can afford them freely is being
       handed a three star run a move at a time. At this price it is worth about
       four clean clears, so it is a way out of a board you cannot read rather
       than a way to play the game. */
    hint: 25,
    /* Going back to a level you have already cleared is free. The fee exists to
       give a failed run a price, and a level you have beaten has no run to lose:
       chasing the third star is the part worth encouraging, not taxing. This is
       only safe because a level pays for the stars it is worth rather than for
       every clear, so replaying it cannot mint gold. See 40-progress.js. */
    replay: 0,
    /* Every board dealt costs the same, whether it is a new level or another go
       at one you just lost. It is the entry fee that gives a failed run a price:
       without it, failing costs nothing but the time already spent. Small enough
       that the daily draught alone keeps anyone solvent. */
    attempt: 5,
    /* Paying past a board you cannot beat costs twice an attempt, and that covers
       dealing the next one too, so moving on is one decision rather than two
       charges. Derived from the attempt fee so the two cannot drift apart. */
    skipMultiple: 2
  },
  /* Stars are pours over par: par earns three, one over two, two over one, and
     three or more over is a failed run worth nothing. */
  stars: { three: 0, two: 1, one: 2 }
};
