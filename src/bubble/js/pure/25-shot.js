/* Where a shot goes, worked out in full the moment it is fired.

   This is the most important function in the game, and the reason it is shaped
   this way is worth stating plainly. The aim guide and the flying bubble must
   agree, always, and the way to guarantee that is not to write one routine and
   call it twice. It is to have one call whose answer the guide draws and the
   flight walks. The bubble in the air does no collision detection at all: it
   interpolates along a path that was decided before it left the muzzle.

   That buys three things. A dropped frame, a backgrounded tab or a garbage
   collection pause cannot change where a bubble lands, only how smoothly it
   gets there. Shot speed stops being a correctness concern and becomes a dial
   you can turn on feel alone. And the guide cannot lie, because there is
   nothing for it to disagree with.

   Pure: no DOM, no clock, no randomness. Parameterised by distance along the
   ray rather than by time, so speed cannot leak in. */
import { BubbleConfig } from './00-config.js';
import { BubbleGrid } from './20-grid.js';

export const BubbleShot = (() => {
  const C = BubbleConfig;
  const G = BubbleGrid;

  /* Walls constrain the center of the bubble, not its edge, so they sit half a
     diameter inside the world on each side. */
  const LEFT = 0.5;
  const RIGHT = C.WORLD_W - 0.5;
  const CEIL = 0.5;

  /* The earliest cell the ray touches, if any. Every occupied cell is tested:
     there are at most a hundred and eighty of them, which is nothing, and a
     broad phase would only be a second place for the geometry to be wrong. */
  function firstContact(board, p, u){
    let best = null;
    const cells = G.occupied(board);
    for (const [j, c] of cells){
      const q = G.centerOf(board, j, c);
      const dx = p.x - q.x, dy = p.y - q.y;
      const b = u.x * dx + u.y * dy;
      /* moving away from this one, or never close enough */
      if (b >= 0) continue;
      const cc = dx * dx + dy * dy - C.HIT_K * C.HIT_K;
      const disc = b * b - cc;
      if (disc < 0) continue;
      const s = -b - Math.sqrt(disc);
      if (s < 0) continue;
      /* ties settled by position, never by iteration order, so the answer does
         not depend on how the board happens to be stored */
      if (!best || s < best.s - 1e-12 ||
          (Math.abs(s - best.s) <= 1e-12 && (j < best.j || (j === best.j && c < best.c)))){
        best = { s, j, c };
      }
    }
    return best;
  }

  /* The cell a bubble takes when it stops.

     For a ceiling hit it is the nearest empty cell of row 0, which always
     exists: a full row 0 would have produced a bubble contact first. Otherwise
     it is the nearest of the six neighbors of whatever was hit.

     That cell is provably empty and provably in bounds rather than merely
     usually so. At contact the center lies 0.95 from the cell it hit, the six
     neighbors lie at 1.0 sixty degrees apart, so the nearest is at most thirty
     degrees away and therefore within 0.508 of the contact point. Anything
     sitting in that cell would have been closer than 0.95 and would have been
     hit first, contradicting the fact that this was the earliest contact. */
  function snapCell(board, contact, center){
    if (contact.kind === 'ceiling'){
      let best = null;
      for (let c = 0; c < C.COLS; c++){
        if (!G.isEmpty(board, 0, c)) continue;
        const d = Math.abs(G.centerOf(board, 0, c).x - center.x);
        if (!best || d < best.d - 1e-12) best = { j: 0, c, d };
      }
      return best ? { j: best.j, c: best.c } : null;
    }
    let best = null;
    for (const [j, c] of G.neighbors(board, contact.j, contact.c)){
      if (!G.isEmpty(board, j, c)) continue;
      const q = G.centerOf(board, j, c);
      const d2 = (q.x - center.x) ** 2 + (q.y - center.y) ** 2;
      if (!best || d2 < best.d2 - 1e-12 ||
          (Math.abs(d2 - best.d2) <= 1e-12 && (j < best.j || (j === best.j && c < best.c)))){
        best = { j, c, d2 };
      }
    }
    return best ? { j: best.j, c: best.c } : null;
  }

  /* Returns the path as a list of points, what it hit, and where it lands.
     `landing` is null only when the shot leaves through the floor, which a board
     with a clear vertical channel makes possible and which the caller has to
     handle or the turn never ends. */
  function resolveShot(board, origin, dir){
    const len = Math.hypot(dir.x, dir.y) || 1;
    let u = { x: dir.x / len, y: dir.y / len };
    let p = { x: origin.x, y: origin.y };
    const points = [{ x: p.x, y: p.y }];

    for (let step = 0; step < C.MAX_SEGMENTS; step++){
      let sWall = Infinity, wall = 0;
      if (u.x < 0) { sWall = (LEFT - p.x) / u.x; wall = -1; }
      else if (u.x > 0) { sWall = (RIGHT - p.x) / u.x; wall = 1; }

      const sCeil = u.y < 0 ? (CEIL - p.y) / u.y : Infinity;
      const hit = firstContact(board, p, u);
      const sHit = hit ? hit.s : Infinity;

      const s = Math.min(sWall, sCeil, sHit);

      if (!isFinite(s)){
        /* nothing ahead at all, which only happens traveling straight down */
        const far = { x: p.x, y: C.WORLD_H + 1 };
        points.push(far);
        return { points, contact: { kind: 'floor' }, landing: null };
      }

      const q = { x: p.x + u.x * s, y: p.y + u.y * s };

      /* left through the bottom before anything stopped it */
      if (q.y > C.WORLD_H){
        const t = (C.WORLD_H - p.y) / u.y;
        points.push({ x: p.x + u.x * t, y: C.WORLD_H });
        return { points, contact: { kind: 'floor' }, landing: null };
      }

      if (sHit <= sWall && sHit <= sCeil){
        points.push(q);
        const contact = { kind: 'bubble', j: hit.j, c: hit.c, x: q.x, y: q.y };
        return { points, contact, landing: snapCell(board, contact, q) };
      }
      if (sCeil <= sWall){
        points.push(q);
        const contact = { kind: 'ceiling', x: q.x, y: q.y };
        return { points, contact, landing: snapCell(board, contact, q) };
      }

      /* A wall. Mirror exactly onto the wall plane and flip only the horizontal
         component, with no damping and no renormalizing: a bounce that loses a
         little speed or drifts a little in angle turns a predictable board into
         one where the same shot does something different each time. */
      points.push(q);
      p = { x: wall < 0 ? LEFT : RIGHT, y: q.y };
      u = { x: -u.x, y: u.y };
    }

    /* Unreachable: every segment either ends the shot or reflects it toward the
       opposite wall, so the cap is a tripwire rather than a limit. */
    return { points, contact: { kind: 'floor' }, landing: null };
  }

  /* The aim direction for a pointer, clamped so a shot can never skim flat
     along the board. Straight up is (0, -1). */
  function aimFrom(origin, target){
    const dx = target.x - origin.x;
    let dy = target.y - origin.y;
    if (dy > -1e-6) dy = -1e-6;                 /* never aim at or below the muzzle */
    let a = Math.atan2(dx, -dy);                 /* angle from straight up */
    a = Math.max(-C.AIM_CLAMP, Math.min(C.AIM_CLAMP, a));
    return { x: Math.sin(a), y: -Math.cos(a) };
  }

  return { resolveShot, snapCell, aimFrom };
})();
