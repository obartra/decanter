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
  /* The world box for the board currently on the bench. A board is only as tall
     as its own largest vessel; see MeasureConfig.worldFor. */
  let world = C.worldFor([C.CAP_MAX]);

  function mount(canvas){
    cv = canvas;
    ctx = cv.getContext('2d');
    resize();
    addEventListener('resize', resize);
    addEventListener('orientationchange', resize);
    return ctx;
  }

  /* Told what is on the bench, so the transform can be recomputed for it. Called
     when a board is dealt, never per frame. */
  function fit(caps){
    world = C.worldFor(caps);
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

    /* Fit the whole bench, centred, never cropped. A vessel drawn off the bottom
       of the screen is a vessel whose contents cannot be read, and reading them
       is the entire game. */
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
  function vesselBox(caps, i){
    const x = C.GAP + i * (C.VESSEL_W + C.GAP);
    return { x, w: C.VESSEL_W, base: world.floor, rim: world.floor - caps[i], cap: caps[i] };
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
  function vesselAt(caps, p){
    if (p.y < 0 || p.y > world.floor + C.SHELF * 0.6) return -1;
    const pitch = C.VESSEL_W + C.GAP;
    const i = Math.floor((p.x - C.GAP / 2) / pitch);
    return i >= 0 && i < caps.length ? i : -1;
  }

  return {
    mount, fit, resize, frame, screenToWorld, vesselBox, yFor, vesselAt,
    get world(){ return world; },
    get ctx(){ return ctx; },
    get scale(){ return scale; }
  };
})();
globalThis.MeasureView = MeasureView;
