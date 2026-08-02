/* What a run was worth, as a decision rather than a pile of comparisons.

   The other game grades a run by its distance from par, which it can do because
   par is an exact minimum solved offline. This one has no par and cannot have
   one: the next bubble is dealt at random, so the board is not perfect
   information, and the aim discretises to about thirty landing cells across a
   run of thirty-odd shots. There is nothing to search.

   What it has instead is a fixed length and a pass rate. Play the board a few
   hundred times with the same rule the hint uses, missing some of them the way a
   person does, and the share that reaches a given shot is a claim as exact as
   par is: "three in four competent runs get this far" says something real, where
   "par plus two" says a different real thing about a different kind of game.

   Percentiles of a flawless bot are what this used to be graded on, and they are
   the trap. A bot's p10 is not a person's p10, and the thresholds read off one
   sat where a real player reached the first star barely half the time.

   The second trap is subtler and cost these numbers a revision. What a bad shot
   *is* decides everything: a slip modelled as a random angle mostly buries the
   bubble in the first thing it meets, and measured against that every bar looked
   far more earned than it was. Modelled as a bubble put in the wrong reachable
   cell, which is what a person actually does, the same bars let a player aiming
   at nothing in particular through a third of the time. They moved up.

   Worth knowing before touching any of this: on about three turns in five the
   colour in hand cannot clear anything at all, so most shots are placements
   rather than decisions, and the run is graded on where the placements went.

   Kept separate from the app for the reason the other game's panel is: the
   interesting cases are the hard ones to reach by hand. A capped three star run,
   a cleared board that also used an aid, a run that ended on the exact
   threshold. All of them are numbers, so all of them can simply be asserted. */
const BubbleScore = (() => {
  const C = BubbleConfig;

  /* Stars for a finished run.

     The third star is an ending, not a count. Finishing the run is what earns
     it, and finishing means the board was emptied or RUN_SHOTS were taken and
     none of them lost: `cleared` or `survived`, asked directly rather than
     inferred from the number of shots.

     Inferring it was the first version and it was wrong by exactly one shot. The
     run stops at RUN_SHOTS and STAR_SHOTS.three is RUN_SHOTS, so `shots >=
     three` looks like the same question, but the final shot can be the one that
     loses the run: it happens, the count reads 35, and a player who watched the
     bubbles cross the line is told they earned three stars for it. The first two
     stars stay counts because they are counts, and a run that ended at 34 really
     did get further than one that ended at 29.

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
  function stars({ cleared, survived, shots, aided }){
    const earned = cleared || survived ? 3
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
  const improved = (was, now) => was == null || now > was;

  /* There was a cadenceAt(shots) here, because the board used to come down
     harder the longer a run went on. The cadence is a constant now and the
     function would only be C.ADVANCE_EVERY wearing a hat, so the turn and the
     HUD read the config directly. */
  return { stars, progress, nextStarAt, better, improved };
})();
globalThis.BubbleScore = BubbleScore;
