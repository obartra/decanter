/* The loop, the input, and the turn.

   The state machine is deliberately small: aiming, flying, settling. The board
   reaches its final state the instant a shot resolves, before anything is
   animated, and the animation is handed the lists of what came off it. So a
   slow frame, a backgrounded tab or a long fall cannot leave the board and the
   screen disagreeing about what is on it. */
const BubbleApp = (() => {
  const C = BubbleConfig;
  const G = BubbleGrid;
  const R = BubbleRules;
  const S = BubbleShot;
  const V = BubbleView;
  const D = BubbleRender;
  const A = BubbleAudio;
  const Adv = BubbleAdvice;
  const Sc = BubbleScore;

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
    drops: [],           /* what is falling, in world units, with velocity */
    shots: 0,
    sinceDrop: 0,        /* shots since the board last came down */
    score: 0,
    /* Whether this run leaned on something that made the board easier than the
       thresholds it is graded against. Only picking a colour sets it; see
       AID_CAP in the config for why undo, hint and swap do not. */
    aided: false,
    hint: null,          /* the landing the hint is pointing at, until the next shot */
    collapsing: false,   /* the lost board is on its way down, panel waiting on it */
    past: [],            /* what undo restores, newest last */
    /* null while the game is live, then 'won' or 'lost'. The board is frozen
       either way: a run that has ended stops taking shots rather than letting
       the player fire into a result. */
    over: null,
    seed: 1
  };

  /* Two streams, not one.

     There was one, and it fed the board, the bubble sequence, the incoming rows
     and the little random velocities the falling bubbles are thrown with. That
     last one is the problem: how many bubbles fell decided how far the stream
     advanced, so a cosmetic detail changed which colour was dealt next. Two runs
     from the same seed diverged the moment their clears differed, undo could not
     put the sequence back, and the difficulty harness was measuring a game
     nobody could reproduce.

     So `game` decides everything the player is graded on and nothing else draws
     from it, and `fx` throws the debris around. */
  const rand = BubbleRng.stream();
  const fx = BubbleRng.stream();

  function deal(){
    const live = R.liveColours(st.board);
    if (!live.length) return 0;
    return live[Math.floor(rand.next() * live.length) % live.length];
  }

  function newBoard(seed){
    rand.seed(seed);
    fx.seed(seed * 7919 + 1);
    st.seed = seed;
    st.board = R.dealBoard(5, rand.next);
    st.loaded = deal();
    st.next = deal();
    st.mode = S_AIM;
    st.path = null;
    st.drops = [];
    st.shots = 0;
    st.sinceDrop = 0;
    st.score = 0;
    st.aided = false;
    st.hint = null;
    st.collapsing = false;
    st.past = [];
    st.over = null;
    show(null);
    paintHud();
    /* the rules, on a board nobody has shot at yet. It goes away on the first
       shot and stays away, because it is an explanation and not a status. */
    const rule = document.getElementById('bubbleRule');
    if (rule) rule.classList.remove('gone');
  }

  /* ---- taking it back ----

     Everything the turn will change, including where the sequence had got to.
     Without that last part undo puts the board back and then deals a different
     bubble, which is not the same position and is worse than no undo at all. */
  function remember(){
    st.past.push({
      rows: st.board.rows.map(r => r.slice()),
      parity: st.board.parity,
      loaded: st.loaded, next: st.next,
      shots: st.shots, sinceDrop: st.sinceDrop, score: st.score,
      rand: rand.state
    });
    if (st.past.length > C.UNDO_DEPTH) st.past.shift();
  }

  function undo(){
    if (st.mode !== S_AIM || !st.past.length) return false;
    if (!allow.undo || !afford('undo')) return false;
    const was = st.past.pop();
    st.board.rows = was.rows.map(r => r.slice());
    st.board.parity = was.parity;
    st.loaded = was.loaded;
    st.next = was.next;
    st.shots = was.shots;
    st.sinceDrop = was.sinceDrop;
    st.score = was.score;
    rand.state = was.rand;
    /* A run that was over is not over any more, which is the whole point of
       being able to take back the shot that ended it. */
    st.over = null;
    st.hint = null;
    st.collapsing = false;
    st.drops = [];
    show(null);
    paintHud();
    A.stick();
    return true;
  }

  /* ---- the three that leave the run gradeable ---- */

  /* Swap what is loaded for what is next. Changes the order of two bubbles the
     player was going to be handed anyway, so the board it produces is one the
     sequence could have produced on its own. */
  function swap(){
    if (st.mode !== S_AIM || st.over || !allow.swap) return false;
    const was = st.loaded;
    st.loaded = st.next;
    st.next = was;
    st.hint = null;
    A.shoot();
    paintHud();
    return true;
  }

  /* Point at the shot the game would take. Withheld when nothing clears, because
     a hint that names a bubble which merely lands somewhere is not advice. */
  function hint(){
    if (st.mode !== S_AIM || st.over || !allow.hint) return null;
    const best = Adv.bestShot(st.board, st.loaded, S.resolveShot);
    /* asked for before it is paid for, so a hint that has nothing to say is
       never charged for */
    if (!best || !best.matched) return null;
    if (!afford('hint')) return null;
    st.hint = best.landing;
    A.stick();
    paintHud();
    return best;
  }

  /* ---- and the one that does not ----

     Choosing the colour outright is the extra bottle of this game: from here the
     board is easier than the thresholds the run is graded against, so the run is
     capped exactly the way a bought vessel caps one. */
  function pickColour(colour){
    if (st.mode !== S_AIM || st.over || !allow.colour) return false;
    const live = R.liveColours(st.board);
    if (!live.includes(colour)) return false;
    if (!afford('colour')) return false;
    st.loaded = colour;
    st.aided = true;
    st.hint = null;
    paintHud();
    A.matched(3);
    return true;
  }

  /* ---- input. Aiming is never locked, even mid flight, so the guide always
     answers the pointer and the game never feels like it is ignoring you. ---- */
  function point(e){
    const p = V.screenToWorld(e.clientX, e.clientY);
    st.aim = S.aimFrom(C.MUZZLE, p);
  }

  function fire(){
    if (st.mode !== S_AIM || st.over) return;
    /* before anything moves, so undo has the position as it was asked */
    remember();
    const shot = S.resolveShot(st.board, C.MUZZLE, st.aim);
    st.path = shot;
    st.flown = 0;
    st.mode = S_FLY;
    st.hint = null;
    A.shoot();
    paintHud();
    const rule = document.getElementById('bubbleRule');
    if (rule) rule.classList.add('gone');
  }

  /* ---- the turn, once the bubble has arrived ---- */
  function land(){
    const shot = st.path;
    st.path = null;
    st.mode = S_AIM;
    st.shots++;

    if (shot.landing){
      const res = R.resolveTurn(st.board, shot.landing, st.loaded);
      /* Nothing is deleted where it sat. The group you matched is knocked off
         the board and falls, and so does everything it was holding up, because
         a clear the player watches come down is worth more than a gap that
         appears. The two are thrown differently on purpose: the matched group
         is kicked outward from the bubble that landed, so the burst reads as
         the shot doing it, while what was cut free was hit by nothing and
         simply lets go. */
      const hit = G.centreOf(st.board, shot.landing.j, shot.landing.c);
      /* Thrown from `fx`, never from the game stream. How many bubbles fell must
         not decide which colour comes next. */
      st.drops = res.matched.map(([j, c, was]) => {
        const p = G.centreOf(st.board, j, c);
        const dx = p.x - hit.x, dy = p.y - hit.y;
        const away = Math.hypot(dx, dy) || 1;
        return falling(p, was,
          (dx / away) * C.KICK_OUT + (fx.next() - 0.5),
          (dy / away) * C.KICK_OUT - C.KICK_UP - fx.next());
      }).concat(res.cut.map(([j, c, was]) =>
        falling(G.centreOf(st.board, j, c), was,
          (fx.next() - 0.5) * C.CUT_DRIFT, -1 - fx.next())));

      st.score += res.matched.length * C.SCORE_MATCH + res.cut.length * C.SCORE_CUT;
      if (res.matched.length) A.matched(res.matched.length); else A.stick();
      if (res.cut.length) A.cut(res.cut.length);
      paintHud();
      if (res.won) return finish('won');
      if (res.lost) return finish('lost');
    }

    /* The board comes down on a cadence, which is the only thing that makes the
       death line mean anything. Without it the line is decoration: a player can
       take as long as they like and only reach it through their own bad shots.

       Counted against a running total rather than with a modulo, because the
       cadence tightens as the run goes on: `shots % cadence` against a shrinking
       cadence skips drops and doubles others at every change. */
    if (++st.sinceDrop >= Sc.cadenceAt(st.shots)){
      st.sinceDrop = 0;
      G.advance(st.board, R.freshRow(st.board, rand.next));
      R.remove(st.board, R.detach(st.board));
      A.advance();
      if (R.isLost(st.board)) return finish('lost');
    }

    st.loaded = st.next;
    st.next = deal();
    paintHud();

    if (!R.liveColours(st.board).length) return finish('won');
    /* A board can pack itself so that every contact has its neighbours full and
       no shot can land anywhere. Without noticing, the player fires into a board
       that silently eats every bubble and nothing happens again, forever. */
    if (!canPlay()) return finish('lost');
  }

  const canPlay = () => R.anyLanding(st.board,
    (b, dir) => S.resolveShot(b, C.MUZZLE, dir).landing);

  /* ---- the tool row ----

     Every button reports whether it did anything, and the row is repainted from
     the state afterwards rather than from what was just pressed. A button that
     looks pressable and does nothing is the bug this shape exists to prevent:
     undo with nothing to take back, or a hint on a board where nothing clears. */
  function wireTools(){
    const $ = id => document.getElementById(id);
    const palette = $('bubblePalette');
    const pick = $('bubblePick');

    const closePalette = () => {
      palette.hidden = true;
      pick.setAttribute('aria-expanded', 'false');
      pick.classList.remove('armed');
    };

    $('bubbleUndo').onclick = () => { A.unlock(); undo(); closePalette(); paintTools(); };
    $('bubbleHint').onclick = () => { A.unlock(); hint(); closePalette(); paintTools(); };
    $('bubbleSwap').onclick = () => { A.unlock(); swap(); closePalette(); paintTools(); };

    pick.onclick = () => {
      A.unlock();
      if (!palette.hidden) return closePalette();
      /* Built fresh each time from the colours actually left on the board. */
      palette.innerHTML = '';
      for (const colour of R.liveColours(st.board)){
        const b = document.createElement('button');
        b.className = 'swatch';
        b.type = 'button';
        b.style.background = C.PALETTE[colour % C.PALETTE.length];
        b.title = `load this colour`;
        b.onclick = () => { pickColour(colour); closePalette(); paintTools(); };
        palette.appendChild(b);
      }
      palette.hidden = false;
      pick.setAttribute('aria-expanded', 'true');
      pick.classList.add('armed');
    };
    paintTools();
  }

  /* What can be pressed right now, decided from the state every time it changes.
     The hint is the interesting one: it is disabled when nothing clears, so the
     button never charges for advice it cannot give. */
  function paintTools(){
    const $ = id => document.getElementById(id);
    if (!$('bubbleUndo')) return;
    const live = st.mode === S_AIM && !st.over;
    /* A tool the chapters have not handed over yet is not shown at all. A
       disabled button says "not now"; this one means "not yet", and the other
       game hides its ungranted tools for the same reason. */
    $('bubbleUndo').hidden = !allow.undo;
    $('bubbleHint').hidden = !allow.hint;
    $('bubbleSwap').hidden = !allow.swap;
    $('bubblePick').hidden = !allow.colour;
    /* The price on the button, from the same place the charge comes from. */
    if (prices){
      const p = prices();
      const say = (id, v) => {
        const el = $(id);
        if (!el) return;
        el.textContent = !v ? '' : v.free ? (v.left ? `${v.left} free` : 'free') : `${v.cost} \u25C6`;
      };
      say('bubbleUndoCost', p.undo);
      say('bubbleHintCost', p.hint);
      say('bubblePickCost', p.colour);
    }
    $('bubbleUndo').disabled = !(st.mode === S_AIM && st.past.length);
    $('bubbleSwap').disabled = !live || st.loaded === st.next;
    $('bubblePick').disabled = !live || R.liveColours(st.board).length < 2;
    $('bubbleHint').disabled = !live || !Adv.hasClearingShot(st.board, st.loaded, S.resolveShot);
    $('bubbleHint').classList.toggle('armed', !!st.hint);
  }

  /* Set by a host page that wants to score the run itself. The bubble game does
     not know about gold or levels and should not: it reports what happened and
     the other game decides what that was worth. Left null on the standalone
     page, where the run is its own reward. */
  let onEnd = null;
  /* the host game shows its own end of run panel, with the gold on it */
  let quiet = false;
  /* Which tools this run is allowed, and what they cost.

     The other game hands its tools over a chapter at a time and charges for the
     dear ones, and a bubble level sitting inside it has to obey the same rules
     or the chapters mean nothing on one board in five. So the host says what is
     allowed and takes the money; nothing here knows what gold is. `allow`
     defaults to everything, which is what the standalone page wants. */
  let allow = { undo: true, hint: true, swap: true, colour: true };
  let charge = null;
  /* What the host says each tool costs, so the row can say so too. Nothing here
     knows what gold is; it is handed a shape to print. */
  let prices = null;
  const afford = what => !charge || charge(what);

  function finish(how){
    st.over = how;
    st.mode = S_AIM;
    st.hint = null;
    /* A lost board goes over before the result is read out. The panel waits for
       it, because a verdict shown over a board still standing is the game saying
       the run is finished while showing that it is not. */
    if (how === 'lost' && G.occupied(st.board).length){
      collapse();
      paintHud();
      return;
    }
    show(how);
    paintHud();
  }

  /* What the run was worth, in the bubble game's own terms. The host turns this
     into stars and gold; nothing here knows what those are. */
  const result = () => ({
    how: st.over, cleared: st.over === 'won', shots: st.shots,
    score: st.score, aided: st.aided,
    stars: Sc.stars({ cleared: st.over === 'won', shots: st.shots, aided: st.aided })
  });

  /* Everything still on the board, let go from the bottom up.

     The grid itself is left exactly as it was. The drops are drawn from a copy
     and `collapsing` tells the renderer to stop drawing the board behind them,
     so this is a picture of the board leaving rather than the board being
     emptied. That matters for one reason: undo has to be able to take back the
     shot that lost the run, and it cannot put back a grid that was cleared to
     make an animation look good. */
  function collapse(){
    const cells = G.occupied(st.board);
    const deepest = Math.max(...cells.map(([j]) => j));
    st.collapsing = true;
    st.drops = cells.map(([j, c]) => {
      const p = G.centreOf(st.board, j, c);
      const d = falling(p, st.board.rows[j][c],
        (fx.next() - 0.5) * C.CUT_DRIFT * 2, -1 - fx.next());
      d.wait = (deepest - j) * C.COLLAPSE_STAGGER;
      return d;
    });
    A.advance();
  }

  /* The one place the result is written, so the panel cannot say one thing while
     the state says another.

     Said plainly, in the same voice as the other game. The first version of this
     reported the internal condition that had been met, which is what the code
     knows rather than what the player did: "Blocked" is true and reads like a
     log line. The correction is not to get chatty about it. A player who has
     just lost wants to be told the run is over and then, in the same breath,
     what ended it. */
  const starsNow = () => Sc.stars({ cleared: st.over === 'won', shots: st.shots, aided: st.aided });

  function show(how){
    const veil = document.getElementById('bubbleVeil');
    if (veil){
      veil.classList.toggle('show', !!how && !quiet);
      veil.classList.toggle('lost', how === 'lost');
    }
    if (!how) return;
    /* Said here rather than in finish(), because a lost run does not reach this
       point until the board has finished falling: the sting belongs with the
       verdict, a beat after the crash, not on top of it. */
    if (how === 'won') A.won(); else A.lost();
    /* after the board has finished falling, so a host that replaces this panel
       with its own does not put one up over a board still coming down */
    if (onEnd) onEnd(result());
    /* A host showing its own result has no panel of ours on the page to fill in,
       and reaching for its parts would throw here, one line after handing the
       run over and with the run already banked. */
    if (!veil || quiet) return;
    const stars = starsNow();
    document.getElementById('bubbleResult').textContent = how === 'won' ? 'Board cleared' : 'Game over';
    document.getElementById('bubbleWhy').textContent = how === 'won'
      ? `Every bubble gone, in ${st.shots} shots.`
      : R.isLost(st.board) ? 'The bubbles reached the line.' : 'No room left to shoot.';
    document.getElementById('bubbleScore').textContent = st.score;
    document.getElementById('bubbleStars').innerHTML =
      [0, 1, 2].map(i => i < stars ? '★' : '<span class="dim">★</span>').join('');
    /* A capped run has to say so, or the player reads three stars' worth of work
       ending in two as the game losing count. */
    const note = document.getElementById('bubbleNote');
    note.textContent = st.aided && stars === C.AID_CAP
      ? 'Picking a colour caps a run at two stars.'
      : how === 'lost' ? `Lasted ${st.shots} shots.` : '';
  }

  /* The score, the stars in hand, and how long there is before the board comes
     down again. The countdown is the whole reason the drop is fair: a row that
     arrives on a cadence is a rule, one that arrives unannounced is a surprise. */
  function paintHud(){
    const live = document.getElementById('bubbleLive');
    if (live) live.textContent = st.score;
    const drop = document.getElementById('bubbleDrop');
    if (!drop) return;
    const left = Sc.cadenceAt(st.shots) - st.sinceDrop;
    drop.textContent = left <= 1 ? 'drops next shot' : `drops in ${left}`;
    drop.classList.toggle('soon', left <= 2);

    /* Stars while the run is live, not only once it is over. They are earned by
       lasting, so a player who cannot see them accumulating has no way to know
       that hanging on is the thing being rewarded. */
    const run = document.getElementById('bubbleRunStars');
    if (!run) return;
    const held = Sc.stars({ cleared: false, shots: st.shots, aided: st.aided });
    run.innerHTML = [0, 1, 2].map(i => i < held ? '★' : '<span class="dim">★</span>').join('');
    const at = Sc.nextStarAt(st.shots);
    run.title = at ? `next star at ${at} shots` : 'all three earned';
    /* one entry point, so the row can never be repainted without the readouts
       beside it or the other way round */
    paintTools();
  }

  /* One bubble on its way off the board, in world units per second. Purely
     cosmetic: the grid already has it gone, so however long this takes it can
     never disagree with the board. */
  const falling = (p, was, vx, vy) => ({ x: p.x, y: p.y, vx, vy, wait: 0,
    colour: C.PALETTE[was % C.PALETTE.length] });

  function step(dt){
    if (st.mode === S_FLY){
      st.flown += C.SPEED * dt;
      if (arrived()) land();
    }
    for (const d of st.drops){
      /* held where it is until its turn, which is how the collapse cascades */
      if (d.wait > 0){ d.wait -= dt; continue; }
      d.vy += C.GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    st.drops = st.drops.filter(d => d.y < C.WORLD_H + 2);

    /* The last of it has gone off the bottom. The crash lands on an empty screen
       on purpose: a break heard while the glass is still visible reads as a
       sound effect, and heard just after it has gone it reads as the thing
       hitting the floor somewhere below. */
    if (st.collapsing && !st.drops.length){
      st.collapsing = false;
      A.crash();
      show(st.over);
      paintHud();
    }
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
    /* nothing behind the collapse: the drops are the board now */
    if (!st.collapsing) D.board(ctx, st.board);

    /* Drawn over the board, because a bubble on its way down passes in front of
       the ones still attached. */
    for (const d of st.drops) D.bubble(ctx, d.x, d.y, d.colour, C.DRAW_R, 0.9);

    if (!st.over) D.target(ctx, st.board, st.hint, now);

    if (st.over){
      D.muzzle(ctx, null);
    } else if (st.mode === S_AIM){
      const preview = S.resolveShot(st.board, C.MUZZLE, st.aim);
      D.guide(ctx, preview.points, C.PALETTE[st.loaded % C.PALETTE.length],
        (now / 1000 * C.GUIDE_SPEED) % C.GUIDE_DOT_GAP);
      D.muzzle(ctx, st.aim);
      D.bubble(ctx, C.MUZZLE.x, C.MUZZLE.y, C.PALETTE[st.loaded % C.PALETTE.length]);
    } else {
      D.muzzle(ctx, null);
      const p = pointAt(st.flown);
      D.bubble(ctx, p.x, p.y, C.PALETTE[st.loaded % C.PALETTE.length]);
    }
    /* what is coming, tucked beside the muzzle */
    if (!st.over){
      D.bubble(ctx, C.MUZZLE.x + 1.9, C.MUZZLE.y + 0.35,
        C.PALETTE[st.next % C.PALETTE.length], C.DRAW_R * 0.62, 0.75);
    }
  }

  let bound = false;
  function boot(){
    const cv = document.getElementById('bubbleCanvas');
    V.mount(cv);
    newBoard(1);

    /* Bound once. boot() is called again whenever something has to re-measure
       the canvas — the lab does it after a knob changes the shape of the world —
       and addEventListener does not replace, it stacks. Two pointerup listeners
       means one tap runs the turn twice: the first takes the piece in hand and
       the second, seeing it already held, puts it straight back down, so the
       game stops responding to taps and nothing anywhere throws. */
    if (bound) return;
    bound = true;

    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      /* The audio context is not allowed to start until the page has been
         touched, so every gesture asks. It is cheap after the first. */
      A.unlock();
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

    /* Only the page that is nothing but this game has these. Inside the other
       one, dealing another board and muting the sound are that game's controls
       and a finished run goes back to its map. Reaching for them unguarded
       threw here, one line before the frame loop was started, so the board was
       dealt and then never drawn: no error visible on screen, just a game that
       does nothing. */
    const onClick = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    onClick('bubbleAgain', () => { A.unlock(); newBoard(st.seed + 1); });
    onClick('bubbleRetry', () => { A.unlock(); newBoard(st.seed + 1); });

    wireTools();

    const sound = document.getElementById('bubbleSound');
    if (sound){
      const paintSound = () => {
        sound.textContent = A.enabled ? 'Sound' : 'Muted';
        sound.setAttribute('aria-pressed', String(A.enabled));
        sound.classList.toggle('off', !A.enabled);
      };
      sound.onclick = () => {
        A.unlock();
        A.setEnabled(!A.enabled);
        paintSound();
        /* say so, so the button proves itself the moment it is pressed */
        if (A.enabled) A.matched(3);
      };
      paintSound();
    }

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

  return { boot, _state: st, newBoard, fire, step, land, finish, result,
           undo, hint, swap, pickColour, paintHud, paintTools,
           set onEnd(fn){ onEnd = fn; }, get onEnd(){ return onEnd; },
           set allow(v){ allow = { undo: true, hint: true, swap: true, colour: true, ...v }; },
           get allow(){ return allow; },
           set charge(fn){ charge = fn; }, get charge(){ return charge; },
           set prices(fn){ prices = fn; }, get prices(){ return prices; },
           /* the host hides this game's own panel and shows its own */
           set panelHidden(v){ quiet = !!v; }, get panelHidden(){ return quiet; } };
})();
globalThis.BubbleApp = BubbleApp;

/* Booted on sight only on the page that is nothing but this game. Inside the
   other one these modules are loaded on every page view and the board is dealt
   when a bubble level is actually opened, so booting here would mount a canvas
   nobody asked for and deal a board behind the map. */
if (document.body.dataset.only === 'bubble'){
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', BubbleApp.boot);
  else BubbleApp.boot();
}
