/* Particle liquid.

   Adapted from the design study's <fluid-pour>. That element was a showpiece: a
   six-second loop that poured one fixed bottle into one fixed neighbour forever,
   seeded from a hardcoded string, with no method, event or attribute a caller
   could drive. The solver and the metaball renderer are worth keeping, so they
   are kept; everything that decided *when* a pour happened is replaced.

   What is different here:
   - geometry is measured from the real bottles, so it follows the responsive
     grid instead of assuming one row of six at a fixed size
   - particles are seeded from the game's tube state, not a string
   - pour() takes a move and resolves once the liquid stops moving, so the queue
     in 90-app.js can await it the way it awaits the scripted animation
   - it declines to run at all where it would be a downgrade

   The physics is Clavet double-density relaxation: each colour carries a density
   so potions stratify, and particles only see neighbours in the same bottle, so
   liquid can never cross a glass wall. */
const Fluid = (() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* The renderer needs canvas filters for the metaball threshold. Without them
     every colour would render as a cloud of soft dots, which is worse than the
     animation this replaces, so the scripted pour stays in charge instead. */
  function canFilter(){
    try {
      const c = document.createElement('canvas').getContext('2d');
      if (typeof c.filter !== 'string') return false;
      c.filter = 'blur(2px)';
      return c.filter !== 'none';
    } catch (e) { return false; }
  }

  const supported = () => !reduce && canFilter();

  let root = null, cv = null, ctx = null, field = null, mask = null, sprite = null;
  let W = 0, H = 0, dpr = 1, R = 9;
  let bottles = [], parts = [], bands = null;
  let running = false, raf = 0, last = 0, acc = 0, idle = 0;
  let rho0 = 2.4, calibrated = false;
  let jet = null;                       /* the pour in flight, if any */

  const K = 0.34, KNEAR = 0.85, MAXD = 1.0;
  const GRAV = 680, BUOY = 90, VISC = 0.14, DAMP = 0.985, H2 = 256, HR = 16;

  /* heavier colours sink. Spread deterministically so a board of any palette
     still stratifies into readable layers rather than one muddy column. */
  const densityOf = c => 0.8 + ((c * 7) % 10) * 0.06;
  const colorOf = c => CONFIG.palette[c] || '#888';

  function surface(w, h){
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const x = c.getContext('2d'); x.scale(dpr, dpr);
    return { c, x };
  }

  function buildSprite(){
    const s = surface(R * 2, R * 2);
    const g = s.x.createRadialGradient(R, R, 0, R, R, R);
    g.addColorStop(0, 'rgba(255,255,255,.58)');
    g.addColorStop(0.45, 'rgba(255,255,255,.44)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    s.x.fillStyle = g; s.x.beginPath(); s.x.arc(R, R, R, 0, 6.283); s.x.fill();
    sprite = s.c;
  }

  function mount(el){
    root = el;
    cv = document.createElement('canvas');
    cv.className = 'fluidLayer';
    ctx = cv.getContext('2d');
  }

  /* render() rebuilds the board with innerHTML, which throws the canvas away, so
     it is put back as the first child: behind the bottles, where the glass and
     its sheen still sit over the liquid rather than under it. */
  function attach(){
    if (root && cv.parentNode !== root) root.insertBefore(cv, root.firstChild);
  }

  /* Read the board back from the DOM. Each bottle gets its own rectangle, which
     is what lets this work on the two-row phone layout the original could not
     express, and it re-measures on resize rather than trusting cached numbers. */
  function measure(){
    if (!root) return false;
    attach();
    const box = root.getBoundingClientRect();
    /* A board with no layout yet, mid view-change or in a tab that is not
       rendering, measures as nothing. Sizing the canvas to that would leave the
       sim quietly drawing one pixel forever, so wait for a real board instead. */
    if (box.width < 8 || box.height < 8) return false;
    W = Math.round(box.width);
    H = Math.round(box.height);
    dpr = Math.min(1.5, window.devicePixelRatio || 1);

    cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);
    field = surface(W, H); mask = surface(W, H);
    buildSprite();

    bottles = [];
    const els = root.querySelectorAll('.bottle');
    els.forEach((b, i) => {
      const glass = b.querySelector('.glass');
      if (!glass) return;
      /* Offsets, not bounding rects. Offsets are layout values and ignore
         transforms, so this is the glass at rest even if the bottle happens to
         be lifted or mid-bounce right now. Measuring the transformed rect would
         bake the lift into the rest geometry and then apply it a second time. */
      const bx = b.offsetLeft, by = b.offsetTop;
      const gx = bx + glass.offsetLeft, gy = by + glass.offsetTop;
      const gw = glass.offsetWidth, gh = glass.offsetHeight;
      bottles[i] = {
        i, el: b,
        x0: gx + 2, x1: gx + gw - 2,
        yTop: gy + 2, yBot: gy + gh - 2,
        cap: gh - 4,
        /* transform-origin is the centre of the whole bottle, collar included */
        cx: bx + b.offsetWidth / 2,
        cy: by + b.offsetHeight / 2,
        m: null, inv: null
      };
    });
    return bottles.length > 0;
  }

  /* A tipping bottle carries its glass with it, so the walls have to tip too.
     The bottle is treated as an oriented box: particles are pushed into local,
     upright space to be clamped, then put back. Gravity is never rotated, which
     is what keeps the surface level while the glass turns around it. */
  /* Every bottle, not just the one pouring. Selecting a bottle lifts it 20px and
     landing bounces it, and while the sim only watched the pouring bottle those
     moved the glass without moving the liquid: a lifted bottle left a slab of it
     protruding below, and a bouncing one showed it above the rim. Reading the
     computed transform for all of them costs a handful of style reads next to a
     solver that is already relaxing hundreds of particles. */
  function readTransforms(){
    for (let i = 0; i < bottles.length; i++){
      const b = bottles[i];
      if (!b || !b.el) continue;
      const t = getComputedStyle(b.el).transform;
      if (!t || t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'){ b.m = b.inv = null; continue; }
      try {
        b.m = new DOMMatrixReadOnly(t);
        b.inv = b.m.inverse();
      } catch (e) { b.m = b.inv = null; }
    }
  }
  function toLocal(b, x, y){
    if (!b.inv) return { x, y };
    const p = b.inv.transformPoint(new DOMPoint(x - b.cx, y - b.cy));
    return { x: p.x + b.cx, y: p.y + b.cy };
  }
  function toWorld(b, x, y){
    if (!b.m) return { x, y };
    const p = b.m.transformPoint(new DOMPoint(x - b.cx, y - b.cy));
    return { x: p.x + b.cx, y: p.y + b.cy };
  }
  /* the glass outline in board coordinates, tilt included */
  function corners(b){
    return [[b.x0, b.yTop], [b.x1, b.yTop], [b.x1, b.yBot], [b.x0, b.yBot]]
      .map(([x, y]) => toWorld(b, x, y));
  }

  function add(x, y, c, home, vx, vy){
    parts.push({ x, y, px: x, py: y, vx: vx || 0, vy: vy || 0,
                 c, d: densityOf(c), home, wob: Math.random() * 3.4 });
  }

  /* one bottle's worth of liquid, heaviest colour at the bottom */
  function fillBottle(bi, tube){
    const b = bottles[bi];
    if (!b || !tube || !tube.length) return;
    const step = 4.95;
    const ordered = tube.slice().sort((A, B) => densityOf(B) - densityOf(A));
    ordered.forEach((c, layer) => {
      const lh = b.cap / Rules.CAP;
      const yTop = b.yBot - (layer + 1) * lh;
      for (let y = yTop + 1.5; y < yTop + lh - 1; y += step)
        for (let x = b.x0 + 2; x < b.x1 - 1.5; x += step)
          add(x + (Math.random() - .5) * .6, y + (Math.random() - .5) * .6, c, bi);
    });
  }

  let retry = 0;
  function sync(view){
    clearTimeout(retry);
    if (!measure()){
      /* try again shortly rather than giving up: the board usually has a size a
         frame or two later, and a sim that never seeded would show nothing at
         all while the game carried on underneath it */
      retry = setTimeout(() => sync(view), 120);
      return;
    }
    parts = []; bands = null; calibrated = false; rho0 = 2.4; jet = null;
    view.forEach((tube, i) => fillBottle(i, tube));
    draw();
  }

  /* ---- the solver ---- */
  function step(dt){
    readTransforms();
    if (jet){
      jet.t += dt;
      const want = Math.min(jet.quota, Math.floor((jet.t / jet.dur) * jet.quota));
      /* Leave from the lip of the bottle that is actually tipping, recomputed
         every step so the stream tracks the tilt instead of appearing beside the
         target with nothing joining it to the bottle it came from. */
      const s = bottles[jet.from], d = bottles[jet.to];
      const mouth = s ? toWorld(s, (s.x0 + s.x1) / 2, s.yTop) : { x: jet.x, y: jet.y };
      const aimX = d ? (d.x0 + d.x1) / 2 : mouth.x;
      const vx = Math.max(-160, Math.min(160, (aimX - mouth.x) * 1.2));
      while (jet.sent < want){
        jet.sent++;
        const j = (Math.random() - .5) * 1.4;
        add(mouth.x + j, mouth.y + j, jet.c, -1,
            vx + (Math.random() - .5) * 10, 34 + (Math.random() - .5) * 6);
        parts[parts.length - 1].poured = true;
      }
      /* The source loses what the jet carries, taken from the surface down, so
         it empties while the target fills instead of staying full until the
         board is re-seeded underneath it. */
      let died = false;
      while (jet.pulled < jet.sent && jet.pulled < jet.pool.length){
        jet.pool[jet.pulled++].dead = true;
        died = true;
      }
      if (died) parts = parts.filter(p => !p.dead);
    }

    for (let i = 0; i < parts.length; i++){
      const p = parts[i];
      p.vy += GRAV * dt;
      p.px = p.x; p.py = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }

    const cs = HR, cols = Math.ceil(W / cs) + 3, rows = Math.ceil(H / cs) + 3;
    const grid = new Array(cols * rows);
    for (let i = 0; i < parts.length; i++){
      const p = parts[i];
      const idx = (((p.y / cs) | 0) + 1) * cols + ((p.x / cs) | 0) + 1;
      if (idx >= 0 && idx < grid.length) (grid[idx] || (grid[idx] = [])).push(p);
    }

    const samples = calibrated ? null : [];
    for (let i = 0; i < parts.length; i++){
      const p = parts[i];
      const cx = ((p.x / cs) | 0) + 1, cy = ((p.y / cs) | 0) + 1;
      let rho = 0, rhoN = 0, dSum = 0, dN = 0;
      const list = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
        const g = grid[(cy + dy) * cols + cx + dx]; if (!g) continue;
        for (let j = 0; j < g.length; j++){
          const q = g[j]; if (q === p) continue;
          /* glass between them: only airborne liquid mixes across bottles */
          if (p.home !== -1 && q.home !== -1 && q.home !== p.home) continue;
          const ddx = q.x - p.x, ddy = q.y - p.y, r2 = ddx * ddx + ddy * ddy;
          if (r2 >= H2 || r2 < 0.0001) continue;
          const r = Math.sqrt(r2), a = 1 - r / HR;
          rho += a * a; rhoN += a * a * a; dSum += q.d; dN++;
          list.push({ q, ddx, ddy, r, a });
        }
      }
      if (samples && dN >= 6) samples.push(rho);
      const Pp = K * (rho - rho0), Pn = KNEAR * rhoN;
      for (let j = 0; j < list.length; j++){
        const it = list[j], nx = it.ddx / it.r, ny = it.ddy / it.r;
        let D = (Pp * it.a + Pn * it.a * it.a) * 0.5;
        if (D > MAXD) D = MAXD; else if (D < -MAXD) D = -MAXD;
        it.q.x += nx * D; it.q.y += ny * D;
        p.x -= nx * D; p.y -= ny * D;
        const u = (it.q.vx - p.vx) * nx + (it.q.vy - p.vy) * ny;
        if (u > 0){
          const imp = VISC * it.a * u * 0.5;
          p.vx += nx * imp; p.vy += ny * imp;
          it.q.vx -= nx * imp; it.q.vy -= ny * imp;
        }
      }
      if (dN > 2) p.vy += (p.d - dSum / dN) * BUOY * dt;
    }
    if (samples && samples.length > 40){
      samples.sort((a, b) => a - b);
      rho0 = samples[samples.length >> 1] * 0.78;
      calibrated = true;
    }

    /* stratify: give each colour a band and ease strays toward it */
    bandT += dt;
    if (bandT > 0.1){
      bandT = 0;
      const per = {}, top = {};
      for (let i = 0; i < parts.length; i++){
        const p = parts[i]; if (p.home === -1) continue;
        (per[p.home] || (per[p.home] = {}))[p.c] = (per[p.home][p.c] || 0) + 1;
        if (top[p.home] === undefined || p.y < top[p.home]) top[p.home] = p.y;
      }
      bands = {};
      Object.keys(per).forEach(bi => {
        const b = bottles[bi]; if (!b || b.m) return;   /* upright bottles only */
        const counts = per[bi];
        const keys = Object.keys(counts).sort((A, B) => densityOf(+B) - densityOf(+A));
        const total = keys.reduce((s, k) => s + counts[k], 0);
        const top0 = Math.max(b.yTop, Math.min(top[bi], b.yBot - 8));
        const colH = b.yBot - top0;
        let y = b.yBot; const map = {};
        keys.forEach(k => { const h = (counts[k] / total) * colH; map[k] = { y0: y - h, y1: y }; y -= h; });
        bands[bi] = map;
      });
    }

    /* walls, ownership, culling */
    const T = jet ? bottles[jet.to] : null;
    for (let i = parts.length - 1; i >= 0; i--){
      const p = parts[i];
      if (p.home === -1){
        if (T && p.y > T.yTop + 1 && p.x > T.x0 - 2 && p.x < T.x1 + 2) p.home = jet.to;
        else if (!T || p.y > T.yBot) { parts.splice(i, 1); continue; }
      }
      if (p.home !== -1){
        const b = bottles[p.home];
        if (!b){ parts.splice(i, 1); continue; }
        if (b.m){
          /* tipped: clamp in the bottle's own frame, then come back out. The
             mouth is left open so liquid can leave a bottle that is pouring. */
          const L = toLocal(b, p.x, p.y);
          if (L.x < b.x0) L.x = b.x0;
          if (L.x > b.x1) L.x = b.x1;
          if (L.y > b.yBot) L.y = b.yBot;
          const back = toWorld(b, L.x, L.y);
          p.x = back.x; p.y = back.y;
        } else {
          if (p.x < b.x0) p.x = b.x0;
          if (p.x > b.x1) p.x = b.x1;
          if (p.y > b.yBot) p.y = b.yBot;
          if (p.y < b.yTop - 30) p.y = b.yTop - 30;
        }
      }
      p.vx = (p.x - p.px) * 60 * DAMP;
      p.vy = (p.y - p.py) * 60 * DAMP;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 420){ const s = 420 / sp; p.vx *= s; p.vy *= s; }
    }

    if (bands){
      for (let i = 0; i < parts.length; i++){
        const p = parts[i]; if (p.home === -1) continue;
        const b = bottles[p.home]; if (!b || b.m) continue;
        const band = bands[p.home] && bands[p.home][p.c];
        if (!band) continue;
        const slack = 1.5 + (p.wob || 0);
        if (p.y < band.y0 - slack) p.y = band.y0 - slack;
        else if (p.y > band.y1 + slack) p.y = band.y1 + slack;
        p.py = p.y;
      }
    }
  }
  let bandT = 0;

  /* a pour is done when everything it threw has landed and gone quiet */
  function settled(){
    if (!jet) return true;
    if (jet.sent < jet.quota) return false;
    for (let i = 0; i < parts.length; i++){
      const p = parts[i];
      if (p.home === -1) return false;
      if (p.poured && Math.hypot(p.vx, p.vy) > 26) return false;
    }
    return true;
  }

  /* metaballs for one set of particles: blobs, threshold, tint */
  function paint(list){
    const groups = {};
    for (let i = 0; i < list.length; i++){
      const p = list[i];
      (groups[p.c] || (groups[p.c] = [])).push(p);
    }
    Object.keys(groups).forEach(k => {
      const g = groups[k];
      field.x.clearRect(0, 0, W, H);
      for (let i = 0; i < g.length; i++){
        const p = g[i];
        field.x.drawImage(sprite, p.x - R, p.y - R, R * 2, R * 2);
      }
      mask.x.clearRect(0, 0, W, H);
      mask.x.save();
      mask.x.filter = 'blur(4.6px) contrast(8.5)';
      mask.x.drawImage(field.c, 0, 0, W, H);
      mask.x.restore();
      mask.x.save();
      mask.x.globalCompositeOperation = 'source-in';
      mask.x.fillStyle = colorOf(+k);
      mask.x.fillRect(0, 0, W, H);
      mask.x.restore();
      ctx.drawImage(mask.c, 0, 0, W, H);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.14;
      ctx.drawImage(mask.c, 0, -3.5, W, H);
      ctx.restore();
    });
  }

  /* Two passes, because the two kinds of liquid want opposite clips.

     Liquid that belongs to a bottle is clipped to that glass and nothing else.
     Sharing one clip with the jet was the bug behind the slabs: the corridor
     that let the stream through was a band spanning source to target, and on a
     two-row board it cut across the bottoms of the row above, letting their
     liquid render far outside any glass.

     The jet belongs to no bottle, so it is drawn on its own. It needs no clip:
     only airborne particles are in that pass, so nothing can leak. */
  function draw(){
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    const held = [], air = [];
    for (let i = 0; i < parts.length; i++){
      (parts[i].home === -1 ? air : held).push(parts[i]);
    }

    ctx.save();
    ctx.beginPath();
    bottles.forEach(b => {
      if (!b) return;
      const q = corners(b);
      ctx.moveTo(q[0].x, q[0].y);
      for (let i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y);
      ctx.closePath();
    });
    ctx.clip();
    paint(held);
    ctx.restore();

    if (air.length) paint(air);
  }

  const anyMoved = () => bottles.some(b => b && b.m);

  function loop(){
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    acc += dt;
    const fixed = 1 / 60; let guard = 3;
    while (acc >= fixed && guard--){ step(fixed); acc -= fixed; }
    if (acc > fixed) acc = 0;
    draw();
    if (jet && settled()){
      const done = jet.done;
      jet = null;
      for (let i = 0; i < parts.length; i++) parts[i].poured = false;
      done();
    }
    /* Keep running while anything is moving the glass, so a lifted or bouncing
       bottle carries its liquid with it, then stand down once the shelf is
       still again rather than burning frames on a settled board. */
    if (!jet && !anyMoved()){ if (++idle > 10) stop(); } else idle = 0;
  }
  function wake(){ idle = 0; start(); }
  function start(){ if (running) return; running = true; last = performance.now(); acc = 0; loop(); }
  function stop(){ running = false; cancelAnimationFrame(raf); }

  /* Resolves when the liquid has settled. Backstopped by a timer for the same
     reason the scripted pour is: requestAnimationFrame stops in a hidden tab,
     and a pour that never finishes would strand the queue waiting on it. */
  function pour(move){
    return new Promise(resolve => {
      const src = bottles[move.from], dst = bottles[move.to];
      if (!src || !dst){ resolve(); return; }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(bail);
        jet = null;
        resolve();
      };
      const dir = dst.x0 > src.x0 ? 1 : -1;
      const perUnit = Math.round(((src.x1 - src.x0) * (src.cap / Rules.CAP)) / 24);
      const quota = Math.max(12, perUnit * move.n);
      /* the liquid the source is about to lose, nearest its mouth first */
      const pool = parts.filter(p => p.home === move.from && p.c === move.color)
                        .sort((a, b) => a.y - b.y)
                        .slice(0, quota);
      jet = {
        from: move.from, to: move.to, c: move.color,
        x: (dst.x0 + dst.x1) / 2 - dir * (dst.x1 - dst.x0) * 0.5,
        y: dst.yTop - 26,
        vx: dir * 34, vy: 46,
        quota,
        pool, pulled: 0,
        sent: 0, t: 0, dur: 0.22 * move.n + 0.18,
        done: finish
      };
      const bail = setTimeout(finish, 900 + 420 * move.n);
      start();
    });
  }

  return {
    supported, mount, sync, pour, draw, wake,
    resize(){ if (root && bottles.length) measure(); },
    get mounted(){ return !!root; }
  };
})();
globalThis.Fluid = Fluid;
