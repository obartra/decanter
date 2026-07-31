/* Everything that draws bottles and animates a pour. Owns the *view* state,
   which trails the logical state while queued animations catch up. */
const Board = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let root = null, fx = null, fluidOn = false;
  let view = [], selected = null;
  let onTap = () => {};

  const sleep = ms => new Promise(r => setTimeout(r, reduce ? Math.min(ms, 60) : ms));

  /* Drives a frame loop from 0 to 1 over ms, backstopped by a timer.
     requestAnimationFrame stops firing in a hidden tab, so a pour started just
     before the screen locks would otherwise never finish, and the queue waiting
     on it would never drain. Timers still fire when hidden, so one is kept as a
     floor: the animation jumps to its end state rather than hanging. */
  function frames(ms, onFrame){
    return new Promise(res => {
      const t0 = performance.now();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(bail);
        onFrame(1);
        res();
      };
      const bail = setTimeout(finish, ms + 500);
      (function step(now){
        if (done) return;
        const p = Math.min(1, (now - t0) / ms);
        if (p < 1){ onFrame(p); requestAnimationFrame(step); }
        else finish();
      })(t0);
    });
  }
  const el = i => root.querySelector(`.bottle[data-i="${i}"]`);
  const colorVar = c => `var(--c${c})`;

  /* --- layout: pick the row count that divides the bottle count exactly and
     yields the largest bottles for the space available --- */
  function layout(n){
    const W = root.clientWidth || window.innerWidth - 24;
    const H = root.clientHeight || 360;
    let best = null;
    for (let rows = 1; rows <= 4; rows++){
      if (n % rows) continue;
      const cols = n / rows;
      const gx = cols > 6 ? 7 : 11, gy = rows > 2 ? 12 : 20;
      const bw = Math.min((W - (cols - 1) * gx) / cols, ((H - (rows - 1) * gy) / rows) / 3.62, 58);
      if (!best || bw > best.bw) best = { bw, rows, cols, gx, gy };
    }
    if (!best) best = { bw:30, rows:1, cols:n, gx:8, gy:14 };
    document.documentElement.style.setProperty('--bw', Math.max(22, best.bw).toFixed(1) + 'px');
    root.style.setProperty('--cols', best.cols);
    root.style.columnGap = best.gx + 'px';
    root.style.rowGap = best.gy + 'px';
  }
  /* contiguous runs of one color draw as a single band, so no seam shows
     between two units of the same liquid */
  function bandsOf(tube){
    const out = [];
    for (const c of tube){
      const last = out[out.length - 1];
      if (last && last.c === c) last.n++; else out.push({ c, n:1 });
    }
    return out;
  }
  const bandHeight = n => `calc(var(--bh) / var(--units) * ${n})`;

  function render(){
    layout(view.length);
    root.innerHTML = '';
    view.forEach((tube, i) => {
      const b = document.createElement('button');
      b.className = 'bottle';
      b.dataset.i = i;
      b.type = 'button';
      b.setAttribute('aria-label', `Bottle ${i + 1}, ${tube.length} of ${Rules.CAP} full`);
      const full = Rules.isFull(tube);
      if (full) b.classList.add('done');
      if (selected === i) b.classList.add('lifted');
      b.innerHTML = '<div class="collar"></div>';
      const glass = document.createElement('div'); glass.className = 'glass';
      const fill = document.createElement('div'); fill.className = 'fill';
      const bands = bandsOf(tube);
      bands.forEach((bd, idx) => {
        const d = document.createElement('div');
        d.className = 'band' + (idx === bands.length - 1 ? ' crest' : '');
        d.dataset.c = bd.c; d.dataset.n = bd.n;
        d.style.background = colorVar(bd.c);
        d.style.height = bandHeight(bd.n);
        fill.appendChild(d);
      });
      glass.appendChild(fill);
      if (full){ const p = document.createElement('div'); p.className = 'plug'; glass.appendChild(p); }
      const sheen = document.createElement('div'); sheen.className = 'sheen'; glass.appendChild(sheen);
      const gloss = document.createElement('div'); gloss.className = 'gloss'; glass.appendChild(gloss);
      b.appendChild(glass);
      if (full){ const c = document.createElement('div'); c.className = 'corktop'; b.appendChild(c); }
      b.addEventListener('click', () => onTap(i));
      root.appendChild(b);
    });
    root.appendChild(fx);
    fx.setAttribute('width', root.clientWidth);
    fx.setAttribute('height', root.clientHeight);
    /* the glass moved, so the liquid has to be re-measured and re-seeded */
    if (fluidOn) Fluid.sync(view);
  }

  /* --- stream geometry: a tapering ribbon along a quadratic arc --- */
  function qpoint(p0, c, p1, t){
    const m = 1 - t;
    return { x: m*m*p0.x + 2*m*t*c.x + t*t*p1.x, y: m*m*p0.y + 2*m*t*c.y + t*t*p1.y };
  }
  function ribbon(p0, c, p1, w0, w1, t0, t1, off){
    const N = 18, L = [], R = [];
    for (let i = 0; i <= N; i++){
      const u = t0 + (t1 - t0) * (i / N);
      const p = qpoint(p0, c, p1, u);
      const dx = 2*(1-u)*(c.x-p0.x) + 2*u*(p1.x-c.x);
      const dy = 2*(1-u)*(c.y-p0.y) + 2*u*(p1.y-c.y);
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const w = (w0 + (w1 - w0) * u) / 2;
      const o = (off || 0) * w;
      L.push([(p.x + nx*(w+o)).toFixed(1), (p.y + ny*(w+o)).toFixed(1)]);
      R.push([(p.x - nx*(w-o)).toFixed(1), (p.y - ny*(w-o)).toFixed(1)]);
    }
    return 'M' + L.map(p => p.join(' ')).join('L') + 'L' + R.reverse().map(p => p.join(' ')).join('L') + 'Z';
  }

  /* With the particle liquid on, the bottle still tips but the pour itself is
     simulated, so the scripted ribbon and bands sit this one out. */
  async function animateFluid(move){
    const src = el(move.from), dst = el(move.to);
    if (!src || !dst) return;
    const w = src.offsetWidth, h = src.offsetHeight;
    const dir = dst.offsetLeft > src.offsetLeft ? 1 : -1;
    const ang = 72 * dir, rad = ang * Math.PI / 180;
    const lipX = dst.offsetLeft + w/2 - dir * w * 0.82;
    const lipY = dst.offsetTop - w * 0.42;
    const dx = (lipX - (h/2) * Math.sin(rad)) - (src.offsetLeft + w/2);
    const dy = (lipY + (h/2) * Math.cos(rad)) - (src.offsetTop + h/2);

    src.classList.add('pouring');
    src.classList.remove('lifted');
    src.style.transition = 'transform .3s cubic-bezier(.35,.05,.3,1)';
    src.style.transform = `translate(${dx}px, ${dy}px) rotate(${ang}deg)`;
    await sleep(300);
    Audio.pourStart();
    await Fluid.pour(move);
    Audio.pourEnd();
    src.style.transition = 'transform .34s cubic-bezier(.3,.6,.3,1)';
    src.style.transform = '';
    await sleep(reduce ? 60 : 340);
    src.classList.remove('pouring');
    src.style.transition = '';
  }

  async function animate(move){
    if (fluidOn) return animateFluid(move);
    const src = el(move.from), dst = el(move.to);
    if (!src || !dst) return;
    const w = src.offsetWidth, h = src.offsetHeight;
    const glassH = src.querySelector('.glass').offsetHeight;
    const unitH = glassH / Rules.CAP, capH = h - glassH;
    const raw = CONFIG.palette[move.color];
    const dir = dst.offsetLeft > src.offsetLeft ? 1 : -1;
    const ang = 72 * dir, rad = ang * Math.PI / 180;

    /* the lip stops beside the target, not over it, so liquid arcs across */
    const lipX = dst.offsetLeft + w/2 - dir * w * 0.82;
    const lipY = dst.offsetTop - w * 0.42;
    const dx = (lipX - (h/2) * Math.sin(rad)) - (src.offsetLeft + w/2);
    const dy = (lipY + (h/2) * Math.cos(rad)) - (src.offsetTop + h/2);

    src.classList.add('pouring');
    src.classList.remove('lifted');
    src.style.transition = 'transform .22s cubic-bezier(.3,0,.4,1)';
    src.style.transform = `translate(${dx*0.4}px, ${dy-16}px) rotate(${ang*0.22}deg)`;
    await sleep(200);
    src.style.transition = 'transform .3s cubic-bezier(.35,.05,.3,1)';
    src.style.transform = `translate(${dx}px, ${dy}px) rotate(${ang}deg)`;
    await sleep(280);

    const startFill = view[move.to].length;
    const impactX = dst.offsetLeft + w/2;
    const surfaceY = k => dst.offsetTop + capH + glassH - k * unitH;
    const P0 = { x: lipX, y: lipY };
    let P1 = { x: impactX, y: surfaceY(startFill) };
    const ctrl = () => ({ x: P0.x + (P1.x - P0.x) * 0.78, y: P0.y + (P1.y - P0.y) * 0.10 });
    const w0 = w * 0.30, w1 = w * 0.15;

    const body = document.createElementNS(NS, 'path'); body.setAttribute('fill', raw);
    const shine = document.createElementNS(NS, 'path');
    shine.setAttribute('fill', '#fff'); shine.setAttribute('opacity', '.32');
    fx.appendChild(body); fx.appendChild(shine);

    const bead = document.createElement('div');
    bead.className = 'bead';
    bead.style.background = raw;
    bead.style.width = (w*0.30) + 'px'; bead.style.height = (w*0.24) + 'px';
    bead.style.left = (P0.x - w*0.15) + 'px'; bead.style.top = (P0.y - w*0.12) + 'px';
    root.appendChild(bead);

    const pool = document.createElement('div');
    pool.className = 'pool';
    pool.style.background = raw;
    pool.style.width = (w*0.5) + 'px';
    pool.style.left = impactX + 'px';
    root.appendChild(pool);

    let head = 0, tail = 0;
    const paint = () => {
      const c = ctrl();
      body.setAttribute('d', ribbon(P0, c, P1, w0, w1, tail, head, 0));
      shine.setAttribute('d', ribbon(P0, c, P1, w0*0.34, w1*0.3, tail, head, -0.85));
      pool.style.top = (P1.y - 4) + 'px';
      pool.style.opacity = head >= 1 ? '.7' : '0';
    };
    /* the leading edge falls, it does not appear all at once */
    await frames(reduce ? 40 : 190, p => { head = p; paint(); });
    Audio.pourStart();

    const srcBand = src.querySelector('.fill').lastElementChild;
    const srcCount = srcBand ? +srcBand.dataset.n : 0;
    const dstFill = dst.querySelector('.fill');
    let dstBand = dstFill.lastElementChild;
    const merging = dstBand && +dstBand.dataset.c === move.color;
    const dstCount = merging ? +dstBand.dataset.n : 0;
    if (!merging){
      dstBand = document.createElement('div');
      dstBand.className = 'band crest';
      dstBand.dataset.c = move.color;
      dstBand.style.background = colorVar(move.color);
      dstBand.style.height = '0px';
      dstFill.querySelector('.band.crest')?.classList.remove('crest');
      dstFill.appendChild(dstBand);
    }
    const per = reduce ? 40 : 165;
    for (let k = 0; k < move.n; k++){
      await sleep(per);
      if (srcBand) srcBand.style.height = ((srcCount - k - 1) * unitH) + 'px';
      dstBand.style.height = ((dstCount + k + 1) * unitH) + 'px';
      dstBand.dataset.n = dstCount + k + 1;
      P1 = { x: impactX, y: surfaceY(startFill + k + 1) };
      paint();
      const p = (startFill + k + 1) / Rules.CAP;
      Audio.pourAt(p); Audio.glug(p);
      if (!reduce) splash(impactX, P1.y, raw, w);
    }
    /* the tail lets go of the lip and falls away */
    bead.style.transition = 'opacity .18s'; bead.style.opacity = '0';
    await frames(reduce ? 40 : 240, p => { tail = p; paint(); });
    Audio.pourEnd();
    body.remove(); shine.remove(); bead.remove(); pool.remove();
    src.style.transition = 'transform .34s cubic-bezier(.3,.6,.3,1)';
    src.style.transform = '';
    await sleep(reduce ? 60 : 340);
    src.classList.remove('pouring');
    src.style.transition = '';
  }

  function splash(x, y, color, w){
    for (let i = 0; i < 4; i++){
      const d = document.createElement('div');
      d.className = 'drop';
      d.style.background = color;
      const s = 2 + Math.random() * 3;
      d.style.width = s + 'px'; d.style.height = (s * 1.3) + 'px';
      d.style.left = (x - s/2) + 'px'; d.style.top = (y - 4) + 'px';
      root.appendChild(d);
      const ux = (Math.random() - 0.5) * w * 1.1, uy = -(8 + Math.random() * 16);
      d.animate([
        { transform:'translate(0,0)', opacity:0.95 },
        { transform:`translate(${ux*0.55}px,${uy}px)`, opacity:0.9, offset:0.4 },
        { transform:`translate(${ux}px,${6 + Math.random()*8}px)`, opacity:0 }
      ], { duration: 420 + Math.random()*180, easing:'cubic-bezier(.3,.5,.5,1)' })
       .onfinish = () => d.remove();
    }
  }

  function seal(i){
    const b = el(i);
    if (!b) return;
    b.querySelector('.plug')?.classList.add('pop');
    b.querySelector('.corktop')?.classList.add('pop');
    setTimeout(() => {
      Audio.cork();
      b.classList.add('thunk');
      b.querySelector('.sheen')?.classList.add('run');
      const ring = document.createElement('div');
      ring.className = 'ring';
      b.appendChild(ring);
      setTimeout(() => ring.remove(), 700);
      const r = b.getBoundingClientRect();
      Confetti.burst(r.left + r.width/2, r.top + 6, 14,
        [CONFIG.palette[view[i][0]], '#F7DEB4', '#D8A76D', '#FFFFFF'], 95);
      setTimeout(() => b.classList.remove('thunk'), 520);
    }, reduce ? 40 : 330);
  }

  function nudge(i){
    const b = el(i);
    if (!b) return;
    b.animate([{ transform:'translateX(0)' }, { transform:'translateX(-5px)' },
               { transform:'translateX(5px)' }, { transform:'translateX(0)' }],
              { duration:220, easing:'ease-in-out' });
  }
  return {
    mount(node){
      root = node;
      fx = document.createElementNS(NS, 'svg');
      fx.setAttribute('class', 'fx');
      fluidOn = Fluid.supported();
      if (fluidOn){ Fluid.mount(root); root.classList.add('simulated'); }
    },
    get fluid(){ return fluidOn; },
    get view(){ return view; },
    set view(v){ view = v; },
    get selected(){ return selected; },
    set selected(v){ selected = v; },
    set onTap(fn){ onTap = fn; },
    el, render, animate, seal, nudge, reduce
  };
})();
globalThis.Board = Board;
