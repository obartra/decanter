/* What a run was worth, as a decision rather than a pile of comparisons.

   The other game grades a run by its distance from par, which it can do because
   par is an exact minimum solved offline. This one has no par and cannot have
   one: the next bubble is dealt at random, so the board is not perfect
   information, and the aim discretises to about thirty landing cells across a
   run of thirty-odd shots. There is nothing to search.

   What it has instead is a distribution. Play the board a few hundred times with
   the same rule the hint uses and the run lengths spread out, so a threshold set
   at a percentile of that spread means something exact: "longer than nine in ten
   competent runs" is a real claim, where "par plus two" is a different kind of
   real claim about a different kind of game.

   Kept separate from the app for the reason the other game's panel is: the
   interesting cases are the hard ones to reach by hand. A capped three star run,
   a cleared board that also used an aid, a run that ended on the exact
   threshold. All of them are numbers, so all of them can simply be asserted. */
const BubbleScore = (() => {
  const C = BubbleConfig;

  /* Stars for a finished run.

     Clearing pays three outright. That is the equivalent of solving at par and
     it should not be reachable by outlasting the board, however long the player
     hung on: the two endings are different achievements and collapsing them
     would make the rare one worthless.

     The other game's warning applies here and is the reason this function
     exists at all. Its rate() awards full marks when it has no par to measure
     against, which past the end of the par table would mean a level that can
     neither be failed nor played badly, paying out forever. A bubble level has
     no par by construction, so it must never reach that path: it is graded here
     or not at all. */
  function stars({ cleared, shots, aided }){
    const earned = cleared ? 3
      : shots >= C.STAR_SHOTS.three ? 3
      : shots >= C.STAR_SHOTS.two ? 2
      : shots >= C.STAR_SHOTS.one ? 1
      : 0;
    return aided ? Math.min(earned, C.AID_CAP) : earned;
  }

  /* How far into the next star this run got, for a bar that means something
     while the run is still going. Full once the third is earned. */
  function progress(shots){
    const { one, two, three } = C.STAR_SHOTS;
    if (shots >= three) return 1;
    const bands = [[0, one], [one, two], [two, three]];
    const i = shots >= two ? 2 : shots >= one ? 1 : 0;
    const [from, to] = bands[i];
    return (i + (shots - from) / (to - from)) / 3;
  }

  /* The shots still to go before the next star, or null once all three are in
     hand. What the run is playing for, in the only unit it can be played for. */
  function nextStarAt(shots){
    const { one, two, three } = C.STAR_SHOTS;
    for (const at of [one, two, three]) if (shots < at) return at;
    return null;
  }

  /* Best is the *longest* run here, where the other game's best is the *fewest*
     pours. Both are "best" and they compare in opposite directions, which is the
     kind of difference that survives a code review and then quietly records the
     worst run of every bubble level forever. Anything comparing two results goes
     through this. */
  const better = (a, b) => (a == null ? b : b == null ? a : Math.max(a, b));

  /* The cadence at a given point in a run: one shot faster every RAMP_EVERY,
     never below the floor. Pure so the harness, the HUD and the turn all get
     the same answer rather than three implementations of it. */
  function cadenceAt(shots){
    const off = Math.floor(shots / C.RAMP_EVERY);
    return Math.max(C.ADVANCE_MIN, C.ADVANCE_EVERY - off);
  }

  return { stars, progress, nextStarAt, better, cadenceAt };
})();
globalThis.BubbleScore = BubbleScore;
