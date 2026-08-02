/* Par, and how it is known to be the minimum.

   Breadth first, and exact. The other game needs A* with an admissible
   heuristic, a bucket queue and a pile of prose about why the bound holds,
   because its state space is enormous. This one does not, and the reason is
   worth stating: the total volume is conserved, so a position is a way of
   splitting one number into three or four bounded parts. A board of [24, 17,
   11, 5] has a few thousand reachable positions. Plain breadth first walks the
   lot in a millisecond and the first time it touches the target it is standing
   on the minimum by construction — there is nothing to prove about a heuristic
   because there is no heuristic.

   That is also why an inexact answer here is not the ordinary case it is over
   there. `SEARCH_CAP` exists as a tripwire, not as a budget: a board that trips
   it is a board whose generator has gone wrong, and it comes back unrated rather
   than guessed at. See 45-score.js, which awards nothing for an unknown par.

   Par is a path, not an estimate, for the same reason it is over there: the
   search returns the length of a sequence of legal moves it actually walked. */
import { MeasureConfig } from './00-config.js';
import { MeasureRules } from './20-rules.js';

export const MeasureSearch = (() => {
  const C = MeasureConfig;
  const R = MeasureRules;

  /* Walk the parent links back from a goal to the start, then turn them the
     right way round. Stored as key -> {move, from} rather than as a path per
     node, because a path per node is the same memory as the whole search
     repeated once for every state in it. */
  function trace(parents, goalKey){
    const moves = [];
    let at = goalKey;
    /* Bounded by the number of states, which is the number of parent links, so
       a cycle in the links would spin here forever. There cannot be one — every
       link points at a strictly shallower state — but this is a search and the
       cost of being wrong is a hung tab. */
    for (let guard = 0; guard <= parents.size; guard++){
      const step = parents.get(at);
      if (!step) return moves.reverse();
      moves.push(step.move);
      at = step.from;
    }
    return null;
  }

  /* The whole answer: par from this position, whether it is proven, and the
     moves that get there. Everything public is a view of this.

     Three outcomes, and they are genuinely different things:

       par a number, exact       the minimum, walked
       par null, exact true      the target cannot be reached from here, proven
                                 by having exhausted every position this bench
                                 can get into. Note carefully that this is a
                                 property of the BOARD and never of the play: by
                                 the argument at the top of 20-rules.js, the
                                 opening position is reachable from every
                                 position, so no sequence of pours can make a
                                 reachable target unreachable. If this comes back
                                 mid-run, it was already true at the deal.
       par null, exact false     the tripwire fired. Nothing is known. */
  function search(caps, start, target, nodeCap){
    const cap = nodeCap == null ? C.SEARCH_CAP : nodeCap;
    if (R.isSolved(start, target)) return { par: 0, exact: true, moves: [] };

    const parents = new Map();
    parents.set(R.key(start), null);
    let frontier = [start];
    let depth = 0;
    let nodes = 1;

    while (frontier.length){
      depth++;
      const next = [];
      for (const at of frontier){
        const fromKey = R.key(at);
        for (const o of R.outcomes(caps, at)){
          if (parents.has(o.key)) continue;
          if (++nodes > cap) return { par: null, exact: false, moves: null };
          parents.set(o.key, { move: o.move, from: fromKey });
          if (R.isSolved(o.amount, target)){
            return { par: depth, exact: true, moves: trace(parents, o.key) };
          }
          next.push(o.amount);
        }
      }
      frontier = next;
    }
    return { par: null, exact: true, moves: null };
  }

  /* What the page asks. `first` is the move a hint names: the head of one
     optimal line from wherever the player currently is, which is the right thing
     to offer rather than the head of the line from the opening position, because
     by move four they are not on that line any more. */
  function solve(caps, start, target, nodeCap){
    const got = search(caps, start, target, nodeCap);
    return { par: got.par, exact: got.exact, first: got.moves && got.moves.length ? got.moves[0] : null };
  }

  /* One optimal line, whole. Used by the tests to assert that a published par is
     a par somebody can actually play, which is the check that would catch a
     search that had drifted from the rules. */
  const line = (caps, start, target, nodeCap) => search(caps, start, target, nodeCap).moves;

  /* ---- the offline measurement ----

     How long the board is AND how much of a decision each step of it is. This is
     what tools/measure-field.mjs selects levels on, and it lives here rather
     than in the tool for one reason: there is no second implementation of these
     rules to measure against.

     The other game can afford to measure its difficulty in a tool, because
     tests/baseline.mjs is an independent restatement of its rules and the tool
     uses that — so a tool that has drifted from the game shows up as the two
     implementations disagreeing. Here there is only one implementation, so a
     tool with its own copy of the pour rule would not be a cross-check, it would
     just be a second place for the same mistake to live, and the game and the
     ordering could quietly come to be about different games. The cost is a few
     hundred bytes the browser never calls.

     `choice` is the fraction of steps along one optimal line at which more than
     one DISTINCT next position keeps par reachable. Distinct outcomes, not legal
     pours: see MeasureRules.outcomes, and docs/design/02-levels.md for what the
     other game paid to learn the difference. `tight` is the average share of the
     options at a step that are correct, so a low tight is a narrow line and a
     low choice is a handle being turned. They disagree usefully: a board can be
     long and mechanical, or short and vicious. */
  function survey(caps, start, target, nodeCap){
    const cap = nodeCap == null ? C.SEARCH_CAP : nodeCap;

    /* Every position this bench can still reach, and what leads where. Built
       once, because the sweep below needs the edges backwards and the walk needs
       them forwards. */
    const index = new Map();
    const states = [];
    const adj = [];
    const push = amount => {
      const k = R.key(amount);
      let id = index.get(k);
      if (id === undefined){ id = states.length; index.set(k, id); states.push(amount); adj.push(null); }
      return id;
    };
    push(start);
    for (let i = 0; i < states.length; i++){
      if (states.length > cap) return null;
      adj[i] = R.outcomes(caps, states[i]).map(o => push(o.amount));
    }

    /* Distance to the nearest position that holds the target, swept backwards
       from all of them at once. Backwards rather than forwards because the
       question at each step is "which of my options keeps par reachable", and
       that is a fact about the successors' distances, not about mine. */
    const rev = states.map(() => []);
    for (let i = 0; i < adj.length; i++) for (const j of adj[i]) rev[j].push(i);
    const dist = states.map(() => -1);
    let frontier = [];
    for (let i = 0; i < states.length; i++){
      if (R.isSolved(states[i], target)){ dist[i] = 0; frontier.push(i); }
    }
    for (let d = 1; frontier.length; d++){
      const next = [];
      for (const i of frontier) for (const j of rev[i]) if (dist[j] === -1){ dist[j] = d; next.push(j); }
      frontier = next;
    }

    const par = dist[0];
    if (par < 0) return { par: null, exact: true, states: states.length, choice: 0, tight: 0, dead: 1 };

    /* Walk one optimal line rather than all of them. All of them is exact and
       explodes; one is cheap and orders boards the same way, which is the same
       call the other game's measurement makes. The middle option is taken at
       each step so the line is not systematically whatever outcomes() happens to
       emit first. */
    let at = 0, steps = 0, branchy = 0, odds = 0;
    while (dist[at] > 0){
      const options = adj[at];
      const good = options.filter(j => dist[j] === dist[at] - 1);
      odds += good.length / Math.max(1, options.length);
      if (good.length > 1) branchy++;
      at = good[Math.floor(good.length / 2)];
      steps++;
    }
    const reachable = dist.filter(d => d >= 0).length;
    return {
      par, exact: true, states: states.length,
      choice: branchy / Math.max(1, steps),
      tight: odds / Math.max(1, steps),
      /* The share of reachable positions from which the target can no longer be
         reached. It is ZERO on every solvable board and provably has to be — see
         the argument at the top of 20-rules.js — so this is not a difficulty
         signal, it is the assertion that the proof is still true. If a change to
         the rules ever lets a vessel other than the largest start with wine in
         it, or introduces a drain, this is the number that will stop being zero
         and it will do so before anything else notices. */
      dead: (states.length - reachable) / states.length
    };
  }

  return { solve, line, survey };
})();
