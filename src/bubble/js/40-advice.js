/* Which shot to take, decided from the board rather than from taste.

   Two callers, and they must not disagree. The hint shows the player this shot,
   and the difficulty harness plays it a few hundred times to find out how long a
   competent run lasts. If the hint were cleverer than the bot, every measured
   threshold would be set against a worse player than the one being graded; if
   it were dumber, the hint would be advice the game itself would not take.

   Deliberately shallow: it looks one shot ahead and no further. A search that
   planned setups would be a better player and a worse hint, because a hint whose
   reasoning cannot be seen on the board reads as arbitrary. */
const BubbleAdvice = (() => {
  const C = BubbleConfig;
  const G = BubbleGrid;
  const R = BubbleRules;

  const clone = board => {
    const n = G.create(board.parity);
    n.rows = board.rows.map(r => r.slice());
    return n;
  };

  /* Every aim worth trying, as unit vectors. One degree is finer than a finger
     can hold and coarse enough to stay cheap; the landing cells it produces
     repeat long before the angles do. */
  const AIMS = (() => {
    const out = [];
    for (let deg = -80; deg <= 80; deg += 1){
      const a = deg * Math.PI / 180;
      out.push({ deg, dir: { x: Math.sin(a), y: -Math.cos(a) } });
    }
    return out;
  })();

  /* What a shot is worth. Cutting a chunk free scores more than the group that
     freed it, so the weights say so, and the tie break is board depth because
     the thing that actually ends a run is the board reaching the line. A pure
     score-maximising rule will happily clear the ceiling and lose. */
  function value(before, after, res){
    const gain = res.matched.length * C.SCORE_MATCH + res.cut.length * C.SCORE_CUT;
    const deepBefore = depth(before), deepAfter = depth(after);
    return gain * 10 + (deepBefore - deepAfter) * 40 - deepAfter;
  }
  const depth = board => {
    const cells = G.occupied(board);
    return cells.length ? Math.max(...cells.map(([j]) => j)) : 0;
  };

  /* The best shot for this colour, or null when nothing can land at all.
     `resolve` is passed in rather than reached for so this module never has to
     know about the shot solver, which keeps it loadable on its own. */
  function bestShot(board, colour, resolve){
    let best = null;
    /* One entry per landing cell, not per angle: a dozen angles reach the same
       cell and scoring each of them separately is the same board measured
       twelve times for no gain. */
    const seen = new Set();
    for (const { dir } of AIMS){
      const shot = resolve(board, C.MUZZLE, dir);
      if (!shot.landing) continue;
      const key = `${shot.landing.j},${shot.landing.c}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const after = clone(board);
      const res = R.resolveTurn(after, shot.landing, colour);
      const score = value(board, after, res);
      if (!best || score > best.score){
        best = { dir, landing: shot.landing, score,
                 matched: res.matched.length, cut: res.cut.length };
      }
    }
    return best;
  }

  /* Is there a shot that clears anything at all? The hint is worth offering when
     the answer is yes and worth withholding when it is no: a hint that points at
     a bubble which merely lands somewhere is not advice, and charging for one is
     worse than not having the button. */
  const hasClearingShot = (board, colour, resolve) => {
    const best = bestShot(board, colour, resolve);
    return !!best && best.matched > 0;
  };

  return { bestShot, hasClearingShot };
})();
globalThis.BubbleAdvice = BubbleAdvice;
