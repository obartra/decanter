/* The room, drawn rather than photographed.

   The painted backdrops this replaces were a fixed size, so their shelf line
   landed wherever the viewport put it and the bottles stood in front of it
   rather than on it. Here the board reports where every row of bottles ended up
   and the shelving is built under them, so it is aligned at any size by
   construction rather than by luck.

   Colours are sampled from the reference art before it was deleted: near black
   at the top, warm brown through the middle, a glow at the base, candlelight at
   #D59738. The moss behind the map comes from the same source, #151A0B to
   #868552.

   Depth is the other job. The bottles being played have to read as standing in
   front of the room, so the room steps back directly behind them and each bottle
   is given a contact shadow on the plank it stands on. Without those the clutter
   behind shows through the glass and the whole shelf flattens into one plane. */
const Backdrop = (() => {
  const CELLAR = {
    sky: ['#040507', '#0B0805', '#150F08', '#1E1509', '#0A0704'],
    glow: '213,151,56', wood: ['#8A5A22', '#5A3612', '#2E1C0A'],
    silhouette: '#0B0805', rim: '255,214,150'
  };
  const MOSS = {
    sky: ['#0A0E06', '#141A0A', '#252D14', '#31391B', '#10150A'],
    glow: '134,133,82', wood: ['#4A4A28', '#33351A', '#1A1C0D'],
    silhouette: '#0C1107', rim: '200,214,150'
  };

  let cv = null, ctx = null, W = 0, H = 0, dpr = 1;
  let kind = 'cellar', rows = [], drawn = '';

  function mount(){
    if (cv) return;
    cv = document.createElement('canvas');
    cv.className = 'backdrop';
    ctx = cv.getContext('2d');
    document.body.insertBefore(cv, document.body.firstChild);
    /* The room has to follow the window. Without this it drew once at whatever
       size the page happened to be during boot, which on a first paint can be
       nothing at all, and then never again. */
    addEventListener('resize', render);
    addEventListener('orientationchange', render);
  }

  const rand = seed => RNG.mulberry32(RNG.hashSeed(seed));

  /* An offscreen canvas at the same pixel density, drawn in CSS pixels. Used
     wherever a group of shapes has to be flattened before it is composited, so
     that overlaps merge instead of stacking their alphas. */
  function layer(w, h, draw){
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.ceil(w * dpr));
    off.height = Math.max(1, Math.ceil(h * dpr));
    const c = off.getContext('2d');
    c.scale(dpr, dpr);
    draw(c);
    return off;
  }

  /* A bottle profile: body, shoulder, neck, lip. The silhouettes used to be a
     rounded rectangle with a rectangular neck laid over the top, which is a
     large part of why the room read as generated rather than furnished. */
  function flask(c, x, y, bw, bh, squat){
    const neck = bw * (squat ? 0.40 : 0.30);
    const nx0 = x + (bw - neck) / 2, nx1 = nx0 + neck;
    const bottom = y + bh;
    const foot = Math.min(bw * 0.22, bh * 0.14);
    const shoulder = y + bh * (squat ? 0.34 : 0.24);
    const rise = bh * (squat ? 0.16 : 0.26);
    const lipY = y - rise;
    const flare = neck * 0.16;
    c.beginPath();
    c.moveTo(x, bottom - foot);
    c.quadraticCurveTo(x, bottom, x + foot, bottom);
    c.lineTo(x + bw - foot, bottom);
    c.quadraticCurveTo(x + bw, bottom, x + bw, bottom - foot);
    c.lineTo(x + bw, shoulder);
    c.quadraticCurveTo(x + bw, y, nx1, y - rise * 0.25);
    c.lineTo(nx1, lipY + flare);
    c.lineTo(nx1 + flare, lipY + flare);
    c.lineTo(nx1 + flare, lipY);
    c.lineTo(nx0 - flare, lipY);
    c.lineTo(nx0 - flare, lipY + flare);
    c.lineTo(nx0, lipY + flare);
    c.lineTo(nx0, y - rise * 0.25);
    c.quadraticCurveTo(x, y, x, shoulder);
    c.closePath();
  }

  function sky(p){
    const g = ctx.createLinearGradient(0, 0, 0, H);
    p.sky.forEach((c, i) => g.addColorStop(i / (p.sky.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* the back wall is boards, which is what stops it reading as a gradient */
  function panelling(p){
    const r = rand('boards');
    const step = Math.max(46, W / 11);
    for (let x = step * r(); x < W; x += step * (0.7 + r() * 0.6)){
      /* A seam of one flat alpha from ceiling to floor reads as a ruled line
         rather than a join between boards, so it fades where the light does. */
      const a = 0.16 + r() * 0.2;
      const dark = ctx.createLinearGradient(0, 0, 0, H);
      dark.addColorStop(0, `rgba(0,0,0,${a * 0.3})`);
      dark.addColorStop(0.45, `rgba(0,0,0,${a})`);
      dark.addColorStop(1, `rgba(0,0,0,${a * 0.45})`);
      ctx.fillStyle = dark;
      ctx.fillRect(x, 0, 1.4, H);
      const b = 0.02 + r() * 0.03;
      const lit = ctx.createLinearGradient(0, 0, 0, H);
      lit.addColorStop(0, `rgba(${p.rim},0)`);
      lit.addColorStop(0.5, `rgba(${p.rim},${b})`);
      lit.addColorStop(1, `rgba(${p.rim},0)`);
      ctx.fillStyle = lit;
      ctx.fillRect(x + 1.4, 0, 1, H);
    }
  }

  function candle(p){
    const g = ctx.createRadialGradient(W * 0.32, H * 0.30, 0, W * 0.32, H * 0.30, Math.max(W, H) * 0.6);
    g.addColorStop(0, `rgba(${p.glow},.15)`);
    g.addColorStop(0.4, `rgba(${p.glow},.05)`);
    g.addColorStop(1, `rgba(${p.glow},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* Jars and demijohns standing further back.

     Each shape used to be drawn straight onto the room at its own alpha, so
     where two overlapped you could read the outline of the one behind through
     the one in front. Nothing in a dark room looks like that; it reads as glass
     ghosts rather than as objects standing behind other objects. A pass is now
     flattened opaque in its own layer and composited once, so overlaps merge
     into a single mass, and the nearer shape simply covers what is behind it.

     Two passes rather than one, so there is still depth: the far pass is smaller
     and dimmer, and within a pass the taller shapes are drawn last so the bigger
     thing is the one in front. */
  function clutter(p, baseY, seed){
    const passes = [{ tag: 'far', scale: 0.72, alpha: 0.34 },
                    { tag: 'near', scale: 1.05, alpha: 0.55 }];
    for (const pass of passes){
      const r = rand('clutter' + seed + pass.tag);
      const n = Math.round(W / 58) + 5;
      const shapes = [];
      for (let i = 0; i < n; i++){
        const squat = r() < 0.42;
        const bw = W * (squat ? 0.035 + r() * 0.05 : 0.02 + r() * 0.032) * pass.scale;
        const bh = bw * (squat ? 0.9 + r() * 0.8 : 2.1 + r() * 2.6);
        shapes.push({ squat, bw, bh, x: r() * (W + bw) - bw / 2, lit: 0.05 + r() * 0.07 });
      }
      shapes.sort((a, b) => a.bh - b.bh);
      const h = baseY + 4;
      if (h <= 0) continue;
      const off = layer(W, h, c => {
        for (const sh of shapes){
          const y = baseY - sh.bh;
          c.fillStyle = p.silhouette;
          flask(c, sh.x, y, sh.bw, sh.bh, sh.squat);
          c.fill();
          /* the light catches one side, and the next shape along covers it if it
             happens to stand in front, which is what makes the depth read */
          c.save();
          flask(c, sh.x, y, sh.bw, sh.bh, sh.squat);
          c.clip();
          c.globalAlpha = sh.lit;
          c.fillStyle = `rgb(${p.rim})`;
          c.fillRect(sh.x + sh.bw * 0.14, y, Math.max(1, sh.bw * 0.05), sh.bh);
          c.restore();
        }
      });
      ctx.globalAlpha = pass.alpha;
      ctx.drawImage(off, 0, 0, W, h);
      ctx.globalAlpha = 1;
    }
  }

  /* Directly behind the bottles being played the room steps back, so nothing
     behind them shows through the glass and competes for the same plane. */
  function pocket(row){
    if (!row.spots || !row.spots.length) return;
    const x0 = Math.min(...row.spots.map(s => s[0])) - 34;
    const x1 = Math.max(...row.spots.map(s => s[1])) + 34;
    const top = (row.top == null ? row.y - 150 : row.top) - 26;
    const w = x1 - x0, h = row.y - top;
    if (w <= 0 || h <= 0) return;
    /* A plain rectangle here put a hard vertical edge down each side of the
       playing row, which read as a dark frame drawn around the bottles. The
       recess has to have no edges of its own, so it is faded out at the sides
       and along the top. */
    const off = layer(w, h, c => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,.10)');
      g.addColorStop(0.5, 'rgba(0,0,0,.42)');
      g.addColorStop(1, 'rgba(0,0,0,.54)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'destination-out';
      const sides = c.createLinearGradient(0, 0, w, 0);
      sides.addColorStop(0, 'rgba(0,0,0,1)');
      sides.addColorStop(0.18, 'rgba(0,0,0,0)');
      sides.addColorStop(0.82, 'rgba(0,0,0,0)');
      sides.addColorStop(1, 'rgba(0,0,0,1)');
      c.fillStyle = sides;
      c.fillRect(0, 0, w, h);
      const above = c.createLinearGradient(0, 0, 0, h * 0.24);
      above.addColorStop(0, 'rgba(0,0,0,1)');
      above.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = above;
      c.fillRect(0, 0, w, h * 0.24);
    });
    ctx.drawImage(off, x0, top, w, h);
  }

  function cobweb(p, x, y, size, flip){
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flip ? -1 : 1, 1);
    ctx.strokeStyle = `rgba(${p.rim},.035)`;
    ctx.lineWidth = 0.7;
    for (let i = 1; i <= 4; i++){
      ctx.beginPath();
      ctx.arc(0, 0, (size / 4) * i, 0.06, 1.51);
      ctx.stroke();
    }
    for (let a = 0.1; a < 1.5; a += 0.34){
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* A plank with an edge to it, brackets under, and a shadow cast by whatever
     stands on it. The contact shadows are what put the bottles on the shelf
     rather than in front of a picture of one. */
  function shelfUnit(p, row, seed, last){
    const y = row.y;
    const t = Math.min(32, Math.max(14, H * 0.038));
    const r = rand('shelf' + seed);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, y, W, H - y); ctx.clip();
    const under = ctx.createLinearGradient(0, y, 0, y + t * 3.4);
    under.addColorStop(0, 'rgba(0,0,0,.66)');
    under.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = under;
    ctx.fillRect(0, y, W, t * 3.4);
    ctx.restore();

    /* brackets, drawn before the plank so the plank sits on them */
    const bn = Math.max(2, Math.round(W / 320));
    for (let i = 0; i <= bn; i++){
      const bx = (W / bn) * i;
      const bwid = t * 0.55, bhgt = t * 2.6;
      ctx.fillStyle = 'rgba(18,11,4,.78)';
      ctx.beginPath();
      ctx.moveTo(bx - bwid, y + t);
      ctx.lineTo(bx + bwid, y + t);
      ctx.lineTo(bx + bwid * 0.5, y + t + bhgt);
      ctx.lineTo(bx - bwid * 0.5, y + t + bhgt);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(${p.rim},.05)`;
      ctx.fillRect(bx - bwid, y + t, bwid * 2, 1);
    }

    /* on the plank, under each bottle */
    (row.spots || []).forEach(([x0, x1]) => {
      const cx = (x0 + x1) / 2, wid = x1 - x0;
      const g = ctx.createRadialGradient(cx, y, 0, cx, y, wid * 0.9);
      g.addColorStop(0, 'rgba(0,0,0,.72)');
      g.addColorStop(0.55, 'rgba(0,0,0,.28)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, y + t * 0.22, wid * 0.85, t * 0.6, 0, 0, 6.283);
      ctx.fill();
    });

    const face = ctx.createLinearGradient(0, y, 0, y + t);
    face.addColorStop(0, p.wood[0]);
    face.addColorStop(0.28, p.wood[1]);
    face.addColorStop(1, p.wood[2]);
    ctx.fillStyle = face;
    ctx.fillRect(0, y, W, t);

    /* the front edge, which is what gives the plank thickness */
    ctx.fillStyle = `rgba(${p.rim},.13)`;
    ctx.fillRect(0, y, W, 1.3);
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ctx.fillRect(0, y + t * 0.62, W, 1);
    ctx.fillStyle = `rgba(${p.rim},.05)`;
    ctx.fillRect(0, y + t * 0.66, W, 1);

    for (let i = 0; i < Math.round(W / 22); i++){
      const gy = y + 2 + r() * (t - 4);
      ctx.strokeStyle = `rgba(18,10,3,${0.09 + r() * 0.24})`;
      ctx.lineWidth = 0.6 + r() * 1.2;
      ctx.beginPath();
      const sx = r() * W, len = W * (0.04 + r() * 0.2);
      ctx.moveTo(sx, gy);
      ctx.bezierCurveTo(sx + len * 0.3, gy + 0.9, sx + len * 0.7, gy - 0.9, sx + len, gy);
      ctx.stroke();
    }
    for (let i = 0; i < Math.round(W / 150) + 2; i++){
      const dx = r() * W, dl = t * (0.5 + r() * 2.6);
      ctx.fillStyle = `rgba(138,90,34,${0.14 + r() * 0.2})`;
      ctx.fillRect(dx, y + t, 1 + r() * 2, dl);
    }
    cobweb(p, 4, y - 3, t * 1.7, false);
    if (seed % 2 === 0) cobweb(p, W - 4, y - 3, t * 1.4, true);

    if (last){
      const below = ctx.createLinearGradient(0, y + t, 0, H);
      below.addColorStop(0, 'rgba(4,3,2,.70)');
      below.addColorStop(0.45, 'rgba(6,4,3,.85)');
      below.addColorStop(1, 'rgba(2,1,1,.93)');
      ctx.fillStyle = below;
      ctx.fillRect(0, y + t, W, H - y - t);
    }
  }

  function blotches(p){
    const r = rand('moss');
    const n = Math.round((W * H) / 17000) + 10;
    for (let i = 0; i < n; i++){
      const x = r() * W, y = r() * H;
      const rad = Math.min(W, H) * (0.02 + r() * 0.075);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const light = r() < 0.42;
      g.addColorStop(0, light ? `rgba(${p.glow},.14)` : 'rgba(3,5,2,.16)');
      g.addColorStop(1, light ? `rgba(${p.glow},0)` : 'rgba(3,5,2,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rad, rad * (0.5 + r() * 0.5), r() * 3.14, 0, 6.283);
      ctx.fill();
    }
  }

  function motes(p){
    const r = rand('motes');
    const n = Math.round(W / 26);
    for (let i = 0; i < n; i++){
      const x = r() * W, y = r() * H * 0.8, rad = 0.6 + r() * 1.6;
      ctx.fillStyle = `rgba(${p.rim},${0.04 + r() * 0.10})`;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, 6.283);
      ctx.fill();
    }
  }

  function vignette(strong){
    const g = ctx.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.24,
                                       W / 2, H * 0.46, Math.max(W, H) * 0.80);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, `rgba(0,0,0,${strong ? .32 : .20})`);
    g.addColorStop(1, `rgba(0,0,0,${strong ? .88 : .66})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function grain(){
    const r = rand('grain');
    const n = Math.round((W * H) / 900);
    ctx.globalAlpha = 0.045;
    for (let i = 0; i < n; i++){
      ctx.fillStyle = r() > 0.5 ? '#fff' : '#000';
      ctx.fillRect(r() * W, r() * H, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  const key = () => `${kind}|${W}|${H}|` +
    rows.map(r => `${r.y}:${(r.spots || []).map(s => s.join('-')).join(',')}`).join('|');

  function render(){
    if (!cv) return;
    const w = Math.round(innerWidth), h = Math.round(innerHeight);
    if (w < 8 || h < 8) return;              /* no viewport yet: wait to be asked again */
    W = w; H = h;
    const k = key();
    if (k === drawn) return;                 /* nothing moved, nothing to redraw */
    drawn = k;

    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);

    const p = kind === 'moss' ? MOSS : CELLAR;
    sky(p);
    if (kind === 'cellar') panelling(p);
    candle(p);
    if (rows.length){
      rows.forEach((row, i) => {
        clutter(p, row.y + 2, i);
        pocket(row);
        shelfUnit(p, row, i, i === rows.length - 1);
      });
      motes(p);
    } else {
      blotches(p);
      motes(p);
    }
    vignette(rows.length > 0);
    grain();
  }

  return {
    mount,
    set kind(k){ if (k !== kind){ kind = k; drawn = ''; render(); } },
    get kind(){ return kind; },
    /* Every row the bottles stand on: { y, top, spots: [[x0,x1], ...] } in
       viewport pixels. Plain numbers are accepted for a bare shelf. */
    setShelf(next){
      rows = (next == null ? [] : [].concat(next))
        .map(r => (typeof r === 'number' ? { y: Math.round(r) } : { ...r, y: Math.round(r.y) }))
        .filter(r => Number.isFinite(r.y))
        .sort((a, b) => a.y - b.y);
      render();
    },
    render
  };
})();
globalThis.Backdrop = Backdrop;
