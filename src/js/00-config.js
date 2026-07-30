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
  solver: { nodeCap: 400000, msCap: 8000 }
};
globalThis.CONFIG = CONFIG;
