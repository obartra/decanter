/* What a level deals. Deterministic in the level number, so level 12 is the
   same bench for everyone, forever, and par can be a committed table rather than
   something rediscovered on every visit.

   A board is three numbers: the capacities, which vessel starts full, and the
   target. The first is the only one that is really free, since the largest
   vessel always starts full and the rest start empty — there is no tap, so all
   the wine there will ever be has to already be on the bench, and putting it
   anywhere but the largest vessel would just be a board one pour further along.
   One starting position per set of capacities means a level really is its
   capacities and its target, which is what makes it worth writing two numbers
   into 32-order.js and nothing else. */
const MeasureLevels = (() => {
  const C = MeasureConfig;

  /* Copied rather than imported, exactly as the bubble game copies its own
     stream. The three games share no module, and a shared RNG would be a piece
     of the pour game that this one could not change without moving somebody
     else's levels. Twenty-six lines is a cheap price for that. */
  function mulberry32(seed){
    let a = seed >>> 0;
    return function(){
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* avalanche, so adjacent seeds give unrelated benches rather than benches that
     share their first two capacities */
  function hashSeed(n){
    let h = (2166136261 ^ n) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }

  /* A bench, from a vessel count and a seed.

     Capacities are drawn by shuffling the whole range and taking the front of
     it, rather than by picking numbers and rejecting duplicates. Rejection would
     make the number of draws depend on the collisions, so the stream would be at
     a different place afterwards depending on how unlucky it had been, and the
     target would move for reasons nothing else could see.

     Deals whatever it is asked for and checks nothing. Whether the target can be
     reached at all is a search, and it is answered once offline by
     tools/measure-field.mjs, which is where the seeds in 32-order.js come from.
     A seed that is not in that table has been measured by nobody, which is
     exactly why 45-score.js refuses to rate it. */
  function fromSeed(vessels, seed){
    /* the count folded into the seed, so seed 7 with three vessels and seed 7
       with four are unrelated boards rather than the same board with one added */
    const rng = mulberry32(hashSeed(seed * 8 + vessels));
    const pool = [];
    for (let c = C.CAP_MIN; c <= C.CAP_MAX; c++) pool.push(c);
    for (let i = pool.length - 1; i > 0; i--){
      const j = Math.floor(rng() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    const caps = pool.slice(0, vessels).sort((a, b) => b - a);
    const total = caps[0];

    /* Anything the bench could hold, except an amount some vessel measures on
       its own: a target equal to a capacity is answered by filling that vessel
       to the brim, which is a shorter and much duller board. Never empty,
       because CAP_MIN is 2, so 1 is never a capacity and is always a candidate.
       The day someone lowers CAP_MIN to 1 that stops being true. */
    const wanted = [];
    for (let t = 1; t < total; t++) if (!caps.includes(t)) wanted.push(t);
    const target = wanted[Math.floor(rng() * wanted.length)];

    return { caps, start: caps.map((c, i) => (i === 0 ? c : 0)), target };
  }

  /* What a level is made of. MeasureOrder is the measured ordering and is the
     answer whenever it has one.

     Past the end of it a level is still a real bench and can still be played, it
     has simply never been vetted for how good it is — so it may well be trivial.
     Measured over the five hundred benches after the table, pars there run 1 to
     15 with a median of 3, against a table that ends at 20. Unvetted, not
     unsolvable: make() below walks the seed until it finds a bench that can be
     finished, so every one of those five hundred can be.

     The count does not climb with the level number there, because a bigger bench
     is an EASIER bench: every extra vessel is another route to the target, so
     climbing it would be a difficulty curve pointing downhill. It uses the
     largest count instead, which is the one the measurement chose every single
     time it was offered a choice. */
  function shape(level){
    const e = globalThis.MeasureOrder && globalThis.MeasureOrder[level];
    if (Array.isArray(e) && e.length === 2 && e.every(Number.isInteger)) return { vessels: e[0], seed: e[1] };
    return { vessels: C.VESSELS[C.VESSELS.length - 1], seed: level };
  }

  /* Past the table, deal a bench that can actually be finished.

     `fromSeed` picks a target from every amount below the largest capacity, and
     a good many of those cannot be reached by pouring: measured over the levels
     this actually deals, about one bench in eight has a target no sequence of
     pours arrives at. Those were being dealt anyway and then announced as
     unplayable at the moment they appeared, which is a strange thing to hand
     somebody who pressed Next.

     So the seed is walked until the bench is solvable. The search is exhaustive
     and a four-vessel bench tops out around three thousand positions, so this
     costs under a millisecond and almost always accepts the first seed. A level
     is still a pure function of its number, which is the property everything
     else here rests on; it is simply a function with a search in it.

     Bounded, and it gives up rather than looping: if sixty seeds in a row cannot
     produce a solvable bench then something is wrong with the shape rather than
     with the luck, and the honest answer is the bench the level asked for, which
     the page will show as unrated. */
  function solvable(bench){
    const S = globalThis.MeasureSearch;
    if (!S) return true;                 /* loaded without the search, as tests may */
    const got = S.solve(bench.caps, bench.start, bench.target);
    return got.exact && got.par != null;
  }

  function make(level){
    const { vessels, seed } = shape(level);
    const ordered = globalThis.MeasureOrder && globalThis.MeasureOrder[level];
    if (ordered) return fromSeed(vessels, seed);
    for (let n = 0; n < 60; n++){
      const bench = fromSeed(vessels, seed + n * 7919);
      if (solvable(bench)) return bench;
    }
    return fromSeed(vessels, seed);
  }

  return { fromSeed, shape, make };
})();
globalThis.MeasureLevels = MeasureLevels;
