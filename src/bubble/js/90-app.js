/* The loop, the input, and the turn.

   The state machine is deliberately small: aiming, flying, settling. The board
   reaches its final state the instant a shot resolves, before anything is
   animated, and the animation is handed lists of what popped and what fell. So
   a slow frame, a backgrounded tab or a long pop cannot leave the board and the
   screen disagreeing about what is on it. */
const BubbleApp = (() => {
  const C = BubbleConfig;
  const G = BubbleGrid;
  const R = BubbleRules;
  const S = BubbleShot;
  const V = BubbleView;
  const D = BubbleRender;

  const S_AIM = 'aim', S_FLY = 'fly';

  const st = {
    board: null,
    mode: S_AIM,
    aim: { x: 0, y: -1 },
    pointing: false,
    path: null,          /* the resolved shot, decided at launch and never revised */
    flown: 0,            /* distance travelled along it */
    loaded: 0,           /* the colour in hand */
    next: 0,
    pops: [],            /* what is popping, with the time each started */
    drops: [],           /* what is falling, in world units, with velocity */
    shots: 0,
    seed: 1
  };

  const rand = (() => {
    let s = 1;
    return { seed(n){ s = n >>> 0 || 1; }, next(){
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    } };
  })();

  function deal(){
    const live = R.liveColours(st.board);
    if (!live.length) return 0;
    return live[Math.floor(rand.next() * live.length) % live.length];
  }

  function newBoard(seed){
    rand.seed(seed);
    st.seed = seed;
    const b = G.create(0);
    for (let j = 0; j < 5; j++){
      for (let c = 0; c < C.COLS; c++){
        b.rows[j][c] = Math.floor(rand.next() * C.COLOURS);
      }
    }
    st.board = b;
    /* nothing should be loose on a board nobody has shot at yet */
    R.remove(b, R.detach(b));
    st.loaded = deal();
    st.next = deal();
    st.mode = S_AIM;
    st.path = null;
    st.pops = [];
    st.drops = [];
    st.shots = 0;
  }

  /* ---- input. Aiming is never locked, even mid flight, so the guide always
     answers the pointer and the game never feels like it is ignoring you. ---- */
  function point(e){
    const p = V.screenToWorld(e.clientX, e.clientY);
    st.aim = S.aimFrom(C.MUZZLE, p);
  }

  function fire(){
    if (st.mode !== S_AIM) return;
    const shot = S.resolveShot(st.board, C.MUZZLE, st.aim);
    st.path = shot;
    st.flown = 0;
    st.mode = S_FLY;
  }

  /* ---- the turn, once the bubble has arrived ---- */
  function land(){
    const shot = st.path;
    if (shot.landing){
      const res = R.resolveTurn(st.board, shot.landing, st.loaded);
      const now = performance.now();
      st.pops = res.popped.map(([j, c, was], i) => ({ cell: [j, c], at: now + i * 25,
        colour: C.PALETTE[was % C.PALETTE.length] }));
      st.drops = res.dropped.map(([j, c, was]) => {
        const p = G.centreOf(st.board, j, c);
        return { x: p.x, y: p.y, vx: (rand.next() - 0.5) * 1.5, vy: -1 - rand.next(),
                 colour: C.PALETTE[was % C.PALETTE.length] };
      });
      if (res.won) newBoard(st.seed + 1);
    }
    st.shots++;
    st.path = null;
    st.mode = S_AIM;
    st.loaded = st.next;
    st.next = deal();
    /* a board with nothing left on it has no colour to deal, so start another */
    if (!R.liveColours(st.board).length) newBoard(st.seed + 1);
  }

  function step(dt){
    if (st.mode === S_FLY){
      st.flown += C.SPEED * dt;
      if (arrived()) land();
    }
    const now = performance.now();
    st.pops = st.pops.filter(p => now - p.at < 160);
    for (const d of st.drops){
      d.vy += 55 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    st.drops = st.drops.filter(d => d.y < C.WORLD_H + 2);
  }

  /* how far along the resolved path the bubble has flown */
  function pointAt(dist){
    const pts = st.path.points;
    let left = dist;
    for (let i = 1; i < pts.length; i++){
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (left <= len){
        const t = len ? left / len : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      left -= len;
    }
    return pts[pts.length - 1];
  }

  function totalLen(){
    const pts = st.path.points;
    let n = 0;
    for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return n;
  }

  const arrived = () => st.flown >= totalLen();

  function draw(now){
    const ctx = V.frame();
    D.walls(ctx);
    D.board(ctx, st.board);

    for (const d of st.drops) D.bubble(ctx, d.x, d.y, d.colour, C.DRAW_R, 0.9);

    for (const p of st.pops){
      const t = Math.max(0, Math.min(1, (now - p.at) / 110));
      if (now < p.at) continue;
      const q = G.centreOf(st.board, p.cell[0], p.cell[1]);
      D.bubble(ctx, q.x, q.y, p.colour, C.DRAW_R * (1 + 0.35 * t), 1 - t);
    }

    if (st.mode === S_AIM){
      const preview = S.resolveShot(st.board, C.MUZZLE, st.aim);
      D.guide(ctx, preview.points, C.PALETTE[st.loaded % C.PALETTE.length], (now / 100) % C.GUIDE_DOT_GAP);
      D.muzzle(ctx, st.aim);
      D.bubble(ctx, C.MUZZLE.x, C.MUZZLE.y, C.PALETTE[st.loaded % C.PALETTE.length]);
    } else {
      D.muzzle(ctx, null);
      const p = pointAt(st.flown);
      D.bubble(ctx, p.x, p.y, C.PALETTE[st.loaded % C.PALETTE.length]);
    }
    /* what is coming, tucked beside the muzzle */
    D.bubble(ctx, C.MUZZLE.x + 1.9, C.MUZZLE.y + 0.35,
      C.PALETTE[st.next % C.PALETTE.length], C.DRAW_R * 0.62, 0.75);
  }

  function boot(){
    const cv = document.getElementById('bubbleCanvas');
    V.mount(cv);
    newBoard(1);

    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      st.pointing = true;
      point(e);
    });
    cv.addEventListener('pointermove', e => { if (st.pointing) point(e); });
    cv.addEventListener('pointerup', e => {
      if (!st.pointing) return;
      st.pointing = false;
      point(e);
      fire();
    });
    addEventListener('resize', () => V.resize());

    document.getElementById('bubbleAgain').onclick = () => newBoard(st.seed + 1);

    let last = performance.now();
    const loop = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  return { boot, _state: st, newBoard, fire, step, land };
})();
globalThis.BubbleApp = BubbleApp;

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', BubbleApp.boot);
else BubbleApp.boot();
