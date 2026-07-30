/* Tunables that other modules read. Pure data, safe to load anywhere. */
const CONFIG = {
  capacity: 4,
  maxColors: 12,
  minColors: 4,
  /* liquid palette, index === color id */
  palette: ['#E6402E','#F5B932','#7BC142','#3AA3E3','#9B5DE5','#1FC7A8',
            '#FF6FA5','#FF8A3D','#5A6BFF','#B6E132','#B33A63','#D9C6A0'],
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
    undoCost: 8
  },
  /* stars are pours against par: par or par+1 is clean, up to par+4 is passable */
  stars: { clean: 1, passable: 4 }
};
globalThis.CONFIG = CONFIG;
