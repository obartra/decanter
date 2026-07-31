/* The journey map. Pure geometry lives in MapGeom so it can be tested without
   a browser; MapView only turns those numbers into elements. */
const MapGeom = (() => {
  /* Levels climb from the bottom. x follows a slow sine so the path winds
     without ever leaving the column. */
  const STEP = 0.72;
  function nodes(count, width, opts){
    const o = Object.assign({ spacing:96, margin:52, bottom:90 }, opts || {});
    const amp = Math.max(0, Math.min(width * 0.30, width / 2 - o.margin));
    const cx = width / 2;
    const out = [];
    for (let i = 0; i < count; i++){
      out.push({ level: i + 1, x: cx + Math.sin(i * STEP) * amp, y: o.bottom + i * o.spacing });
    }
    return out;
  }
  const height = (count, opts) => {
    const o = Object.assign({ spacing:96, bottom:90, top:140 }, opts || {});
    return o.bottom + Math.max(0, count - 1) * o.spacing + o.top;
  };
  /* Catmull-Rom through the node centres, converted to cubic beziers */
  function pathThrough(points, flipY){
    if (points.length < 2) return '';
    const P = points.map(p => ({ x: p.x, y: flipY ? flipY - p.y : p.y }));
    let d = `M ${P[0].x.toFixed(1)} ${P[0].y.toFixed(1)}`;
    for (let i = 0; i < P.length - 1; i++){
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || P[i + 1];
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }
  /* what the player is allowed to see: everything cleared, the frontier, and a
     short glimpse of what is coming */
  const visibleCount = (unlocked, lookahead) => unlocked + (lookahead == null ? CONFIG.lookahead : lookahead);
  return { nodes, height, pathThrough, visibleCount, STEP };
})();
globalThis.MapGeom = MapGeom;

const MapView = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  let scroll = null, canvas = null, svg = null, road = null, onPick = () => {};
  let lastFocus = 1;

  /* The road, laid stone by stone along the very spline the nodes sit on. It is
     sampled from the path itself rather than recomputed, so it cannot drift off
     the medallions, and it is drawn to a canvas inside the scrolling map so it
     travels with them. Strokes alone read as a ribbon; cobbles read as a road. */
  function drawRoad(d, width, H, spacing){
    if (!road) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    road.width = Math.ceil(width * dpr); road.height = Math.ceil(H * dpr);
    road.style.width = width + 'px'; road.style.height = H + 'px';
    const g = road.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.scale(dpr, dpr);
    g.clearRect(0, 0, width, H);

    const shape = new Path2D(d);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#090C05'; g.lineWidth = 60; g.globalAlpha = .75; g.stroke(shape);
    g.strokeStyle = '#1A1F0E'; g.lineWidth = 50; g.globalAlpha = .9;  g.stroke(shape);
    g.strokeStyle = '#2C3018'; g.lineWidth = 43; g.globalAlpha = 1;   g.stroke(shape);

    /* a path element is the only honest way to walk a curve, so borrow one */
    const probe = document.createElementNS(NS, 'path');
    probe.setAttribute('d', d);
    probe.setAttribute('fill', 'none');
    svg.appendChild(probe);
    let len = 0;
    try { len = probe.getTotalLength(); } catch (e) { len = 0; }
    if (!len){ probe.remove(); return; }

    const r = RNG.mulberry32(RNG.hashSeed('road'));
    /* Fade out along the last stretch of the path, not at a fixed height: the
       map scrolls, so an absolute cutoff sits off screen and the road just stops
       dead wherever the ghost points ran out. */
    const FADE_FROM = 0.72;
    const step = 11;
    let row = 0;
    for (let t = 4; t < len; t += step, row++){
      const a = probe.getPointAtLength(t);
      const b = probe.getPointAtLength(Math.min(len, t + 2));
      const tx = b.x - a.x, ty = b.y - a.y;
      const L = Math.hypot(tx, ty) || 1;
      const nx = -ty / L, ny = tx / L;
      const ang = Math.atan2(ty, tx);
      const prog = t / len;
      const fade = prog < FADE_FROM ? 1 : Math.max(0, 1 - (prog - FADE_FROM) / (1 - FADE_FROM));
      if (fade <= 0.02) continue;

      const cols = 4;
      for (let c = 0; c < cols; c++){
        const jitter = (r() - 0.5) * 3.4;
        const off = ((c + 0.5) / cols - 0.5) * 38 + (row % 2 ? 4.4 : -4.4) + jitter;
        const x = a.x + nx * off, y = a.y + ny * off;
        const w = 9 + r() * 4.5, h = 7.5 + r() * 3;
        const lum = 26 + r() * 18;
        g.save();
        g.translate(x, y);
        g.rotate(ang + (r() - 0.5) * 0.35);
        g.globalAlpha = fade * (0.82 + r() * 0.18);
        g.fillStyle = `hsl(${58 + r() * 26},${9 + r() * 12}%,${lum}%)`;
        g.beginPath();
        if (g.roundRect) g.roundRect(-w / 2, -h / 2, w, h, 2.6 + r() * 1.6);
        else g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        g.globalAlpha = fade * 0.16;                 /* a lit top edge on each */
        g.fillStyle = '#F2E8C8';
        g.fillRect(-w / 2 + 1, -h / 2, w - 2, 1.1);
        g.globalAlpha = fade * 0.22;                 /* and a seam under it */
        g.fillStyle = '#05070 3'.replace(' ', '');
        g.fillRect(-w / 2, h / 2 - 1, w, 1.1);
        g.restore();
      }

      /* moss creeping in from the verges, and the odd loose pebble */
      if (row % 3 === 0){
        for (const side of [-1, 1]){
          const off = side * (20 + r() * 7);
          const x = a.x + nx * off, y = a.y + ny * off;
          g.globalAlpha = fade * (0.22 + r() * 0.3);
          g.fillStyle = `hsl(${72 + r() * 24},${18 + r() * 16}%,${11 + r() * 9}%)`;
          g.beginPath();
          g.ellipse(x, y, 5 + r() * 7, 3 + r() * 4, r() * 3.14, 0, 6.283);
          g.fill();
        }
      }
      if (r() < 0.16){
        const off = (r() - 0.5) * 54;
        g.globalAlpha = fade * 0.5;
        g.fillStyle = `hsl(64,10%,${30 + r() * 14}%)`;
        g.beginPath();
        g.ellipse(a.x + nx * off, a.y + ny * off, 1.6 + r() * 2, 1.2 + r() * 1.6, 0, 0, 6.283);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    probe.remove();

    /* Erase the far end so the bed goes with its stones. Fading the stones alone
       left the earth under them ending in a hard cap, which read as the road
       having been cut off rather than running out of sight. */
    g.globalCompositeOperation = 'destination-out';
    const out = g.createLinearGradient(0, 0, 0, H * 0.34);
    out.addColorStop(0, 'rgba(0,0,0,1)');
    out.addColorStop(0.55, 'rgba(0,0,0,.55)');
    out.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = out;
    g.fillRect(0, 0, width, H * 0.34);
    g.globalCompositeOperation = 'source-over';
  }

  function starRow(n){
    return `<span class="ns">${[0,1,2].map(i => i < n ? '★' : '<i>★</i>').join('')}</span>`;
  }
  function render(progress){
    const unlocked = progress.unlocked;
    const count = MapGeom.visibleCount(unlocked);
    const width = scroll.clientWidth || 360;
    const opts = { spacing: Math.min(104, Math.max(80, scroll.clientHeight / 5.4)) };
    const pts = MapGeom.nodes(count + 3, width, opts);   // 3 ghost points continue the path
    const H = MapGeom.height(count + 3, opts);
    canvas.style.height = H + 'px';

    svg.setAttribute('width', width);
    svg.setAttribute('height', H);
    /* A road, laid along the very spline the nodes sit on, so it cannot drift
       off them the way a painted one did. Built up in strokes: a bed of earth,
       the stone surface, a lit crown, then dashes across it for cobbles. */
    const d = MapGeom.pathThrough(pts, H);
    const fade = `${(count / (count + 3)).toFixed(2)}`;
    svg.innerHTML = `
      <defs>
        <linearGradient id="pathFade" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#E0B15C" stop-opacity=".55"/>
          <stop offset="${fade}" stop-color="#E0B15C" stop-opacity=".28"/>
          <stop offset="1" stop-color="#E0B15C" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${d}" fill="none" stroke="url(#pathFade)"
            stroke-width="5" stroke-linecap="round" stroke-dasharray="2 14"/>`;

    drawRoad(d, width, H, opts.spacing);

    canvas.querySelectorAll('.node,.chapter').forEach(n => n.remove());

    for (let i = 0; i < count; i++){
      const p = pts[i], level = p.level;
      if (Levels.isSectionStart(level)){
        const tag = document.createElement('div');
        tag.className = 'chapter';
        tag.style.bottom = (p.y + 46) + 'px';
        tag.style.setProperty('--tint', Levels.sectionTint(level));
        tag.innerHTML = `<span>${Levels.sectionName(level)}</span>`;
        canvas.appendChild(tag);
      }
      const stars = progress.starsFor(level);
      const cleared = stars > 0;
      const current = level === unlocked;
      const locked = level > unlocked;

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'node' + (cleared ? ' cleared' : '') + (current ? ' current' : '') + (locked ? ' locked' : '');
      b.style.left = p.x + 'px';
      b.style.bottom = p.y + 'px';
      b.style.setProperty('--tint', Levels.sectionTint(level));
      b.dataset.level = level;
      b.disabled = locked;
      b.setAttribute('aria-label', locked
        ? `Level ${level}, locked`
        : `Level ${level}${cleared ? `, ${stars} of 3 stars` : ''}`);
      b.innerHTML = locked
        ? '<span class="num">🔒</span>'
        : `<span class="num">${level}</span>${cleared ? starRow(stars) : ''}`;
      if (!locked) b.addEventListener('click', () => onPick(level));
      canvas.appendChild(b);
    }
    document.getElementById('mapStars').textContent = progress.totalStars();
    document.getElementById('mapChapter').textContent = Levels.sectionName(unlocked);
    lastFocus = unlocked;
  }
  function scrollToCurrent(smooth){
    const node = canvas.querySelector(`.node[data-level="${lastFocus}"]`);
    if (!node) return;
    const target = node.offsetTop - scroll.clientHeight * 0.58 + node.offsetHeight;
    scroll.scrollTo({ top: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
  }
  return {
    mount(scrollEl){
      scroll = scrollEl;
      canvas = scrollEl.querySelector('.mapCanvas');
      road = document.createElement('canvas');
      road.className = 'mapRoad';
      canvas.appendChild(road);
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'mapPath');
      canvas.appendChild(svg);
    },
    set onPick(fn){ onPick = fn; },
    render, scrollToCurrent
  };
})();
globalThis.MapView = MapView;
