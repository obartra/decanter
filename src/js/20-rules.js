/* The rules of the puzzle, and nothing else. No DOM, no timing, no state. */
const CAP = CONFIG.capacity;

const clone = tubes => tubes.map(t => t.slice());
/* one colour all the way down. True of an empty bottle, which every caller
   either wants or has already ruled out. */
const uniform = t => t.every(c => c === t[0]);
const isFull = t => t.length === CAP && uniform(t);

/* When a bottle counts as finished, and the one place the blast reaches into
   the laws of the game.

   Four units of a colour is the win condition, not an incident of the deal. So
   destroying part of a stack strands the rest of that colour forever: it can
   never make four again, the board can never be solved, and nothing would say
   so — an unwinnable board is neither stuck (there are still legal pours) nor
   short (the lower bound on the work left is still a number the player is
   under), so the run would carry on against a puzzle that cannot be finished
   until the count ran out. A tool bought to rescue a run must not be able to
   end it in silence.

   So the requirement moves with the liquid. A colour the blast took units from
   is spilled, and a spilled colour is finished once it is gathered rather than
   once it reaches four. It still has to be gathered — that is what keeps the
   blast from handing the level over rather than buying pours for it.

   `spilled` is a Set of colour ids belonging to one run, passed in rather than
   stored because this file holds no state.

   Two branches, and they are the same rule said at two levels of detail. The
   real condition has always been *every bottle holds one colour, and no colour
   is in two bottles*. Without spilling those two clauses collapse into "four of
   a colour in one bottle", because every deal makes exactly four of each and
   four cannot fill two bottles — so the fast path is today's check, unchanged
   and free, and it is what the generator, the solver and every board nobody has
   blasted run through.

   Spilling breaks the collapse: two units of a spilled red sitting in two
   different bottles are each uniform and neither will ever be full, so a
   per-bottle test alone would call that board sorted while the player is
   plainly looking at red in two places. The gathering is the work a blast does
   not do for you, and it has to be said out loud once four stops implying it. */
function isSolved(tubes, spilled){
  if (!spilled || !spilled.size) return tubes.every(t => t.length === 0 || isFull(t));
  const held = new Set();
  for (const t of tubes){
    if (!t.length) continue;
    if (!uniform(t)) return false;
    if (!isFull(t) && !spilled.has(t[0])) return false;
    if (held.has(t[0])) return false;
    held.add(t[0]);
  }
  return true;
}
/* canonical key: bottle order does not matter, so sort before comparing */
const keyOf = tubes => tubes.map(t => t.join(',')).sort().join('|');

function runLength(t){
  if (!t.length) return 0;
  let n = 1;
  for (let i = t.length - 2; i >= 0 && t[i] === t[t.length - 1]; i--) n++;
  return n;
}
/* a pour is legal when the source has liquid, is not already finished, and the
   target has room and either matches on top or is empty */
function canPour(tubes, a, b){
  if (a === b) return false;
  const src = tubes[a], dst = tubes[b];
  if (!src || !dst) return false;
  if (!src.length || isFull(src)) return false;
  if (dst.length >= CAP) return false;
  if (!dst.length) return true;
  return dst[dst.length - 1] === src[src.length - 1];
}
/* the whole top run moves, unless the target runs out of room first */
function pourAmount(tubes, a, b){
  if (!canPour(tubes, a, b)) return 0;
  return Math.min(runLength(tubes[a]), CAP - tubes[b].length);
}
function applyMove(tubes, move){
  for (let i = 0; i < move.n; i++) tubes[move.to].push(tubes[move.from].pop());
  return tubes;
}
function legalMoves(tubes){
  const out = [];
  for (let a = 0; a < tubes.length; a++)
    for (let b = 0; b < tubes.length; b++)
      if (canPour(tubes, a, b)) out.push({ from:a, to:b, n:pourAmount(tubes, a, b) });
  return out;
}
/* depth-first probe, used at generation time to reject dead boards cheaply */
/* The fewest pours that could possibly finish this board: one per contiguous
   run of colour, less the one run per colour that is allowed to remain. A pour
   moves one maximal run and can close at most one, so this can never overstate
   what is left to do. Understating it is fine and expected.

   Being a lower bound is the whole point: if it exceeds the pours a run has
   left, that run cannot be finished, and saying so is a fact rather than a
   guess. isSolvable cannot be used for this, because it returns false when it
   runs out of nodes and would accuse a player of losing a board they could
   still have won. */
function minPours(tubes){
  let segments = 0;
  const colours = new Set();
  for (const t of tubes){
    for (let i = 0; i < t.length; i++){
      if (i === 0 || t[i] !== t[i - 1]) segments++;
      colours.add(t[i]);
    }
  }
  return segments - colours.size;
}

/* Pours left before the run is lost. A run fails one pour past the last one
   that still scores, so this is the number that actually ends it, and from par
   onwards it equals the star count: both reach nothing on the same pour. */
function poursLeft(moves, par, exact){
  if (par == null || !exact) return null;
  return Math.max(0, par + CONFIG.stars.one + 1 - moves);
}

