/* The laws of the measure, and nothing else. No DOM, no timing, no state.

   There is one operation. Pour vessel i into vessel j, and it moves
   min(amount[i], caps[j] - amount[j]) — all of it, always. There is no tap and
   no drain, so the total is conserved: you cannot conjure wine and you certainly
   do not pour it away. The board is solved when any vessel holds exactly the
   target.

   That is the whole game, and the absence of the tap and the drain is the whole
   design. With a drain a wrong pour is undone by emptying a vessel, so no pour
   ever has to be meant; without one, every pour is a commitment, and the reason
   the state space has dead ends at all is that some of those commitments cannot
   be walked back. */
const MeasureRules = (() => {
  /* ---- the canonical key, and the thing most likely to be got wrong ----

     `amount.join(',')`, IN VESSEL ORDER, NOT SORTED.

     The other game sorts before comparing, because its bottles are
     interchangeable: two bottles holding the same stack are the same bottle as
     far as the puzzle is concerned, so sorting collapses states that are really
     one state and the search gets smaller for free. See Rules.keyOf in
     src/js/20-rules.js and keyOf in src/worker/solver.js.

     Here the vessels are NOT interchangeable, because their capacities differ. A
     board of caps [8, 5, 3] holding [0, 3, 0] and one holding [0, 0, 3] are
     different positions with different futures: from the first you can pour into
     the three, from the second you cannot. Sorting the amounts would call them
     the same, the search would skip the second having seen the first, and par
     would come back SHORTER THAN THE TRUTH — a number nobody can actually
     achieve, published as a minimum, with the board looking entirely normal.

     Copying the sort across from the other game is the single most likely thing
     for the next reader to do by reflex, which is why it is written down here
     rather than left to be noticed. */
  const key = amount => amount.join(',');

  /* Total wine on the bench. Never changes, which is worth being able to assert:
     an apply() that leaked or invented a unit would show up nowhere else, since
     every state it produced would still look like a perfectly ordinary board. */
  const total = amount => amount.reduce((a, b) => a + b, 0);

  /* How much would actually move. Zero means the pour is not worth making: the
     source is empty, or the target is full, or they are the same vessel. */
  function amountPoured(caps, amount, from, to){
    if (from === to) return 0;
    if (from < 0 || to < 0 || from >= caps.length || to >= caps.length) return 0;
    const room = caps[to] - amount[to];
    if (room <= 0) return 0;
    return Math.min(amount[from], room);
  }

  const canPour = (caps, amount, from, to) => amountPoured(caps, amount, from, to) > 0;

  /* Every pour that does something, as {from, to, n}.

     ONE MOVE IS ONE MOVE WHATEVER IT CARRIES. Emptying a full demijohn into a
     carafe and trickling a single unit into a thimble both count as one, exactly
     as a pour does in the other game. That is what makes par a measure of
     thinking rather than of clicking, and it is why the star brackets can be as
     tight as three-at-par. */
  function pours(caps, amount){
    const out = [];
    for (let from = 0; from < caps.length; from++){
      for (let to = 0; to < caps.length; to++){
        const n = amountPoured(caps, amount, from, to);
        if (n > 0) out.push({ from, to, n });
      }
    }
    return out;
  }

  function apply(caps, amount, move){
    const next = amount.slice();
    const n = amountPoured(caps, amount, move.from, move.to);
    next[move.from] -= n;
    next[move.to] += n;
    return next;
  }

  /* Distinct outcomes, not legal pours.

     Two pours that leave the bench in the same place are one decision. That
     reduction lives here, beside the rules, rather than in the search or the
     measuring tool, for the same reason dealBoard lives in the bubble game's
     rules: the search, the hint and the offline field measurement all have to
     agree about what counts as a choice, and three copies of it would eventually
     be two definitions.

     docs/design/02-levels.md records what counting legal moves instead of
     distinct outcomes cost the other game — a confident, reproducible and
     entirely false account of its own difficulty curve, wrong by up to ten
     orders of magnitude. It cannot cost as much here, because the vessels are
     distinguishable and coincidences are rarer, but it costs the same kind of
     thing: a board that offers four pours into the same resulting position is
     not offering four decisions.

     Returned as [{ key, amount, move }], carrying one representative move, so a
     caller that needs something to actually play has it. */
  function outcomes(caps, amount){
    const here = key(amount);
    const seen = new Map();
    for (const move of pours(caps, amount)){
      const next = apply(caps, amount, move);
      const k = key(next);
      /* A pour that changes nothing is not a move. It cannot happen given
         amountPoured > 0, but saying so costs nothing and the day someone
         loosens that function it is the assertion that holds. */
      if (k === here || seen.has(k)) continue;
      seen.set(k, { key: k, amount: next, move });
    }
    return [...seen.values()];
  }

  /* Solved when ANY vessel holds exactly the target. Not the largest, not a
     nominated one: any. That is what makes a four-vessel board easier than a
     three-vessel one, since every extra vessel is another place the answer is
     allowed to appear. */
  const isSolved = (amount, target) => amount.some(v => v === target);

  return { key, total, pours, apply, outcomes, canPour, amountPoured, isSolved };
})();
globalThis.MeasureRules = MeasureRules;
