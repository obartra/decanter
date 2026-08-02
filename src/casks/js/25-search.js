/* Par, and how it is known to be the minimum.

   Breadth first, and exact. There is no heuristic here and nothing to prove
   about one: a position is an integer per cask, the branching is a few dozen,
   and a dealt board's whole reachable component is a few thousand positions on a
   crowded floor. Breadth first reaches the door at depth d only after exhausting
   every position at depth d-1, so the first time it arrives it is standing on
   the minimum by construction. The pour game needs A*, an admissible heuristic,
   a bucket queue and a page of prose about why the bound holds because its state
   space is enormous; see docs/design/03-par.md for all of the machinery this
   game does not need.

   ---- THE ONE REAL IDEA IN THIS FILE ----

   SLIDING IS REVERSIBLE, SO THE MOVE GRAPH IS UNDIRECTED.

   If a cask can slide from a to b, it can slide back: the cells it passed over
   are exactly the ones it now covers or has just vacated, so nothing can have
   moved in behind it. Every edge therefore goes both ways, and that single fact
   is what makes the generator affordable.

   In an undirected graph the distance from a state to the goal equals the
   distance from the goal to the state. So ONE multi-source sweep outward from
   every state in which the gilt cask is already at the door gives the exact
   distance to the door for every state in the component at once. Two things fall
   out of that, and the second is the one that mattered:

     - Par for any start in the layout is a lookup, not a search.
     - The state FURTHEST from the door is provably the hardest start this layout
       can offer. Not the hardest found, the hardest there is.

   That turns generation from "deal a board, solve it, keep it if it is hard
   enough, otherwise deal another" into one sweep per layout that returns the
   best board that layout contains. The first prototype did it the other way and
   spent about three seconds per board rejection-sampling its way to a ceiling of
   par 19; sweeping backwards costs one search per layout and reaches par 35 on
   the same generator. See tools/casks-field.mjs.

   The cost is the sweep itself, which is why the boards are measured offline and
   shipped rather than dealt in the page. See 30-levels.js. */
