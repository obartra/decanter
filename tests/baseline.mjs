/* An independent implementation of the rules plus exhaustive breadth-first
   search. Deliberately naive: it is the thing the optimised solver is checked
   against, so it must not share code with it. */
export const CAP = 4;
export const clone = t => t.map(x => x.slice());
export const solved = t => t.every(x => !x.length || (x.length === CAP && x.every(c => c === x[0])));
export const exactKey = t => t.map(x => x.join(',')).join('|');   // bottle order preserved

export function legalMoves(t){
  const out = [];
  for (let a = 0; a < t.length; a++){
    const A = t[a];
    if (!A.length) continue;
    if (A.length === CAP && A.every(c => c === A[0])) continue;
    const top = A[A.length - 1];
    let run = 1;
    for (let i = A.length - 2; i >= 0 && A[i] === top; i--) run++;
    for (let b = 0; b < t.length; b++){
      if (a === b) continue;
      const B = t[b];
      if (B.length >= CAP) continue;
      if (B.length && B[B.length - 1] !== top) continue;
      out.push([a, b, Math.min(run, CAP - B.length)]);
    }
  }
  return out;
}
export const apply = (t, m) => { for (let i = 0; i < m[2]; i++) t[m[1]].push(t[m[0]].pop()); return t; };

/* returns the true minimum move count, null if unsolvable, undefined if the
   search is too big to finish inside the cap */
export function bfsOptimal(start, cap = 400000){
  if (solved(start)) return 0;
  let frontier = [start], depth = 0, n = 0;
  const seen = new Set([exactKey(start)]);
  while (frontier.length){
    depth++;
    const next = [];
    for (const st of frontier){
      for (const m of legalMoves(st)){
        const nx = apply(clone(st), m);
        const k = exactKey(nx);
        if (seen.has(k)) continue;
        seen.add(k);
        if (solved(nx)) return depth;
        next.push(nx);
        if (++n > cap) return undefined;
      }
    }
    frontier = next;
  }
  return null;
}
export function randomBoard(colors, empties, rand = Math.random){
  const pool = [];
  for (let c = 0; c < colors; c++) for (let k = 0; k < CAP; k++) pool.push(c);
  for (let i = pool.length - 1; i > 0; i--){
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const t = [];
  for (let i = 0; i < colors; i++) t.push(pool.slice(i * CAP, (i + 1) * CAP));
  for (let i = 0; i < empties; i++) t.push([]);
  return t;
}
