/* The rules of the puzzle, and nothing else. No DOM, no timing, no state. */
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
globalThis.Rules = { CAP, clone, isFull, isSolved, keyOf, runLength,
                     canPour, pourAmount, applyMove, legalMoves, isSolvable, rate };
