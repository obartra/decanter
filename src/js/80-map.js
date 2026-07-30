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
  let scroll = null, canvas = null, svg = null, onPick = () => {};
  let lastFocus = 1;

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
    svg.innerHTML = `
      <defs>
        <linearGradient id="pathFade" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#9FA8D4" stop-opacity=".55"/>
          <stop offset="${(count / (count + 3)).toFixed(2)}" stop-color="#9FA8D4" stop-opacity=".28"/>
          <stop offset="1" stop-color="#9FA8D4" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${MapGeom.pathThrough(pts, H)}" fill="none" stroke="url(#pathFade)"
            stroke-width="6" stroke-linecap="round" stroke-dasharray="2 14"/>`;

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
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'mapPath');
      canvas.appendChild(svg);
    },
    set onPick(fn){ onPick = fn; },
    render, scrollToCurrent
  };
})();
globalThis.MapView = MapView;
