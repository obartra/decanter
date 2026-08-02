/* The one place world units become pixels.

   Everything else in this game works in world units where a bubble is 1 across.
   That is not tidiness for its own sake: a game whose state is measured in
   pixels has to be recomputed every time the window changes, and anything that
   was mid-flight during the change lands somewhere else. Here the board is a
   fixed size in world units and only this transform moves. */
import { BubbleConfig } from './pure/00-config.js';

export const BubbleView = (() => {
  const C = BubbleConfig;
  let cv = null, ctx = null, scale = 1, ox = 0, oy = 0, dpr = 1;

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

    /* fit the whole board, centred, never cropped: a bubble shooter where the
       death row is off screen is a game that ends without warning */
    scale = Math.min(w / C.WORLD_W, h / C.WORLD_H);
    ox = (w - C.WORLD_W * scale) / 2;
    oy = (h - C.WORLD_H * scale) / 2;
    return true;
  }

  /* Applied fresh each frame rather than accumulated, so a dropped frame or a
     resize mid animation cannot leave the transform half applied. */
  function frame(){
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);
    return ctx;
  }

  /* A pointer, in the same units the game thinks in. */
  function screenToWorld(clientX, clientY){
    const box = cv.getBoundingClientRect();
    return { x: (clientX - box.left - ox) / scale, y: (clientY - box.top - oy) / scale };
  }

  return {
    mount, resize, frame, screenToWorld,
    get ctx(){ return ctx; },
    get scale(){ return scale; }
  };
})();
