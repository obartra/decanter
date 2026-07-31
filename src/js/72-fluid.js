/* The liquid.

   This draws the contents of every bottle onto one canvas behind the glass. It
   is a mask, not a simulation, which is how liquid in a container is normally
   done: the shape of the glass is the clip, and the surface is a line in world
   space. A tilting bottle turns its clip and leaves the line alone, so the
   liquid stays level while the glass rotates, without that having to be
   arranged. See docs/DESIGN.md for what this replaced and why.

   Everything follows from the clip. Liquid is only ever drawn through a glass,
   so liquid outside a glass is not a thing this code can express: it is not
   guarded against, it has no representation. */
const Fluid = (() => {
  function supported(){
    try { return !!document.createElement('canvas').getContext('2d'); }
    catch (e) { return false; }
  }

  let root = null, cv = null, ctx = null;
  let W = 0, H = 0, dpr = 1;
  let bottles = [];        /* geometry, measured from the DOM */
  let state = [];          /* per bottle: bands bottom to top, units may be fractional */
  let anim = null;         /* the pour being animated, if any */
  let running = false, raf = 0, last = 0, idle = 0;

  const colorOf = c => CONFIG.palette[c] || '#888';

  function mount(el){
    root = el;
    cv = document.createElement('canvas');
    cv.className = 'fluidLayer';
    ctx = cv.getContext('2d');
  }
  /* render() rebuilds the board with innerHTML, so the canvas is put back as the
     first child: behind the bottles, where the glass and its sheen sit over the
     liquid rather than under it. */
  function attach(){
    if (root && cv.parentNode !== root) root.insertBefore(cv, root.firstChild);
  }

  /* Offsets, not bounding rects: offsets are layout values and ignore
     transforms, so this is the glass at rest even if a bottle is lifted or
     mid-bounce right now. */
  function measure(){
    if (!root) return false;
    attach();
    const box = root.getBoundingClientRect();
    if (box.width < 8 || box.height < 8) return false;
    W = Math.round(box.width);
    H = Math.round(box.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);

    bottles = [];
    root.querySelectorAll('.bottle').forEach((b, i) => {
      const glass = b.querySelector('.glass');
      if (!glass) return;
      const bx = b.offsetLeft, by = b.offsetTop;
      const gx = bx + glass.offsetLeft, gy = by + glass.offsetTop;
      const gw = glass.offsetWidth, gh = glass.offsetHeight;
      const cs = getComputedStyle(glass);
      const r = k => Math.max(0, (parseFloat(cs[k]) || 0) - 1);
      bottles[i] = {
        i, el: b,
        x0: gx + 1, x1: gx + gw - 1,
        yTop: gy + 1, yBot: gy + gh - 1,
        radii: [r('borderTopLeftRadius'), r('borderTopRightRadius'),
                r('borderBottomRightRadius'), r('borderBottomLeftRadius')],
        cx: bx + b.offsetWidth / 2,
        cy: by + b.offsetHeight / 2,
        m: null
      };
    });
    return bottles.length > 0;
  }

  /* Any transform on a bottle moves its glass: pouring tips it, selecting lifts
     it, sealing bounces it. All of them have to move the liquid with it. */
  function readTransforms(){
    for (let i = 0; i < bottles.length; i++){
      const b = bottles[i];
      if (!b || !b.el) continue;
      const t = getComputedStyle(b.el).transform;
      if (!t || t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'){ b.m = null; continue; }
      try { b.m = new DOMMatrixReadOnly(t); } catch (e) { b.m = null; }
    }
  }
  function toWorld(b, x, y){
    if (!b.m) return { x, y };
    const p = b.m.transformPoint(new DOMPoint(x - b.cx, y - b.cy));
    return { x: p.x + b.cx, y: p.y + b.cy };
  }
  const corners = b => [[b.x0, b.yTop], [b.x1, b.yTop], [b.x1, b.yBot], [b.x0, b.yBot]]
    .map(([x, y]) => toWorld(b, x, y));

  /* ---- where the surface sits ----

     For an upright bottle the fill line is simple arithmetic. For a tipped one
     the glass is a rotated quad and the line is still horizontal, so the level
     is whichever height leaves the right *area* underneath it. That is solved by
     bisection: a dozen polygon clips, which is nothing next to what a particle
     solver cost, and it is exact rather than approximated. */
  function polyArea(p){
    let a = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++)
      a += (p[j].x + p[i].x) * (p[j].y - p[i].y);
    return Math.abs(a / 2);
  }
  /* the part of a convex polygon at or below a horizontal line */
  function clipBelow(poly, y){
    const out = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
      const a = poly[j], b = poly[i];
      const ain = a.y >= y, bin = b.y >= y;
      if (ain !== bin){
        const t = (y - a.y) / (b.y - a.y);
        out.push({ x: a.x + (b.x - a.x) * t, y });
      }
      if (bin) out.push(b);
    }
    return out;
  }
  function levelFor(b, quad, frac){
    if (frac <= 0) return b.m ? Math.max(...quad.map(p => p.y)) : b.yBot;
    if (frac >= 1) return b.m ? Math.min(...quad.map(p => p.y)) : b.yTop;
    if (!b.m) return b.yBot - (b.yBot - b.yTop) * frac;      /* upright: no search needed */
    let lo = Math.min(...quad.map(p => p.y)), hi = Math.max(...quad.map(p => p.y));
    const want = polyArea(quad) * frac;
    for (let k = 0; k < 18; k++){
      const mid = (lo + hi) / 2;
      if (polyArea(clipBelow(quad, mid)) > want) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* ---- contents ---- */
  const bandsOf = tube => {
    const out = [];
    for (const c of tube){
      const last = out[out.length - 1];
      if (last && last.c === c) last.units++; else out.push({ c, units: 1 });
    }
    return out;
  };
  const clone = bands => bands.map(x => ({ c: x.c, units: x.units }));

  function shrinkTop(bands, amount){
    const out = clone(bands);
    let left = amount;
    for (let i = out.length - 1; i >= 0 && left > 0; i--){
      const take = Math.min(out[i].units, left);
      out[i].units -= take; left -= take;
      if (out[i].units <= 1e-6) out.splice(i, 1);
    }
    return out;
  }
  function growTop(bands, c, amount){
    const out = clone(bands);
    const last = out[out.length - 1];
    if (last && last.c === c) last.units += amount;
    else if (amount > 1e-6) out.push({ c, units: amount });
    return out;
  }

  let retry = 0;
  function sync(view){
    clearTimeout(retry);
    if (!measure()){ retry = setTimeout(() => sync(view), 120); return; }
    state = view.map(bandsOf);
    anim = null;
    readTransforms();
    draw();
  }

  /* ---- drawing ---- */
  function glassPath(b){
    ctx.save();
    if (b.m){
      ctx.translate(b.cx, b.cy);
      ctx.transform(b.m.a, b.m.b, b.m.c, b.m.d, b.m.e, b.m.f);
      ctx.translate(-b.cx, -b.cy);
    }
    const w = b.x1 - b.x0, h = b.yBot - b.yTop;
    if (ctx.roundRect) ctx.roundRect(b.x0, b.yTop, w, h, b.radii);
    else ctx.rect(b.x0, b.yTop, w, h);
    ctx.restore();
  }

  function drawBottle(b, bands){
    if (!b || !bands || !bands.length) return;
    const quad = corners(b);
    ctx.save();
    ctx.beginPath();
    glassPath(b);
    ctx.clip();

    let below = 0;
    bands.forEach(band => {
      const f0 = below / Rules.CAP;
      const f1 = (below + band.units) / Rules.CAP;
      below += band.units;
      const yLo = levelFor(b, quad, f0);
      const yHi = levelFor(b, quad, f1);
      if (yLo - yHi < 0.2) return;
      ctx.fillStyle = colorOf(band.c);
      ctx.fillRect(-4, yHi, W + 8, yLo - yHi);
      /* a brighter line where one liquid meets the next, so the layers read as
         surfaces rather than as stacked blocks */
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(-4, yHi, W + 8, Math.min(2.5, yLo - yHi));
    });

    /* lit on the left, shaded on the right, only where there is liquid */
    const g = ctx.createLinearGradient(b.x0, 0, b.x1, 0);
    g.addColorStop(0, 'rgba(28,17,7,.20)');
    g.addColorStop(0.24, 'rgba(255,240,206,.15)');
    g.addColorStop(0.6, 'rgba(255,224,170,.05)');
    g.addColorStop(1, 'rgba(8,5,10,.26)');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = g;
    ctx.fillRect(-4, 0, W + 8, H);
    ctx.restore();
  }

  function draw(){
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < bottles.length; i++) drawBottle(bottles[i], state[i]);
  }

  /* ---- the pour ----
     One number moving, not a stream: the source's level falls while the target's
     rises. The stream between them is drawn by the scripted ribbon, which is how
     games draw a pour. */
  function transfer(move){
    return new Promise(resolve => {
      const src = bottles[move.from], dst = bottles[move.to];
      if (!src || !dst || !state[move.from]){ resolve(); return; }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(bail);
        anim = null;
        resolve();
      };
      anim = {
        from: move.from, to: move.to, c: move.color, n: move.n,
        src: clone(state[move.from]), dst: clone(state[move.to] || []),
        t: 0, dur: 0.16 * move.n + 0.34, done: finish
      };
      /* timers still fire in a tab that is not painting, so a pour cannot hang
         the queue waiting on a frame that never comes */
      const bail = setTimeout(finish, 1200 + 400 * move.n);
      wake();
    });
  }

  function step(dt){
    readTransforms();
    if (!anim) return;
    anim.t += dt;
    const p = Math.min(1, anim.t / anim.dur);
    const moved = anim.n * p;
    state[anim.from] = shrinkTop(anim.src, moved);
    state[anim.to] = growTop(anim.dst, anim.c, moved);
    if (p >= 1){ const fin = anim.done; anim = null; fin(); }
  }

  const anyMoved = () => bottles.some(b => b && b.m);

  function loop(){
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    step(dt);
    draw();
    if (!anim && !anyMoved()){ if (++idle > 20) stop(); } else idle = 0;
  }
  function wake(){ idle = 0; start(); }
  function start(){ if (running) return; running = true; last = performance.now(); loop(); }
  function stop(){ running = false; cancelAnimationFrame(raf); }

  return {
    supported, mount, sync, transfer, draw, wake,
    resize(){ if (root && bottles.length) measure(); },
    get mounted(){ return !!root; }
  };
})();
globalThis.Fluid = Fluid;
