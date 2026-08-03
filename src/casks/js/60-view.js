/* The one place world units become pixels, and the one place the cellar's
   geometry is written down.

   Everything else in this game works in world units where ONE FLOOR CELL IS 1
   ACROSS, with the origin at the outside corner of the north-west wall. Nothing
   in state is ever a pixel, so a resize, a rotation or a phone with an unusual
   aspect changes this file and nothing else.

   The geometry lives here rather than in the renderer because two things need it
   and they must not disagree: the renderer draws a cask where this says it is,
   and the input decides which cask was grabbed and which flagstone was tapped
   from the same numbers. A hit test with its own idea of where a cask is gives
   the worst bug a game played entirely by touching things can have — the one
   where the touch works, just not on the thing under the finger. That is why
   `cellAt` and `along` are here beside `rectFor` rather than in 90-app.js. */
import { CasksConfig } from './pure/00-config.js';
import { CasksRules } from './pure/20-rules.js';

export const CasksView = (() => {
  const C = CasksConfig;
  const R = CasksRules;
  let cv = null, ctx = null, scale = 1, ox = 0, oy = 0, dpr = 1;

  /* The world is a fixed size, unlike the measure's, because the floor is always
     six by six. There is nothing about a board that changes its shape, so this
     is a constant and not a function of what was dealt.

     It is square plus the walls, which means on a tall phone there is air above
     and below and on a wide window there is air at the sides. That is correct
     and is not worth fighting: the board is a square room and stretching it to
     fill a screen would make the flagstones oblong, which is the one thing that
     would make a cask's length ambiguous at a glance. */
  const world = {
    w: C.W + 2 * C.WALL,
    h: C.H + 2 * C.WALL,
    wall: C.WALL,
    /* The doorway, as the span of the east wall that is missing. Used by the
       renderer to leave the gap and by the escape animation to know how far the
       gilt cask has to travel to be gone. */
    door: { y: C.WALL + C.EXIT_ROW, h: 1, x: C.WALL + C.W, w: C.WALL }
  };

  function mount(canvas){
    cv = canvas;
    ctx = cv.getContext('2d');
    resize();
    addEventListener('resize', resize);
    addEventListener('orientationchange', resize);
    return ctx;
  }

  function resize(){
    if (!cv) return false;
    const box = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width));
    const h = Math.max(1, Math.round(box.height));
    dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.ceil(w * dpr);
    cv.height = Math.ceil(h * dpr);

    /* Fit the whole room, centred, never cropped, on one scale for both axes.
       A cropped cellar is a cellar with a cask off the edge of the screen, and
       in a puzzle where every cask is part of the answer that is not a cosmetic
       problem, it is a board the player cannot see. */
    scale = Math.min(w / world.w, h / world.h);
    ox = (w - world.w * scale) / 2;
    oy = (h - world.h * scale) / 2;
    return true;
  }

  /* Applied fresh each frame rather than accumulated, so a dropped frame or a
     resize halfway through a slide cannot leave the transform half applied. */
  function frame(){
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);
    return ctx;
  }

  const screenToWorld = (clientX, clientY) => {
    const box = cv.getBoundingClientRect();
    return { x: (clientX - box.left - ox) / scale, y: (clientY - box.top - oy) / scale };
  };

  /* Where a cask sits, in world units, at a position that need not be an
     integer. The float case is the whole reason this takes a position rather
     than reading one: mid-slide, and mid-drag, the drawn position is somewhere
     between two legal ones and the renderer has to be able to ask for that
     without the rules ever seeing it.

     The cross-axis comes from CasksRules.boxOf rather than from `cask.fixed`
     directly, so there is one statement of which cells a cask covers and the
     drawing cannot come to disagree with the rules about it. Only the axis it
     slides along is free to be fractional. */
  function rectFor(cask, p){
    const box = R.boxOf(cask, Math.floor(p));
    return {
      x: C.WALL + (cask.horiz ? p : box.c),
      y: C.WALL + (cask.horiz ? box.r : p),
      w: cask.horiz ? cask.len : 1,
      h: cask.horiz ? 1 : cask.len
    };
  }

  /* Which flagstone a point is on, or null if it is outside the room. Used for
     tap-then-tap, where the destination is a cell rather than a cask. */
  function cellAt(p){
    const c = Math.floor(p.x - C.WALL);
    const r = Math.floor(p.y - C.WALL);
    if (r < 0 || r >= C.H || c < 0 || c >= C.W) return null;
    return { r, c };
  }

  /* A point expressed along a cask's own axis, in cells. This is the coordinate
     a drag works in: the cask can only move along it, so tracking the pointer's
     other axis at all would let a drag that wandered sideways slide the cask
     further than the finger went. */
  const along = (cask, p) => (cask.horiz ? p.x : p.y) - C.WALL;

  return {
    mount, frame, screenToWorld, rectFor, cellAt, along,
    get world(){ return world; },
    get ctx(){ return ctx; },
    get scale(){ return scale; }
  };
})();
