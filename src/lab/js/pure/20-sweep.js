/* Measuring a range of levels, or a spread of runs, from inside the page.

   Pure: it is handed the game's own modules and does arithmetic on what they
   return. That is the whole design. A lab that reimplemented a game's rules
   would be measuring a game nobody plays, which is the exact mistake
   tools/bubble-survival.mjs records having made and corrected — its first
   version had its own copy of the deal and the shot-chooser, and the numbers it
   produced described neither.

   So there is no geometry here and no rules. Two shapes of measurement:

   - **par**, for the two games that have one. Solve every level in a range and
     report the curve. Because par is exact this is not a sample, it is the
     answer, and a step that goes down is a real fault in the ordering rather
     than noise to be squinted at.
   - **survival**, for the game that cannot have a par. Play whole runs with the
     same shot-chooser the hint button offers, at a given miss rate, and report
     how often each bar is cleared. Pass rates rather than percentiles, because
     that is what the bars were set from: a bot's tenth percentile is not a
     person's, and the bars read off one sat where a real player cleared the
     first star — the one that opens the next level — barely half the time. */
const LabSweep = (() => {

  /* Par for every level in a range, using the game's own level table and its own
     search. `shipped` is what the game says the par is; `found` is what the
     search says when asked again. They should agree, and the interesting case is
     when they do not — that is a table and a searcher that have come apart. */
  function pars(mods, from, to){
    const { levels, search, pars: table } = mods;
    const rows = [];
    /* Straight off the committed table, which both games publish as { last, par }.
       It used to ask `levels.par(level)`, and only one of the two games has such
       a function -- so for the other, `shipped` was null for every level, every
       comparison against it was skipped, and `disagreements` came back empty
       because nothing had been compared. An empty list of disagreements is what
       success looks like, which is why it went unnoticed: the panel said the
       table and the search agreed, having asked neither. */
    const shippedFor = level => {
      if (table && table.par && Number.isInteger(table.par[level])) return table.par[level];
      if (typeof levels.par === 'function') return levels.par(level);
      return null;
    };
    for (let level = from; level <= to; level++){
      const board = levels.make(level);
      if (!board){ rows.push({ level, shipped: null, found: null, gone: true }); continue; }
      const shipped = shippedFor(level);
      const got = board.caps
        ? search.solve(board.caps, board.start, board.target)
        : search.solve(board.layout, board.start);
      rows.push({
        level,
        shipped: Number.isInteger(shipped) ? shipped : null,
        found: got && Number.isInteger(got.par) ? got.par : null,
        exact: !!(got && got.exact)
      });
    }
    return { kind: 'par', rows, ...verdict(rows) };
  }

  /* What the curve says about itself. A par curve is meant to be non-decreasing:
     the whole point of measuring difficulty offline is that level 30 is not
     easier than level 12. */
  function verdict(rows){
    const seen = rows.map(r => (r.found == null ? r.shipped : r.found)).filter(v => v != null);
    const drops = [];
    for (let i = 1; i < rows.length; i++){
      const a = rows[i - 1].found ?? rows[i - 1].shipped;
      const b = rows[i].found ?? rows[i].shipped;
      if (a != null && b != null && b < a) drops.push(rows[i].level);
    }
    const disagreements = rows
      .filter(r => r.shipped != null && r.found != null && r.shipped !== r.found)
      .map(r => r.level);
    return {
      min: seen.length ? Math.min(...seen) : null,
      max: seen.length ? Math.max(...seen) : null,
      drops,
      disagreements,
      unrated: rows.filter(r => r.found == null && r.shipped == null).map(r => r.level)
    };
  }

  /* A batch of bubble runs, played the way tools/bubble-run.mjs plays them.

     That file exists because the survival tool and the difficulty test had a run
     loop each, and the two disagreed about whether a row comes down after the
     final shot — a whole star's worth of difference on the runs it touches. This
     is the third such measurer and cannot import it: it is a browser page, and
     that is a node module. So the loop is written out here and
     tests/lab.test.mjs runs both over the same seeds and requires the same
     answers, seed for seed, which is the guard rather than the hope.

     `miss` is who is playing. 0 is the bot that takes the shot the hint would
     offer; 1 is somebody aiming at any reachable cell at all. A slip lands the
     bubble in a *different cell*, not at a random angle, because a random angle
     buries itself in the first thing it meets and is a worse player than any
     person — measured, that difference moved every threshold in the game.

     The order of the checks is BubbleApp.land's order and has to stay that way:
     the run is survived BEFORE the board comes down, or a row arriving after the
     final shot kills a player who was never given a shot to answer it with. */
  function runOne(mods, seed, { every, length, miss }){
    const { C, grid, shot, rules, advice, rng: Rng } = mods;
    /* The game's own stream, not a copy of it. src/bubble/js/10-rng.js exists
       because there were three copies of this xorshift that were all meant to be
       the same and nothing made them so, and the reason that mattered is exactly
       this one: a harness that draws its numbers differently from the game
       measures a game nobody plays. */
    const rnd = Rng.from(seed);
    const b = rules.dealBoard(5, rnd);

    /* Every cell a bubble can be put in from here, one entry per cell rather
       than per angle: a dozen angles reach the same cell, and counting each
       would weight the cells a wide fan happens to reach as if a player were
       likelier to pick them. */
    const landings = board => {
      const out = [], seen = new Set();
      for (const { dir } of advice.AIMS){
        const s = shot.resolveShot(board, C.MUZZLE, dir);
        if (!s.landing) continue;
        const k = `${s.landing.j},${s.landing.c}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s.landing);
      }
      return out;
    };

    let turns = 0, forced = 0, sinceDrop = 0;
    for (let n = 1; n <= length; n++){
      const live = rules.liveColours(b);
      if (!live.length) return { shots: n - 1, how: 'cleared', turns, forced };
      const colour = live[Math.floor(rnd() * live.length)];

      /* Asked for on every turn whether or not it is taken, so the stream
         advances the same way at every miss rate and the forced count is a
         property of the board rather than of the policy. */
      const best = advice.bestShot(b, colour, shot.resolveShot);
      if (!best) return { shots: n - 1, how: 'blocked', turns, forced };
      turns++;
      if (best.matched === 0) forced++;

      let landing = best.landing;
      if (rnd() < miss){
        const cells = landings(b);
        if (cells.length) landing = cells[Math.floor(rnd() * cells.length)];
      }

      const res = rules.resolveTurn(b, landing, colour);
      if (res.won) return { shots: n, how: 'cleared', turns, forced };
      if (res.lost) return { shots: n, how: 'line', turns, forced };
      if (n >= length) return { shots: n, how: 'survived', turns, forced };

      if (++sinceDrop >= every){
        sinceDrop = 0;
        grid.advance(b, rules.freshRow(b, rnd));
        rules.remove(b, rules.detach(b));
        if (rules.isLost(b)) return { shots: n, how: 'line', turns, forced };
      }
    }
    return { shots: length, how: 'survived', turns, forced };
  }

  /* A run that emptied the board got as far as anything can, so it passes every
     bar. Grading it on shots alone would score the best available ending as the
     shortest run in the set. */
  const passed = (o, at) => o.how === 'cleared' || o.shots >= at;
  /* The third star is an ending, not a count, exactly as BubbleScore has it. A
     run whose final shot loses reads RUN_SHOTS on the clock and did not survive,
     so counting shots for it would report a pass rate the game never pays. */
  const finished = o => o.how === 'cleared' || o.how === 'survived';

  function survival(mods, seeds, miss = 0){
    const { C } = mods;
    const opts = { every: C.ADVANCE_EVERY, length: C.RUN_SHOTS, miss };
    const outs = [];
    for (let seed = 1; seed <= seeds; seed++) outs.push(runOne(mods, seed, opts));
    const shots = outs.map(o => o.shots).sort((a, b) => a - b);
    const how = {};
    for (const o of outs) how[o.how] = (how[o.how] || 0) + 1;
    const rate = at => outs.filter(o => passed(o, at)).length / outs.length;
    const turns = outs.reduce((n, o) => n + o.turns, 0);
    return {
      kind: 'survival', miss, seeds, shots, how,
      median: shots[shots.length >> 1],
      max: shots[shots.length - 1],
      /* Three turns in five have nothing to clear with the colour in hand, which
         is the least obvious thing about this game and the reason a run is not a
         string of decisions. If it ever climbs towards nine in ten the game has
         become a dumping exercise and no test of the rules would notice. */
      forced: turns ? outs.reduce((n, o) => n + o.forced, 0) / turns : 0,
      at: {
        one: rate(C.STAR_SHOTS.one),
        two: rate(C.STAR_SHOTS.two),
        three: outs.filter(finished).length / outs.length
      }
    };
  }

  /* Whether the bars still separate playing from flailing, which is the claim
     they were set from and the one tools/bubble-survival.mjs prints. A bar a
     random aim clears is not a bar, and one the bot misses is not reachable. */
  function tracks(good, random){
    return good.at.one >= 0.8 && random.at.one <= 0.45
        && good.at.two >= 0.5 && random.at.two <= 0.2
        && good.at.three >= 0.2;
  }

  /* runOne is published for tests/lab.test.mjs, which plays it against
     tools/bubble-run.mjs seed for seed. Nothing in the page calls it directly. */
  return { pars, survival, tracks, runOne };
})();
globalThis.LabSweep = LabSweep;
