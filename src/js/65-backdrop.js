/* The room, drawn rather than photographed.

   The painted backdrops this replaces were a fixed size, so their shelf line
   landed wherever the viewport put it and the bottles stood in front of it
   rather than on it. Here the shelf is told where the bottles are and drawn
   underneath them, so it is aligned at every size by construction.

   Colours are sampled from the reference art: near black at the top, warm brown
   through the middle, a glow at the base, candlelight at #D59738. The moss field
   behind the map comes from the same source, greens from #151A0B to #868552.

   Everything is seeded, so the room is the same room on every visit, and it is
   redrawn only when the size or the shelf changes. */
const Backdrop = (() => {
  const CELLAR = {
    sky: ['#040507', '#0B0805', '#150F08', '#1E1509', '#0A0704'],
    glow: '213,151,56',
    silhouette: '#0E0A05',
    rim: '255,214,150'
  };
  const MOSS = {
    sky: ['#0A0E06', '#141A0A', '#252D14', '#31391B', '#10150A'],
    glow: '134,133,82',
    silhouette: '#10160A',
    rim: '200,214,150'
  };

  let cv = null, ctx = null, W = 0, H = 0, dpr = 1;
  let kind = 'cellar', shelves = [], drawn = '';

  function mount(){
    if (cv) return;
    cv = document.createElement('canvas');
    cv.className = 'backdrop';
    ctx = cv.getContext('2d');
    document.body.insertBefore(cv, document.body.firstChild);
    /* The room has to follow the window. Without this it drew once at whatever
       size the page happened to be during boot, which on a first paint can be
       nothing at all, and then never again: the whole reason for drawing the
       room instead of loading it is that it fits the viewport it is in. */
    addEventListener('resize', render);
    addEventListener('orientationchange', render);
  }

  const rand = seed => RNG.mulberry32(RNG.hashSeed(seed));

  function sky(p){
    const g = ctx.createLinearGradient(0, 0, 0, H);
    p.sky.forEach((c, i) => g.addColorStop(i / (p.sky.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* a candle somewhere off to one side, which is what makes the room warm */
  function candle(p){
    const g = ctx.createRadialGradient(W * 0.32, H * 0.34, 0, W * 0.32, H * 0.34, Math.max(W, H) * 0.55);
    g.addColorStop(0, `rgba(${p.glow},.13)`);
    g.addColorStop(0.4, `rgba(${p.glow},.045)`);
    g.addColorStop(1, `rgba(${p.glow},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* dark vessels standing behind, suggested rather than drawn */
  function clutter(p, baseY, seed){
    const r = rand('clutter' + (seed || 0));
    const n = Math.round(W / 76) + 5;
    for (let i = 0; i < n; i++){
      const squat = r() < 0.4;
      const bw = W * (squat ? 0.035 + r() * 0.045 : 0.022 + r() * 0.03);
      const bh = bw * (squat ? 1.0 + r() * 0.7 : 2.2 + r() * 2.4);
      const x = r() * (W + bw) - bw / 2;
      const y = baseY - bh;
      const neck = bw * (0.2 + r() * 0.18);
      /* they sit behind, so they are barely there: shapes in the dark rather
         than objects competing with the bottles being played */
      ctx.globalAlpha = 0.30 + r() * 0.26;
      ctx.fillStyle = p.silhouette;
      ctx.beginPath();
      const rad = squat ? bw * 0.46 : bw * 0.32;
      if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, [rad, rad, bw * 0.16, bw * 0.16]);
      else ctx.rect(x, y, bw, bh);
      ctx.fill();
      ctx.fillRect(x + (bw - neck) / 2, y - bh * 0.14, neck, bh * 0.16);
      ctx.globalAlpha = 0.05 + r() * 0.06;
      ctx.fillStyle = `rgb(${p.rim})`;
      ctx.fillRect(x + bw * 0.14, y + bh * 0.14, Math.max(1, bw * 0.04), bh * 0.7);
      ctx.globalAlpha = 1;
    }
  }

  /* The shelf sits exactly where the bottles stand, because it is told where
     that is. This is the whole reason the art is drawn and not loaded. */
  function shelf(p, y, seed, last){
    const t = Math.min(30, Math.max(13, H * 0.035));
    const r = rand('shelf' + seed);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, y, W, H - y); ctx.clip();
    const under = ctx.createLinearGradient(0, y, 0, y + t * 3.2);
    under.addColorStop(0, 'rgba(0,0,0,.62)');
    under.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = under;
    ctx.fillRect(0, y, W, t * 3.2);
    ctx.restore();

    const face = ctx.createLinearGradient(0, y, 0, y + t);
    face.addColorStop(0, '#7A4E1C');
    face.addColorStop(0.35, '#5A3612');
    face.addColorStop(1, '#2E1C0A');
    ctx.fillStyle = face;
    ctx.fillRect(0, y, W, t);

    /* grain, and the odd wet streak running off the edge */
    for (let i = 0; i < Math.round(W / 26); i++){
      const gy = y + 2 + r() * (t - 4);
      ctx.strokeStyle = `rgba(20,11,4,${0.10 + r() * 0.26})`;
      ctx.lineWidth = 0.6 + r() * 1.1;
      ctx.beginPath();
      const sx = r() * W, len = W * (0.05 + r() * 0.22);
      ctx.moveTo(sx, gy);
      ctx.bezierCurveTo(sx + len * 0.3, gy + 0.8, sx + len * 0.7, gy - 0.8, sx + len, gy);
      ctx.stroke();
    }
    for (let i = 0; i < Math.round(W / 130) + 2; i++){
      const dx = r() * W, dl = t * (0.6 + r() * 2.4);
      ctx.fillStyle = `rgba(122,78,28,${0.18 + r() * 0.22})`;
      ctx.fillRect(dx, y + t, 1 + r() * 2, dl);
    }
    ctx.fillStyle = `rgba(${p.rim},.16)`;
    ctx.fillRect(0, y, W, 1.2);

    /* only under the lowest shelf is there cabinet rather than more room */
    if (last){
      const below = ctx.createLinearGradient(0, y + t, 0, H);
      below.addColorStop(0, 'rgba(4,3,2,.70)');
      below.addColorStop(0.45, 'rgba(6,4,3,.85)');
      below.addColorStop(1, 'rgba(2,1,1,.93)');
      ctx.fillStyle = below;
      ctx.fillRect(0, y + t, W, H - y - t);
    }
  }

  /* clumps of undergrowth, so the moss is a place rather than a colour */
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

  function vignette(strong){
    const g = ctx.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.24,
                                       W / 2, H * 0.46, Math.max(W, H) * 0.80);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, `rgba(0,0,0,${strong ? .34 : .20})`);
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

  function render(){
    if (!cv) return;
    const w = Math.round(innerWidth), h = Math.round(innerHeight);
    const key = `${kind}|${w}|${h}|${shelves.join(',')}`;
    if (key === drawn) return;          /* nothing moved, nothing to redraw */
    if (w < 8 || h < 8) return;         /* no viewport yet: wait to be asked again */
    drawn = key;

    W = w; H = h;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);

    const p = kind === 'moss' ? MOSS : CELLAR;
    sky(p);
    candle(p);
    if (shelves.length){
      /* a plank under every row, so no bottle is left standing on nothing */
      shelves.forEach((y, i) => {
        clutter(p, y + 2, i);
        shelf(p, y, i, i === shelves.length - 1);
      });
    } else {
      blotches(p);
    }
    vignette(shelves.length > 0);
    grain();
  }

  return {
    mount,
    set kind(k){ if (k !== kind){ kind = k; render(); } },
    get kind(){ return kind; },
    /* the viewport y of every row the bottles stand on, or nothing for a room
       with no shelving at all */
    setShelf(ys){
      const next = (ys == null ? [] : [].concat(ys))
        .map(Math.round).filter(Number.isFinite).sort((a, b) => a - b);
      if (next.join() !== shelves.join()){ shelves = next; render(); }
    },
    render
  };
})();
globalThis.Backdrop = Backdrop;