const CasksSearch = (() => {
  const C = CasksConfig;
  const R = CasksRules;

  /* ---- the component, walked once ----

     Every position this layout can reach from a given one, with the neighbour
     lists kept.

     Kept, rather than re-derived, and this is the whole difference between the
     second prototype and the third. The sweep visits every state again, and
     working out which casks can go where from a state means rebuilding the
     occupancy grid and walking every cask's run — the most expensive thing in
     the file. The second prototype did it once for the walk and once for the
     sweep and was correct but too slow to measure a field with. Building the
     lists while walking and reusing them costs one array per state and roughly
     halves the work. */
  function component(layout, start, nodeCap){
    const cap = nodeCap == null ? C.SEARCH_CAP : nodeCap;
    const index = new Map();
    const states = [];
    const adj = [];
    const push = p => {
      const k = R.key(p);
      let id = index.get(k);
      if (id === undefined){ id = states.length; index.set(k, id); states.push(p); adj.push(null); }
      return id;
    };
    push(start);
    for (let i = 0; i < states.length; i++){
      if (states.length > cap) return null;
      adj[i] = R.moves(layout, states[i]).map(m => push(R.apply(layout, states[i], m)));
    }
    return { states, adj, index };
  }

  /* Exact distance to the door from every state in the component, swept outward
     from all the states that are already there.

     Sweeping from the goals rather than toward them is only sound because the
     graph is undirected; see the header. A state left at -1 is one from which
     the door genuinely cannot be reached, which on a well-formed layout means
     the layout can never be opened at all rather than that the player has
     stranded themselves — the same edge reversed says any state that can reach
     the door can be reached from it. */
  function sweep(layout, comp){
    const { states, adj } = comp;
    const dist = new Array(states.length).fill(-1);
    let frontier = [];
    for (let i = 0; i < states.length; i++){
      if (R.isOut(layout, states[i])){ dist[i] = 0; frontier.push(i); }
    }
    for (let d = 1; frontier.length; d++){
      const next = [];
      for (const i of frontier){
        for (const j of adj[i]) if (dist[j] === -1){ dist[j] = d; next.push(j); }
      }
      frontier = next;
    }
    return dist;
  }

  /* ---- what the page asks ----

     Par from where the player actually is, and the first move of one optimal
     line from there.

     A plain forward breadth first search rather than the sweep above, because
     the page never wants the whole component: it wants one number and one move,
     and the search stops the moment it touches the door. On a dealt board that
     is a fraction of the component. The sweep is the generator's instrument, and
     running it here would be measuring the entire cellar to answer a question
     about one corner of it.

     Three outcomes, and they are different things:

       par a number, exact       the minimum from here, walked
       par null, exact true      the door cannot be reached from here, proven by
                                 exhausting the component. On a shipped board
                                 this cannot happen: every state the player can
                                 reach was reached from a state that could reach
                                 the door, and the edges go both ways.
       par null, exact false     the tripwire fired. Nothing is known. */
  function search(layout, start, nodeCap){
    const cap = nodeCap == null ? C.SEARCH_CAP : nodeCap;
    if (R.isOut(layout, start)) return { par: 0, exact: true, moves: [] };

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
        for (const move of R.moves(layout, at)){
          const to = R.apply(layout, at, move);
          const k = R.key(to);
          if (parents.has(k)) continue;
          if (++nodes > cap) return { par: null, exact: false, moves: null };
          parents.set(k, { move, from: fromKey });
          if (R.isOut(layout, to)) return { par: depth, exact: true, moves: trace(parents, k) };
          next.push(to);
        }
      }
      frontier = next;
    }
    return { par: null, exact: true, moves: null };
  }

  /* Walk the parent links back from the goal and turn them the right way round.
     Stored as key -> {move, from} rather than as a path per state, because a
     path per state is the whole search repeated once for every state in it. */
  function trace(parents, goalKey){
    const out = [];
    let at = goalKey;
    /* Bounded by the number of links, because a cycle in them would spin here
       forever. There cannot be one — every link points at a strictly shallower
       state — but this is a search and the cost of being wrong is a hung tab. */
    for (let guard = 0; guard <= parents.size; guard++){
      const step = parents.get(at);
      if (!step) return out.reverse();
      out.push(step.move);
      at = step.from;
    }
    return null;
  }

  const solve = (layout, start, nodeCap) => {
    const got = search(layout, start, nodeCap);
    return { par: got.par, exact: got.exact, first: got.moves && got.moves.length ? got.moves[0] : null };
  };

  /* One optimal line, whole. The tests use it to assert that a shipped par is a
     par somebody can actually play — the check that would catch a search that
     had drifted from the rules, which is the one failure that would look
     entirely reasonable in the table. */
  const line = (layout, start, nodeCap) => search(layout, start, nodeCap).moves;

  /* ---- the offline measurement ----

     The best board a layout contains, and how much of a decision each step of it
     is. tools/casks-field.mjs is the only caller, and it lives here rather than
     in the tool for the reason the measure gives for the same split: there is no
     second implementation of these rules to measure against. The pour game can
     afford to measure difficulty in a tool because tests/baseline.mjs is an
     independent restatement of its rules, so a tool that had drifted shows up as
     two implementations disagreeing. Here a tool with its own copy of the slide
     rule would not be a cross-check, it would be a second place for the same
     mistake to live, and the shipped boards could quietly come to be about a
     different game than the one being played.

     `choice` is the fraction of steps along one optimal line at which more than
     one distinct next position keeps par reachable, and `tight` is the average
     share of the moves available at a step that are correct. They disagree
     usefully: a board can be long and mechanical, or short and vicious. Both are
     free here, because the sweep has already worked out the distance from every
     state and a step's options are its neighbour list. */
  function hardest(layout, seed, nodeCap){
    const comp = component(layout, seed, nodeCap);
    if (!comp) return null;
    const dist = sweep(layout, comp);

    let best = -1, par = -1;
    for (let i = 0; i < dist.length; i++) if (dist[i] > par){ par = dist[i]; best = i; }
    /* Nothing in the component reaches the door, so this layout is not a puzzle
       with a hard start, it is a room with no way out. */
    if (par < 0) return null;

    let at = best, steps = 0, branchy = 0, odds = 0;
    while (dist[at] > 0){
      const options = comp.adj[at];
      const good = options.filter(j => dist[j] === dist[at] - 1);
      odds += good.length / Math.max(1, options.length);
      if (good.length > 1) branchy++;
      /* The middle option, so the line walked is not systematically whatever
         moves() happens to emit first — which is the lowest-numbered cask
         sliding left, and would report every board as tighter than it is. */
      at = good[Math.floor(good.length / 2)];
      steps++;
    }

    return {
      pos: comp.states[best],
      par,
      component: comp.states.length,
      choice: branchy / Math.max(1, steps),
      tight: odds / Math.max(1, steps)
    };
  }

  return { component, sweep, solve, line, hardest };
})();
globalThis.CasksSearch = CasksSearch;
