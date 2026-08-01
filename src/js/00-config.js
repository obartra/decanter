/* Tunables that other modules read. Pure data, safe to load anywhere. */
const CONFIG = {
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
  sectionNames: ['The Cellar','The Apothecary','The Distillery',
                 'The Conservatory','The Vault','The Observatory'],
  sectionTints: ['#7BC142','#F5B932','#3AA3E3','#9B5DE5','#FF6FA5','#1FC7A8'],
  /* how far past the frontier the map lets you see */
  lookahead: 2,
  solver: { nodeCap: 400000, msCap: 8000 },
  /* Gold is deliberately thin: the only rescue worth buying costs about three
     well-played new levels, and replaying old ones barely pays, so a stockpile
     has to be earned on new boards rather than ground out on cleared ones.
     A good first run pays 14, a replay 6, a sloppy replay 1. */
  economy: {
    startingGold: 86,
    starGold: { 3: 6, 2: 3, 1: 1 },
    firstClear: 8,
    daily: 12,
    vessel: 45,
    freeUndos: 3,
    undoCost: 8,
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
globalThis.CONFIG = CONFIG;
