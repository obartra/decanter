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
     same shot-chooser the hint button offers and report the spread, which is
     what a threshold set at a percentile actually means. */
const LabSweep = (() => {

  const percentile = (sorted, p) => sorted[Math.floor((sorted.length - 1) * p)];

  /* Par for every level in a range, using the game's own level table and its own
     search. `shipped` is what the game says the par is; `found` is what the
     search says when asked again. They should agree, and the interesting case is
     when they do not — that is a table and a searcher that have come apart. */
  function pars(mods, from, to){
    const { levels, search } = mods;
    const rows = [];
    for (let level = from; level <= to; level++){
      const board = levels.make(level);
      if (!board){ rows.push({ level, shipped: null, found: null, gone: true }); continue; }
      const shipped = typeof levels.par === 'function' ? levels.par(level) : null;
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

  /* How long a run lasts, played by the game's own shot-chooser.

     `greedy` is the line the hint button would offer; random aim is the floor.
     The gap between them is how much the game rewards playing well, and a board
     where that gap is small is a luck readout however hard it happens to be —
     which is the thing worth being able to see the moment a cadence knob moves. */
  function survival(mods, seeds, greedy){
    const { C, grid, shot, rules, advice, score, rng: Rng } = mods;
    /* The game's own stream, not a copy of it. src/bubble/js/10-rng.js exists
       because there were three copies of this xorshift that were all meant to be
       the same and nothing made them so, and the reason that mattered is exactly
       this one: a harness that draws its numbers differently from the game
       measures a game nobody plays. Writing a fourth copy here would have
       falsified that file's opening paragraph from inside the tool built to
       check the game against itself. */
    const rng = seed => Rng.from(seed);
    const CAP = 600;
    const shots = [];
    const how = {};
    for (let seed = 1; seed <= seeds; seed++){
      const rnd = rng(seed * 2654435761);
      const board = rules.dealBoard(5, rnd);
      let since = 0, ended = 'capped', lasted = CAP;
      for (let n = 1; n <= CAP; n++){
        const live = rules.liveColours(board);
        if (!live.length){ ended = 'cleared'; lasted = n - 1; break; }
        const colour = live[Math.floor(rnd() * live.length)];
        let landing = null;
        if (greedy){
          const best = advice.bestShot(board, colour, shot.resolveShot);
          landing = best && best.landing;
        } else {
          const a = (rnd() * 160 - 80) * Math.PI / 180;
          landing = shot.resolveShot(board, C.MUZZLE, { x: Math.sin(a), y: -Math.cos(a) }).landing;
        }
        if (!landing){ ended = 'blocked'; lasted = n - 1; break; }
        const res = rules.resolveTurn(board, landing, colour);
        if (res.won){ ended = 'cleared'; lasted = n; break; }
        if (res.lost){ ended = 'line'; lasted = n; break; }
        if (++since >= score.cadenceAt(n)){
          since = 0;
          grid.advance(board, rules.freshRow(board, rnd));
          rules.remove(board, rules.detach(board));
          if (rules.isLost(board)){ ended = 'line'; lasted = n; break; }
        }
      }
      shots.push(lasted);
      how[ended] = (how[ended] || 0) + 1;
    }
    const sorted = shots.slice().sort((a, b) => a - b);
    const p10 = percentile(sorted, 0.1), p50 = percentile(sorted, 0.5), p90 = percentile(sorted, 0.9);
    return {
      kind: 'survival', shots, how, p10, p50, p90,
      max: sorted[sorted.length - 1],
      /* A run that can go several times longer than typical cannot be graded,
         because any threshold is either trivial for the lucky or unreachable for
         everyone else. */
      spread: +(p90 / Math.max(1, p10)).toFixed(2)
    };
  }

  /* Whether the shipped thresholds still describe the game the knobs now make.
     The same claim tools/bubble-survival.mjs prints, said here while the knob is
     still under the finger. */
  function tracks(stars, run){
    const near = (a, b) => Math.abs(a - b) <= Math.max(6, b * 0.2);
    return near(stars.one, run.p10) && near(stars.two, run.p50) && near(stars.three, run.p90);
  }

  return { pars, survival, tracks, percentile };
})();
globalThis.LabSweep = LabSweep;
