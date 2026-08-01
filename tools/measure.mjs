/* How hard a board is, measured rather than guessed.

   A board is hard when the optimal line is narrow. At every step some number of
   moves are legal and only some of those keep par reachable, so the chance of
   choosing correctly is good/legal, and the chance of doing it all the way to par
   is those odds multiplied along the line. That collapses fast, so it is reported
   as a log.

   Which moves are optimal is decided exactly, not sampled: from a state whose
   true distance is d, a move is optimal precisely when the result can still be
   solved in d-1, because one pour can only ever reduce the distance by one.

   Moves are counted by the board they produce, not by the pair of bottles they
   name. Pouring into the first empty bottle and pouring into the second are the
   same decision, and counting them separately made every extra empty look like
   another way to go wrong. It mattered: it inflated three-empty boards by up to
   ten orders of magnitude and made them look far harder than the two-empty
   boards beside them, which is the same state-preserving reduction the solver
   applies for the same reason.

   Uses the independent rules in tests/baseline.mjs, so this measures the game as
   played rather than the solver's idea of it.

   Shared by tools/difficulty.mjs (reports) and tools/order.mjs (sorts). */
import * as base from '../tests/baseline.mjs';

/* A board as a multiset of bottles, so two arrangements that differ only in
   which slot holds what are one board. */
export const canon = t => t.map(x => x.join(',')).sort().join('|');

/* the solver's heuristic, restated here against the independent rules */
export function h(tubes){
  let segs = 0;
  const seen = new Set();
  for (const t of tubes){
    for (let i = 0; i < t.length; i++){
      if (i === 0 || t[i] !== t[i - 1]) segs++;
      seen.add(t[i]);
    }
  }
  return segs - seen.size;
}

/* Thrown when a board costs more to measure than it is worth. Candidate boards
   are plentiful, so skipping one is far cheaper than a search that never
   returns, and an unbounded search is not hypothetical: the first version of
   this ran a memo table past sixteen million entries and died. */
export const TOO_DEAR = Symbol('over budget');

/* A Map tops out around 2^24 entries and the memo below stores one per failed
   state, so the ceiling is a hard limit rather than a preference. Staying under
   it is what the budget is for; the first version of this had none and died. */
export const DEFAULT_BUDGET = 12_000_000;

/* Can this be finished in at most `limit` pours? Memoised on the deepest budget
   already known to fail, which is what stops the search re-walking the same dead
   ends. One cache per board: states are not comparable across boards. */
function makeSolvableIn(budget){
  const failed = new Map();
  let spent = 0;
  return function solvableIn(tubes, limit){
    if (base.solved(tubes)) return true;
    if (limit <= 0 || h(tubes) > limit) return false;
    if (++spent > budget) throw TOO_DEAR;
    const k = base.exactKey(tubes);
    const worst = failed.get(k);
    if (worst !== undefined && worst >= limit) return false;
    for (const m of base.legalMoves(tubes)){
      if (solvableIn(base.apply(base.clone(tubes), m), limit - 1)) return true;
    }
    failed.set(k, limit);
    return false;
  };
}

/* Walk one optimal line, counting how many of the moves available at each step
   would have kept par alive. Walking every optimal line is exact but explodes on
   twelve-colour boards; one line is cheap and orders levels the same way.

   Returns null if par turns out to be unreachable, and throws TOO_DEAR if the
   board exceeds `budget` expansions.

     tight    the fraction of distinct decisions that are right at an average
              step, so how narrow the line is regardless of how long it is
     logOdds  log10 of the chance of walking the whole thing correctly, which
              folds in length as well as narrowness

   `tight` is the better measure of how demanding a single decision is; `logOdds`
   is the better measure of a whole level. They disagree about long easy boards,
   which is exactly the case worth being able to tell apart. */
export function analyse(tubes, par, budget = DEFAULT_BUDGET){
  const solvableIn = makeSolvableIn(budget);
  let state = base.clone(tubes);
  let dist = par;
  let logOdds = 0, steps = 0, goodSum = 0, legalSum = 0, worst = 1;

  while (dist > 0){
    /* one entry per distinct board reachable in one pour, not one per legal pour */
    const outcomes = new Map();
    for (const m of base.legalMoves(state)){
      const next = base.apply(base.clone(state), m);
      const k = canon(next);
      if (!outcomes.has(k)) outcomes.set(k, next);
    }
    const good = [];
    for (const next of outcomes.values()){
      if (solvableIn(base.clone(next), dist - 1)) good.push(next);
    }
    if (!good.length) return null;             /* par is not reachable from here */
    const odds = good.length / outcomes.size;
    logOdds += Math.log10(odds);
    worst = Math.min(worst, odds);
    goodSum += good.length; legalSum += outcomes.size; steps++;
    /* follow the middle option, so the line taken is not systematically the
       first or last move the rule generator happens to emit */
    state = good[good.length >> 1];
    dist--;
  }
  return {
    logOdds,
    tight: Math.pow(10, logOdds / steps),
    width: goodSum / steps,
    branching: legalSum / steps,
    worst
  };
}
