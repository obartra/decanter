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
   - **panel**, for the graded game, whose interesting surface is neither a par
     nor a distribution but a DECISION: what the end-of-run panel offers, given
     a run and a purse together. Enumerated rather than sampled, because the
     axes are small and the combinations are what nobody can reach by hand.
   - **survival**, for the game that cannot have a par. Play whole runs with the
     same shot-chooser the hint button offers, at a given miss rate, and report
     how often each bar is cleared. Pass rates rather than percentiles, because
     that is what the bars were set from: a bot's tenth percentile is not a
     person's, and the bars read off one sat where a real player cleared the
     first star — the one that opens the next level — barely half the time. */
export const LabSweep = (() => {

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
      const live = rules.liveColors(b);
      if (!live.length) return { shots: n - 1, how: 'cleared', turns, forced };
      const color = live[Math.floor(rnd() * live.length)];

      /* Asked for on every turn whether or not it is taken, so the stream
         advances the same way at every miss rate and the forced count is a
         property of the board rather than of the policy. */
      const best = advice.bestShot(b, color, shot.resolveShot);
      if (!best) return { shots: n - 1, how: 'blocked', turns, forced };
      turns++;
      if (best.matched === 0) forced++;

      let landing = best.landing;
      if (rnd() < miss){
        const cells = landings(b);
        if (cells.length) landing = cells[Math.floor(rnd() * cells.length)];
      }

      const res = rules.resolveTurn(b, landing, color);
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
      /* Three turns in five have nothing to clear with the color in hand, which
         is the least obvious thing about this game and the reason a run is not a
         string of decisions. If it ever climbs toward nine in ten the game has
         become a dumping exercise and no test of the rules would notice. */
      forced: turns ? outs.reduce((n, o) => n + o.forced, 0) / turns : 0,
      at: {
        one: rate(C.STAR_SHOTS.one),
        two: rate(C.STAR_SHOTS.two),
        three: outs.filter(finished).length / outs.length
      }
    };
  }

  /* Every end-of-run panel the game can show.

     `Panel.decide` takes about twenty inputs and returns which buttons are
     drawn, which are dead, which one is primary and what the hint says. That is
     the densest decision in the codebase and it is also the hardest to reach:
     getting to one combination means playing a level to a particular ending
     with a particular purse, and the pours are animated, so a run that ends the
     way you wanted takes a minute of real time.

     So the axes are enumerated and the real function is asked. Nothing here
     re-implements a rule; the frame's own `Panel` decides, and what is drawn is
     what it said. The value is in seeing them side by side — a button offered on
     a screen it makes no sense on, or two states that should differ coming out
     identical, is obvious in a column and invisible one run at a time. */
  function panels(mods){
    const { panel, lastLevel } = mods;
    const rows = [];
    /* The axes that change the answer, and only those. `moves` and `best` move
       the sentence rather than the offer, so they are held still: a matrix with
       a row for every pour count is one nobody reads. */
    const endings = [
      { as: 'cleared', failed: false, stars: 3, reason: null },
      { as: 'cleared, one over', failed: false, stars: 2, reason: null },
      { as: 'cleared, scraped', failed: false, stars: 1, reason: null },
      { as: 'failed: out of pours', failed: true, stars: 0, reason: 'over' },
      { as: 'failed: no legal move', failed: true, stars: 0, reason: 'stuck' },
      { as: 'failed: short', failed: true, stars: 0, reason: 'short' }
    ];
    const purses = [
      { as: 'rich', canPayFee: true, canPayNext: true, canPaySkip: true, canPayBlast: true },
      { as: 'can retry, cannot go on', canPayFee: true, canPayNext: false, canPaySkip: false, canPayBlast: false },
      { as: 'empty', canPayFee: false, canPayNext: false, canPaySkip: false, canPayBlast: false }
    ];
    const wheres = [
      { as: 'mid run', level: 12, nextUnlocked: true },
      { as: 'at the frontier', level: 12, nextUnlocked: false },
      { as: 'the last board', level: lastLevel, nextUnlocked: false }
    ];
    const blasts = [
      { as: 'no blast', blastGranted: false, blastUsed: false, blastTargets: 0 },
      { as: 'blast, would help', blastGranted: true, blastUsed: false, blastTargets: 3 },
      { as: 'blast, nothing to hit', blastGranted: true, blastUsed: false, blastTargets: 0 },
      { as: 'blast, already spent', blastGranted: true, blastUsed: true, blastTargets: 3 }
    ];

    for (const where of wheres){
      for (const ending of endings){
        for (const purse of purses){
          for (const blast of blasts){
            /* A blast is only ever offered on a failed run, so every blast axis
               on a cleared one is the same screen four times. */
            if (!ending.failed && blast.as !== 'no blast') continue;
            const input = {
              level: where.level, lastLevel, nextUnlocked: where.nextUnlocked,
              failed: ending.failed, stars: ending.stars, reason: ending.reason,
              canPayFee: purse.canPayFee, canPayNext: purse.canPayNext,
              canPaySkip: purse.canPaySkip, canPayBlast: purse.canPayBlast,
              blastGranted: blast.blastGranted, blastUsed: blast.blastUsed,
              blastTargets: blast.blastTargets,
              improvedStars: false, hadStars: 0, totalStars: 210,
              par: 14, parExact: true, moves: ending.failed ? 19 : 14 + (3 - ending.stars),
              best: null
            };
            let out, threw = null;
            try { out = panel.decide(input); }
            catch (e) { threw = e.message; }
            rows.push({
              where: where.as, ending: ending.as, purse: purse.as, blast: blast.as,
              out, threw
            });
          }
        }
      }
    }

    /* What the matrix is FOR, said as claims rather than left to the eye. Each
       of these is something the panel must never do, and each is invisible in a
       single run because a single run only ever shows one row. */
    const faults = [];
    for (const r of rows){
      if (r.threw){ faults.push(`${r.ending} / ${r.purse}: decide() threw — ${r.threw}`); continue; }
      const o = r.out;
      const offers = [!o.retryHidden, !o.nextHidden, !o.skipHidden, !o.blastHidden];
      if (!offers.some(Boolean) && !o.atEnd)
        faults.push(`${r.where} / ${r.ending} / ${r.purse}: offers nothing at all`);
      if (!o.blastHidden && !r.blast.startsWith('blast, would'))
        faults.push(`${r.ending} / ${r.blast}: a blast is offered that cannot rescue anything`);
      if (!o.nextHidden && o.atEnd)
        faults.push(`${r.where}: a next board is offered past the end of the game`);
      if (!o.skipHidden && !o.stuck)
        faults.push(`${r.where} / ${r.ending}: Move on is offered to a run that is not stuck`);
      if (o.retryPrimary && o.nextPrimary)
        faults.push(`${r.ending}: two primary buttons`);
      /* No check that a hint exists. An ordinary clean win has nothing to say
         beyond the result, and demanding a line there would be asking the panel
         to fill silence. What IS checked is the one case where silence is wrong:
         a button offered and dead. */
      /* A dead button with nothing saying why is the failure this panel was
         split out of the app to prevent: the screen looks broken rather than
         refused. `BROKE` is the module's own sentence, asked for by name rather
         than matched on, so the two cannot part company. */
      if (o.retryDisabled && !o.retryHidden && o.hint !== panel.BROKE)
        faults.push(`${r.ending} / ${r.purse}: Retry is dead and the hint does not say why`);
    }
    return { kind: 'panel', rows, faults };
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
  return { pars, panels, survival, tracks, runOne };
})();
