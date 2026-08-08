/* How often does ordinary play run out of pours, and how far back did it go wrong?

   The difficulty measurement in difficulty-core.mjs walks the optimal line and
   asks how easy it is to miss par. That is not the only way a board can be
   unkind, and it turned out not to be the one players notice first: a board can
   sit dead on the difficulty curve and still leave a player with nothing legal to
   do a third of the way in. The two are independent. Two twelve-color boards
   measured at slips 9.92 and 9.93 brick at 42% and 92%.

   So this measures the other axis:

     brick   the share of ordinary playouts that reach a state with no useful
             pour left. The board is still solvable when it is dealt; this is the
             player painting themselves into a corner.
     trap    when that happens, how many pours back the run was last winnable.
             This is what decides whether the mistake was visible. A trap of 1 is
             a move you can see and one undo fixes; a trap of 5 is a board that
             gave no sign for five pours and costs five undos to unwind.

   `brick` is the number to gate on. It is cheap enough to run over all 120 levels
   in CI, it needs no solver, and it ranks levels the same way the far more
   expensive lookahead measurement does. `trap` needs a solvability check per
   state and is a diagnostic rather than a gate.

   The player model is greedy: finish a bottle if you can, else pour onto its own
   color preferring the fuller target, else open a mixed bottle into an empty, and
   never dump a pure bottle into an empty. It is deliberately not a good player.
   It does not search, so it does not solve boards, and the number it produces is
   not a prediction of how often a person gets stuck. What it measures is how
   much a board punishes not searching, which is what separates a board that
   rewards care from one that hides the mistake. A player that looks up to three
   pours ahead ranks the levels the same way; it just costs orders of magnitude
   more to measure.

   Uses the independent rules in tests/baseline.mjs, for the same reason
   difficulty-core does: this measures the game as played rather than the
   solver's idea of it. */
import * as base from '../tests/baseline.mjs';

const CAP = base.CAP;
const canon = t => t.map(x => x.join(',')).sort().join('|');

/* The pours a player would consider. One entry per distinct resulting board, so
   two empty bottles are one decision rather than two, which is the same
   reduction difficulty-core applies. Pouring a bottle that is already one color
   into an empty is excluded: it is legal, it changes nothing, and counting it
   would hide a dead board behind a move that does not exist to anybody playing. */
export function usefulMoves(tubes){
  const seen = new Map();
  for (const m of base.legalMoves(tubes)){
    const from = tubes[m[0]];
    if (!tubes[m[1]].length && !from.some(c => c !== from[from.length - 1])) continue;
    const k = canon(base.apply(base.clone(tubes), m));
    if (!seen.has(k)) seen.set(k, m);
  }
  return [...seen.values()];
}

/* Seeded so a measurement is reproducible: the test asserts on these numbers, so
   they cannot move because a run drew different dice. */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function best(tubes, moves, rnd){
  let pick = null, top = -Infinity;
  for (const m of moves){
    const [a, b, n] = m;
    const from = tubes[a], to = tubes[b], color = from[from.length - 1];
    let s = 0;
    if (to.length && to.length + n === CAP && to.every(c => c === color)) s += 100;  // fills a bottle
    if (from.length === n) s += 40;                                                  // frees a bottle
    if (to.length) s += 20 + to.length;                                              // onto its own color
    s += rnd() * 0.5;                                    // break ties without a fixed bias
    if (s > top){ top = s; pick = m; }
  }
  return pick;
}

/* One playout. `limit` only stops a player that is neither winning nor stuck,
   which greedy play manages by shuffling; those runs are not counted either way. */
function playout(tubes, rnd, limit = 300){
  let t = base.clone(tubes);
  const path = [base.clone(t)];
  for (let i = 0; i < limit; i++){
    if (base.solved(t)) return { stuck: false, path };
    const moves = usefulMoves(t);
    if (!moves.length) return { stuck: true, path };
    t = base.apply(base.clone(t), best(t, moves, rnd));
    path.push(base.clone(t));
  }
  return { stuck: false, path };
}

/* How many pours back the run was last winnable, walking the path backwards
   until a state is solvable again. `isSolvable` returns false when it runs out
   of nodes, which would overstate the trap, so the cap is generous and the
   caller gets the sample count to judge it by. */
function trapDepth(path, isSolvable){
  let back = 0;
  for (let i = path.length - 1; i >= 0; i--){
    if (isSolvable(path[i])) break;
    back++;
  }
  return back;
}

export const DEFAULT_RUNS = 200;

/* `isSolvable` is optional. Without it the trap figures come back null and the
   measurement needs no solver at all, which is what makes it cheap enough to
   gate on. */
export function measure(tubes, seed, { runs = DEFAULT_RUNS, isSolvable = null, trapSamples = 12 } = {}){
  const rnd = mulberry32(seed);
  let stuck = 0;
  const traps = [];
  for (let i = 0; i < runs; i++){
    const r = playout(tubes, rnd);
    if (!r.stuck) continue;
    stuck++;
    if (isSolvable && traps.length < trapSamples) traps.push(trapDepth(r.path, isSolvable));
  }
  traps.sort((a, b) => a - b);
  return {
    brick: stuck / runs,
    trap: traps.length ? traps[traps.length >> 1] : null,
    worstTrap: traps.length ? traps[traps.length - 1] : null,
    trapSamples: traps.length
  };
}

/* The ceiling a shipped level has to come in under.

   Graduated rather than flat, because bricking is only unfair when the player
   has no answer to it. The vessel buys an extra bottle and is exactly that
   answer: an extra empty takes level 19 from 68% to 5%. It is granted by the
   third chapter, so before that a board that bricks is a board with no way out,
   and after it a brickable board is difficulty with something to spend against
   it.

   The opening chapters are tighter still. A player who has not yet learned what
   a wasted empty costs cannot be expected to pay for the lesson with a board
   that gives no sign until it is over.

   Numbers, not a formula, and it is worth saying why: they are a judgement about
   how much frustration a player will take at each point in the run, which is not
   derivable from anything in the game. What is derived is the shape, from where
   the vessel lands. Measured against the game as shipped, the median board
   bricks at about a third. */
export function ceilingFor(level, vesselLevel, sectionSize = 10){
  if (level <= sectionSize) return 0.15;
  /* Never earlier than the third chapter, however early the vessel is granted.

     Keying this to the grant alone has a trap in it: moving the vessel forward
     to help players through the opening would relax the ceiling over exactly the
     boards it was brought forward to protect, and the two changes would cancel.
     A tool granted is not a tool understood, and the opening twenty boards are
     where somebody decides whether this game is fair, so they hold the tighter
     ceiling whether or not anything has been handed over by then. */
  const relaxAt = Math.max(vesselLevel, 2 * sectionSize + 1);
  if (level < relaxAt) return 0.25;
  return 0.50;
}
