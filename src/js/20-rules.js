/* The rules of the puzzle, and nothing else. No DOM, no timing, no state. */
const Rules = (() => {
  const CAP = CONFIG.capacity;

  const clone = tubes => tubes.map(t => t.slice());
  const isFull = t => t.length === CAP && t.every(c => c === t[0]);
  const isSolved = tubes => tubes.every(t => t.length === 0 || isFull(t));
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
  function lostBecause(tubes, moves, par, exact){
    if (isSolved(tubes)) return null;
    if (!legalMoves(tubes).length) return 'stuck';
    const left = poursLeft(moves, par, exact);
    if (left == null) return null;
    if (left <= 0) return 'over';
    if (minPours(tubes) > left) return 'short';
    return null;
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
        const uniform = cur[a].every(c => c === cur[a][0]);
        for (let b = 0; b < cur.length; b++){
          if (!canPour(cur, a, b)) continue;
          if (!cur[b].length && uniform) continue;   // relocating a uniform bottle changes nothing
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

     A bought vessel caps the run at two stars. Par is the minimum for the bottles
     the level deals you, so once an extra one is on the shelf the board is easier
     than the number being scored against, and the third star would be measuring a
     different puzzle from the one par describes. */
  function rate(moves, par, exact = true, vesselUsed = false){
    const cap = vesselUsed ? 2 : 3;
    if (par == null || !exact) return cap;
    const over = moves - par;
    const earned = over <= CONFIG.stars.three ? 3
                 : over <= CONFIG.stars.two ? 2
                 : over <= CONFIG.stars.one ? 1
                 : 0;
    return Math.min(earned, cap);
  }

  return { CAP, clone, isFull, isSolved, keyOf, minPours,
           canPour, pourAmount, applyMove, legalMoves, isSolvable, rate,
           poursLeft, lostBecause };
})();
globalThis.Rules = Rules;