/* Why this run is over, or null while it is still alive.

   Both answers are certain. No legal pour is a dead board, and a lower bound on
   the work left that exceeds the pours left cannot be beaten. Neither can be
   wrong, which matters: the cost of being wrong is ending somebody's run for
   them. isSolvable is not used here for exactly that reason, since it returns
   false when it runs out of nodes and cannot tell that apart from a board that
   genuinely cannot be finished.

   Said as soon as it is true, rather than when the count runs out. Making a
   player keep pouring at a board that cannot be won is worse than losing. */
function lostBecause(tubes, moves, par, exact, spilled){
  if (isSolved(tubes, spilled)) return null;
  if (!legalMoves(tubes).length) return 'stuck';
  const left = poursLeft(moves, par, exact);
  if (left == null) return null;
  if (left <= 0) return 'over';
  if (minPours(tubes) > left) return 'short';
  return null;
}

/* ---- the blast ----

   Destroy a bottle, and the shelf loses the glass as well as what was in it.
   That is the vessel's opposite in both directions at once: one more place to
   put liquid against one less, and work rearranged against work removed. It is
   what keeps the two tools from being the same purchase at two prices.

   Returned rather than applied, because every caller wants to ask what a blast
   would do before doing it. */
function blast(tubes, index){
  const gone = tubes[index];
  if (!gone) return null;
  return {
    tubes: tubes.filter((_, i) => i !== index).map(t => t.slice()),
    spilled: [...new Set(gone)]
  };
}

/* Which bottles may be blasted at all.

   Three kinds are refused, and refusing them here rather than in the interface
   is what stops the tool ever being a tap that costs sixty five gold and makes
   things worse:

   - An empty one. It spills nothing and takes a slot away, so it can only hurt.
   - A finished one. Its colour is already gathered; destroying it undoes work
     and takes the slot with it.
   - Any whose removal ends the run. A blast can strand a board — take away the
     last bottle anything could pour into and there are no legal moves left —
     and being handed that outcome by the rescue you just paid for is the worst
     version of this feature there is. So the question is asked in advance, on a
     copy, with the same function that ends runs.

   A target that leaves the board solved is kept: winning is not losing, and
   blowing up the last mixed bottle is a legitimate way to finish. */
function blastTargets(tubes, moves, par, exact, spilled){
  const out = [];
  for (let i = 0; i < tubes.length; i++){
    if (!tubes[i].length || isFull(tubes[i])) continue;
    const after = blast(tubes, i);
    const next = new Set(spilled || []);
    for (const c of after.spilled) next.add(c);
    if (!lostBecause(after.tubes, moves, par, exact, next)) out.push(i);
  }
  return out;
}

function isSolvable(start, nodeCap = 40000){
  const seen = new Set();
  const stack = [clone(start)];
  let nodes = 0;
  while (stack.length){
    if (++nodes > nodeCap) return false;
    const cur = stack.pop();
    const k = keyOf(cur);
    if (seen.has(k)) continue;
    seen.add(k);
    if (isSolved(cur)) return true;
    for (let a = 0; a < cur.length; a++){
      if (!cur[a].length || isFull(cur[a])) continue;
      const whole = uniform(cur[a]);
      for (let b = 0; b < cur.length; b++){
        if (!canPour(cur, a, b)) continue;
        if (!cur[b].length && whole) continue;     // relocating a uniform bottle changes nothing
        stack.push(applyMove(clone(cur), { from:a, to:b, n:pourAmount(cur, a, b) }));
      }
    }
  }
  return false;
}
/* Three stars at par, two one over, one two over. Three or more over the minimum
   is a failed run: the bottles are sorted, but not well enough to count.

   An inexact par is an upper bound the search settled for, not the minimum, so
   it cannot decide any bracket, least of all a failing one: it is treated the
   same as no par at all rather than scored as if it were real.

   An eased board caps the run at two stars. Par is the minimum for the bottles
   the level deals you, so once the shelf is not the one it describes the board
   is easier than the number being scored against, and the third star would be
   measuring a different puzzle from the one par describes.

   One flag rather than one per tool, because the reason is the same either way
   and the run is capped once however many of them were bought. A bought vessel
   eases the board and so does a blast; the bubble game has called this `aided`
   since it shipped, and the two games mean the same thing by it. */
function rate(moves, par, exact = true, eased = false){
  const cap = eased ? 2 : 3;
  if (par == null || !exact) return cap;
  const over = moves - par;
  const earned = over <= CONFIG.stars.three ? 3
               : over <= CONFIG.stars.two ? 2
               : over <= CONFIG.stars.one ? 1
               : 0;
  return Math.min(earned, cap);
}
/* `uniform` stays in the file rather than on this object: nothing outside needs
   it, and an export nobody reads is what verify-live is for. */
globalThis.Rules = { CAP, clone, isFull, isSolved, keyOf, minPours,
                     canPour, pourAmount, applyMove, legalMoves, isSolvable, rate,
                     poursLeft, lostBecause, blast, blastTargets };
