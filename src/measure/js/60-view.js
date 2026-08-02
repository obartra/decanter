/* The one place world units become pixels, and the one place the bench's
   geometry is written down.

   Everything else in this game works in world units where ONE UNIT OF WINE IS
   ONE UNIT TALL. Nothing in state is ever a pixel, so a resize, a rotation or a
   phone with an unusual aspect changes this file and nothing else. The bubble
   game and the pour game are both built this way; the reason is that a game
   whose state is measured in pixels has to be recomputed every time the window
   moves, and anything mid-animation lands somewhere else when it does.

   The bench geometry lives here rather than in the renderer because two things
   need it and they must not disagree: the renderer draws a vessel where this
   says it is, and the input decides which vessel was tapped from the same
   numbers. A hit test with its own idea of where the glass is produces the worst
   possible bug in a game played entirely by tapping — the one where the tap
   works, just not on the thing under your finger. */
const MeasureView = (() => {
  const C = MeasureConfig;
  let cv = null, ctx = null, scale = 1, ox = 0, oy = 0, dpr = 1;

  /* The box a given bench needs, for a screen of a given shape.

     Derived here rather than kept in the config, because the config is pure data
     and this is the first half of the transform.

     A bench's world is only as tall as its own LARGEST vessel. Holding it at
     CAP_MAX instead would draw a bench of eights as a third of a screen of
     nothing. Within a bench the unit is constant, which is the invariant the
     whole layout exists to keep; across benches it is not, and it does not need
     to be — nobody compares two benches, because only one is ever on screen.

     The height is therefore forced, and the width is what is left to choose. It
     is chosen so the world has the same shape as the canvas, which is the only
     way a short bench fills a tall screen: narrower vessels IN UNITS mean more
     pixels per unit, which is more room between the graduations, which is the
     thing being read. A bench of twelves went from twenty-two pixels a unit to
     thirty-five this way, with a quarter of the screen empty at each end before.

     Clamped at both ends, because both are ugly: unclamped, that same bench is
     four tubes at one part in eight on a phone and four tanks in a wide desktop
     window. Inside the clamp the world simply stops matching the canvas and
     keeps a little air above and below, which is the right thing for it to do. */
  function worldFor(caps, aspect){
    const tallest = Math.max(...caps);
    const n = caps.length;
    const h = tallest + C.HEADROOM + C.SHELF;
    /* what a vessel would have to be for the world to have the canvas's shape */
    const per = n + (n - 1) * C.GAP_RATIO + 2 * C.GAP_RATIO * C.EDGE_RATIO;
    const wanted = (h * aspect) / per;
    const vw = Math.max(C.VESSEL_W_MIN, Math.min(C.VESSEL_W_MAX, wanted));
    const gap = vw * C.GAP_RATIO;
    const edge = gap * C.EDGE_RATIO;
    return {
      vw, gap, edge,
      w: n * vw + (n - 1) * gap + 2 * edge,
      h,
      /* y of the shelf surface, which every vessel stands on */
      floor: tallest + C.HEADROOM
    };
  }

  /* What is on the bench, and the world it works out to. Kept apart because the
     world depends on the canvas as well as on the bench, so a rotation has to be
     able to recompute it without being told what is on the shelf again. */
  let caps = [C.CAP_MAX];
  let world = worldFor(caps, 0.6);

  function mount(canvas){
    cv = canvas;
    ctx = cv.getContext('2d');
    resize();
    addEventListener('resize', resize);
    addEventListener('orientationchange', resize);
    return ctx;
  }

  /* Told what is on the bench. Called when a board is dealt, never per frame. */
  function fit(next){
    caps = next.slice();
    resize();
  }

  function resize(){
    if (!cv) return false;
    const box = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width));
    const h = Math.max(1, Math.round(box.height));
    dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.ceil(w * dpr);
    cv.height = Math.ceil(h * dpr);

    /* The world is rebuilt here rather than only when a board is dealt, because
       its width depends on the shape of the canvas. A rotation changes that
       shape, and a bench laid out for the old one would be laid out for a screen
       that no longer exists. */
    world = worldFor(caps, w / h);

    /* Fit the whole bench, centred, never cropped, and on one scale for both
       axes. A separate x and y scale would fill the screen exactly and is the
       obvious thing to reach for here, since a vessel's width means nothing —
       but it stretches the numerals under the vessels, and those are read on
       every single turn. */
    scale = Math.min(w / world.w, h / world.h);
    ox = (w - world.w * scale) / 2;
    oy = (h - world.h * scale) / 2;
    return true;
  }

  /* Applied fresh each frame rather than accumulated, so a dropped frame or a
     resize halfway through a pour cannot leave the transform half applied. */
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

  /* Where a vessel stands. Every vessel is the same width and rests its base on
     the shelf; only the rim differs, which is what makes a horizontal line mean
     the same amount everywhere across the bench. */
  function vesselBox(onBench, i){
    const x = world.edge + i * (world.vw + world.gap);
    return { x, w: world.vw, base: world.floor, rim: world.floor - onBench[i], cap: onBench[i] };
  }

  /* The height of a given amount of wine, in world y. The whole point of the
     layout is that this function does not take a vessel. */
  const yFor = amount => world.floor - amount;

  /* Which vessel a point is on.

     The whole column counts, not the glass: the band runs from halfway across
     one gap to halfway across the next, and from the top of the world to the
     shelf. A two-unit vessel is a postage stamp on a phone, and requiring a tap
     to land on the glass itself would make the smallest vessel — which is
     usually the interesting one — the hardest thing on the bench to pick up. */
  function vesselAt(onBench, p){
    if (p.y < 0 || p.y > world.floor + C.SHELF * 0.6) return -1;
    const pitch = world.vw + world.gap;
    const i = Math.floor((p.x - world.edge + world.gap / 2) / pitch);
    return i >= 0 && i < onBench.length ? i : -1;
  }

  return {
    mount, fit, frame, screenToWorld, vesselBox, yFor, vesselAt,
    get world(){ return world; },
    get ctx(){ return ctx; },
    get scale(){ return scale; }
  };
})();
globalThis.MeasureView = MeasureView;
