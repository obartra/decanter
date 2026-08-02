/* The loop, the input, and the turn.

   The board reaches its final state the instant a move is applied, before
   anything is animated, and the animation is handed the position it started
   from. So a slow frame, a backgrounded tab or a long shove cannot leave the
   floor and the screen disagreeing about where a cask is — which in a game whose
   entire content is what is next to what would not be a cosmetic bug, it would
   be a lie about the puzzle.

   ---- DRAG OR TAP, AND WHY BOTH ----

   The measure takes two taps and refuses a drag, and gives good reasons: a drag
   has to be tracked, can be cancelled halfway, and fights the browser's own
   gestures on a phone. Every one of those is still true here, and this game
   takes the drag anyway, because a slide is not a pour.

   A pour is an abstract relation between two vessels and the hand never touches
   the wine. A cask is an object being shoved across a floor, and the move IS the
   gesture. Refusing the drag would mean the one thing the player can do to a
   physical object in front of them is the one thing the interface does not
   accept. So: press and push, and it goes as far as you push it; or tap it and
   tap where it should end up, for the same move without the dexterity. Both go
   through the same play(), so there is one turn and not two.

   The drag is clamped to the run — CasksRules.runOf — so A CASK CAN NEVER BE PUT
   ON A CELL IT COULD NOT HAVE SLID THROUGH, however far the finger travels. It
   is allowed to be DRAWN a fraction of a cell past the stop, because a cask that
   freezes solid under a moving finger reads as the game having lost the touch;
   the state never goes there and the drawing springs back. */
const CasksApp = (() => {
  const C = CasksConfig;
  const R = CasksRules;
  const Se = CasksSearch;
  const L = CasksLevels;
  const Sc = CasksScore;
  const A = CasksAudio;
  const V = CasksView;
  const D = CasksRender;

  const st = {
    level: 1,
    /* The layout never changes while a board is being played; the position is
       the only thing that does. Keeping them apart is what makes a board a small
       array of integers rather than a scene graph. */
    layout: [], pos: [],
    /* what is currently drawn, which chases the truth. Never read by the rules. */
    drawn: [],
    moves: 0,
    /* Par for the OPENING position, from the committed table and from nowhere
       else. Not searched: see the header of 30-levels.js. `rated` is false when
       the table has no entry, and everything downstream says so rather than
       assuming the best; see 45-score.js. */
    par: null,
    rated: false,
    /* the cask in hand, or -1 */
    picked: -1,
    /* the move a hint named, drawn until it is played or the selection changes */
    advice: null,
    /* {cask, at, from, run, offset, moved, hadPicked} while a finger is down */
    grab: null,
    /* {cask, from, to, t, dur, thud} while a cask is travelling */
    sliding: null,
    /* {t} while the gilt cask is leaving through the door */
    escaping: null,
    /* Whether this run leaned on something. Both tools set it, as in the
       measure; C.AID_CAP explains why neither is free here. */
    aided: false,
    past: [],
    /* null while the board is live, then 'open' */
    over: null,
    /* Fewest moves this session has taken on each level. In memory only: there
       is no save file on this page, and inventing one would be inventing a
       schema, a migration and a way for a bad one to stop the game opening, all
       for a number nobody has asked to keep yet. See docs/design/12-saving.md
       for what that costs when it is worth doing. */
    best: new Map()
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---- dealing ---- */
  function newBoard(level){
    const board = L.make(level);
    /* No board means past the end of the cellar, and there is nothing to
       improvise: an unmeasured layout is very likely worth three moves and might
       have no way out at all. The caller checks before offering the level, so
       reaching here at all means the two tables have come apart. */
    if (!board) return false;

    st.level = level;
    st.layout = board.layout;
    st.pos = board.start.slice();
    st.drawn = board.start.slice();
    st.moves = 0;
    st.picked = -1;
    st.advice = null;
    st.grab = null;
    st.sliding = null;
    st.escaping = null;
    st.aided = false;
    st.past = [];
    st.over = null;
    st.par = L.par(level);
    st.rated = Sc.rated(st.par);

    show(null);
    paintHud();
    return true;
  }

  /* ---- the turn ---- */

  /* Everything a move changes, including the move count, so undo restores the
     position AND what it cost to get there. Half an undo — the floor back but
     the count kept — would be a game quietly charging for a mis-drag. */
  function remember(){
    st.past.push({ pos: st.pos.slice(), moves: st.moves });
    if (st.past.length > C.UNDO_DEPTH) st.past.shift();
  }

  /* One move. ONE MOVE IS ONE MOVE WHATEVER IT CARRIES: shoving a cask four
     cells and nudging it one both cost exactly one, exactly as a pour does in
     the other two games. `drawnFrom` is where the cask currently appears, which
     is not where it was if the player dragged it there. */
  function play(cask, to, drawnFrom){
    if (!R.canMove(st.layout, st.pos, cask, to)){ A.nudge(); return false; }

    const run = R.runOf(st.layout, st.pos, cask);
    const from = st.pos[cask];
    remember();
    st.pos = R.apply(st.layout, st.pos, { cask, to });
    st.moves++;
    st.picked = -1;
    st.advice = null;

    const travelled = Math.abs(to - from);
    st.sliding = {
      cask, from: drawnFrom == null ? from : drawnFrom, to, t: 0,
      dur: Math.min(C.SLIDE_MAX, C.SLIDE_PER_CELL * Math.max(1, travelled)),
      /* A cask that ran out of floor thudded; one the player chose to stop short
         did not. Only the first is information, and it is played when the cask
         arrives rather than when the move is made, because a stop that is heard
         before it is seen reads as a different event. */
      thud: to === run.min || to === run.max
    };
    A.slide(travelled, cask === 0);

    if (R.isOut(st.layout, st.pos)) finish('open');
    paintHud();
    return true;
  }

  /* Which cask covers a floor cell, or -1. */
  function caskAt(cell){
    if (!cell) return -1;
    return R.occupancy(st.layout, st.pos)[cell.r * C.W + cell.c];
  }

  /* Where the cask in hand would have to end up for it to cover a tapped cell.
     Null when the tap says nothing about this cask: a cell off its axis, or one
     it already covers. Nothing here decides whether the move is legal — that is
     R.canMove, and it is asked separately, so the geometry and the rule cannot
     drift into disagreeing. */
  function destFor(i, cell){
    const cask = st.layout[i];
    if (cask.horiz ? cell.r !== cask.fixed : cell.c !== cask.fixed) return null;
    const line = cask.horiz ? cell.c : cell.r;
    const at = st.pos[i];
    if (line < at) return line;
    if (line > at + cask.len - 1) return line - cask.len + 1;
    return null;
  }

  /* A press. On a cask it takes it in hand and opens a drag; on bare floor with
     something already in hand it is the second half of a tap-then-tap. */
  function press(p){
    if (st.over || st.sliding || st.escaping) return false;
    const cell = V.cellAt(p);
    const i = caskAt(cell);

    if (i >= 0){
      const hadPicked = st.picked === i;
      /* One cask at a time. A second finger landing while the first is still
         dragging used to overwrite the grab outright, which left the first
         cask's drawn offset frozen part-way across its cell -- nothing restored
         it until that cask next moved -- and pointed the first finger's moves at
         the second cask, so releasing it committed a move nobody asked for. The
         pointercancel handler restores st.drawn for exactly this reason; this
         path did not. */
      if (st.grab) return false;
      st.grab = {
        cask: i, at: V.along(st.layout[i], p), from: st.pos[i],
        run: R.runOf(st.layout, st.pos, i), offset: 0, moved: false, hadPicked
      };
      if (!hadPicked){
        st.picked = i;
        st.advice = null;
        A.take();
      }
      paintHud();
      return true;
    }

    if (st.picked >= 0 && cell){
      const to = destFor(st.picked, cell);
      if (to != null && R.canMove(st.layout, st.pos, st.picked, to)) return play(st.picked, to);
    }
    /* Nothing was refused here, because nothing was asked. A tap on bare stone
       with nothing in hand, or on a cell this cask could not have slid to, is
       not a wrong move — it is not a move, and the game says so with the nudge
       rather than with a buzz. */
    A.nudge();
    return false;
  }

  /* A finger moving with a cask under it. Only the cask's own axis is tracked:
     a drag that wandered sideways would otherwise carry the cask further than
     the finger actually went along the direction it can go. */
  function drag(p){
    const g = st.grab;
    if (!g) return false;
    g.offset = V.along(st.layout[g.cask], p) - g.at;
    if (Math.abs(g.offset) > C.DRAG_SLOP) g.moved = true;
    st.drawn[g.cask] = clamp(g.from + g.offset,
      g.run.min - C.DRAG_OVERSHOOT, g.run.max + C.DRAG_OVERSHOOT);
    return true;
  }

  /* Letting go. A press that never travelled is a tap and only changes what is
     in hand; one that travelled commits to the nearest cell inside the run. */
  function release(){
    const g = st.grab;
    st.grab = null;
    if (!g) return false;

    if (g.moved){
      const to = clamp(Math.round(g.from + g.offset), g.run.min, g.run.max);
      if (to !== g.from) return play(g.cask, to, st.drawn[g.cask]);
      /* Pushed and it did not go anywhere, or went and came back. The drawing is
         somewhere between cells and possibly past the stop, so it is animated
         home rather than snapped: a cask that teleports back to where it started
         looks like the game undoing something the player did. */
      st.sliding = { cask: g.cask, from: st.drawn[g.cask], to: g.from, t: 0,
                     dur: C.SLIDE_PER_CELL * 2, thud: false };
      return false;
    }
    /* A tap on the cask that was already in hand puts it down — and the advice
       goes down with it. The advice belongs to a selection, and once nothing is
       in hand there is no run drawn under it, so the gold outline was left
       floating over a cask that was no longer picked. */
    if (g.hadPicked){ st.picked = -1; st.advice = null; }
    paintHud();
    return true;
  }

  function undo(){
    if (st.sliding || st.escaping || !st.past.length) return false;
    const was = st.past.pop();
    st.pos = was.pos.slice();
    st.drawn = was.pos.slice();
    st.moves = was.moves;
    st.picked = -1;
    st.advice = null;
    /* A board that was open is not open any more, which is the whole point of
       being able to take back the move that opened it. */
    st.over = null;
    st.escaping = null;
    st.aided = true;
    show(null);
    A.undo();
    paintHud();
    return true;
  }

  /* The move the search would play FROM WHERE THE PLAYER ACTUALLY IS, not from
     the opening position: by move four they are not on that line any more, and
     advice about a board they are no longer looking at is worse than none.

     This is the one search the page ever runs, and it is asked for rather than
     paid on every deal — which is the whole reason 30-levels.js can read par out
     of a table instead. Asked before it is charged for, so a hint with nothing
     to say never costs the run its third star. */
  function hint(){
    if (st.over || st.sliding || st.escaping) return null;
    const got = Se.solve(st.layout, st.pos, C.SEARCH_CAP);
    if (!got.first) return null;
    st.advice = got.first;
    st.picked = got.first.cask;
    st.aided = true;
    paintHud();
    return got.first;
  }

  function finish(how){
    st.over = how;
    st.picked = -1;
    st.advice = null;
    st.grab = null;
    /* Through Sc.better rather than a Math.min written here, because best is the
       FEWEST moves in this game and the LONGEST run in the bubble one. Two
       things called best that compare in opposite directions is exactly the kind
       of difference that survives a review and then quietly records the worst
       run of every board forever. */
    if (how === 'open') st.best.set(st.level, Sc.better(st.best.get(st.level), st.moves));
  }

  /* ---- the frame ---- */
  function step(dt){
    if (st.sliding){
      const s = st.sliding;
      s.t += dt / s.dur;
      if (s.t >= 1){
        st.drawn[s.cask] = st.pos[s.cask];
        st.sliding = null;
        if (s.thud) A.thud();
        /* The tools come back when the cask stops. paintHud() disables undo and
           hint while something is travelling, and the flag it reads is cleared
           here — in the frame loop, which does not paint the HUD. Without this
           they go grey on the first slide and stay grey; undo() still worked, so
           nothing threw, and the only route back to it was to tap a cask, which
           happens to repaint. */
        paintHud();
        /* The panel waits for the cask to stop, and for the gilt one to be gone.
           A verdict that arrives while something is still travelling is the game
           announcing a result over a board that has visibly not reached it. */
        if (st.over === 'open'){ st.escaping = { t: 0 }; A.door(); }
      } else {
        /* Eased out only: a shove starts at once and slows as it runs out, which
           is what a heavy thing on a floor does. Easing the start as well makes
           it float. */
        const e = 1 - Math.pow(1 - s.t, 3);
        st.drawn[s.cask] = s.from + (s.to - s.from) * e;
      }
    } else if (st.escaping){
      st.escaping.t += dt / 0.8;
      if (st.escaping.t >= 1){
        st.escaping = null;
        paintHud();
        show(st.over);
      }
    }
  }

  /* How far out of the room the gilt cask has travelled, in cells, and how much
     of it is still visible. It goes through the doorway rather than stopping at
     the wall: the door is what the whole board is about and the last move should
     end with the cask through it, not touching it. */
  const escapeShift = t => (1 - Math.pow(1 - t, 2)) * (V.world.wall + 1.6);

  function draw(now){
    const ctx = V.frame();
    D.floor(ctx);
    /* An empty room, which can only happen if the shipped tables are missing
       entirely. The walls are still drawn, because a dark rectangle is a better
       account of that than an exception thrown sixty times a second. */
    if (!st.layout.length){ D.walls(ctx); return; }

    const gilt = st.layout[0];
    const heat = st.over ? 1 : st.drawn[0] / Math.max(1, R.span(gilt));
    D.door(ctx, heat, now);

    if (st.picked >= 0 && !st.sliding){
      D.track(ctx, st.layout[st.picked], R.runOf(st.layout, st.pos, st.picked));
    }

    /* The gilt cask last, so its rim of light is never cut by a neighbour drawn
       over it. Everything else in whatever order the board came in, which is
       fine because no two casks ever overlap. */
    for (let i = st.layout.length - 1; i >= 1; i--){
      D.cask(ctx, st.layout[i], st.drawn[i], {
        lit: st.picked === i,
        advice: !!(st.advice && st.advice.cask === i)
      });
    }
    if (st.escaping){
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, st.escaping.t - 0.45) / 0.55);
      D.cask(ctx, gilt, st.drawn[0] + escapeShift(st.escaping.t), { gilt: true });
      ctx.restore();
    } else {
      D.cask(ctx, gilt, st.drawn[0], {
        gilt: true, lit: st.picked === 0, advice: !!(st.advice && st.advice.cask === 0)
      });
    }

    D.walls(ctx);
    if (!st.moves && !st.over){
      D.doorLabel(ctx, 'the door');
      D.rule(ctx, 'Push a cask along its length, or tap it and tap where it goes.');
    }
  }

  /* ---- what the page says ---- */
  const $ = id => document.getElementById(id);

  function paintHud(){
    if (!$('cskLevel')) return;
    $('cskLevel').textContent = st.level;
    $('cskMoves').textContent = st.moves;
    $('cskCasks').textContent = st.layout.length;

    /* An unrated board says so in the place par would have been, rather than
       showing a dash or a zero. Both of those read as "par is zero", which is a
       claim, and the whole point of 45-score.js is that this page does not make
       claims it cannot support. */
    const par = $('cskPar');
    par.textContent = st.rated ? `of ${st.par}` : 'unrated';
    par.classList.toggle('cskUnrated', !st.rated);

    const held = st.rated ? Sc.stars(st.moves, st.par, st.aided) : 0;
    $('cskStars').innerHTML = [0, 1, 2]
      .map(i => (i < held ? '★' : '<span class="cskDim">★</span>')).join('');
    const spare = Sc.left(st.moves, st.par);
    $('cskStars').title = st.rated
      ? (spare ? `${spare} more moves still score` : 'past the last move that scores')
      : 'this floor is not in the par table, so it cannot be rated';

    $('cskUndo').disabled = !st.past.length || !!st.sliding || !!st.escaping;
    $('cskHint').disabled = !!st.over || !!st.sliding || !!st.escaping;
  }

  /* The one place the result is written, so the panel cannot say one thing while
     the state says another. */
  function show(how){
    const veil = $('cskVeil');
    if (veil) veil.classList.toggle('cskShow', !!how);
    if (!how || !veil) return;

    const stars = Sc.stars(st.moves, st.par, st.aided);
    const last = L.last();
    $('cskResult').textContent = 'The door';
    $('cskWhy').textContent = `Out in ${st.moves} ${st.moves === 1 ? 'move' : 'moves'}.`;
    $('cskStarsOut').innerHTML = [0, 1, 2]
      .map(i => (i < stars ? '★' : '<span class="cskDim">★</span>')).join('');

    /* Every one of these is a different thing to have happened and they are said
       differently, because "2 stars" with no reason attached reads as the game
       having lost count, and "unrated" with no reason attached reads as a
       fault. */
    const note = $('cskNote');
    if (!st.rated){
      note.textContent = 'This floor is not in the par table, so there is nothing to measure the run against.';
    } else if (st.aided && stars === C.AID_CAP){
      note.textContent = 'Undo and hint both cap a run at two stars.';
    } else if (st.moves === st.par){
      note.textContent = 'The fewest moves there are.';
    } else {
      const best = st.best.get(st.level);
      note.textContent = `${st.moves - st.par} over the minimum of ${st.par}.`
        + (best != null && best < st.moves ? ` Your best here is ${best}.` : '');
    }

    /* Where the cellar ends. Said once, on the way past it, because there is no
       level sixty-one to hand over: the boards are a measured table rather than
       a seed, so running out of them is running out of cellar. */
    const done = st.level >= last;
    if (done) note.textContent += ' That is the last floor in the cellar.';
    $('cskNext').textContent = done ? 'Start again' : 'Next floor';
  }

  /* ---- boot ---- */
  function boot(){
    const cv = $('cskCanvas');
    V.mount(cv);
    newBoard(1);

    const world = e => V.screenToWorld(e.clientX, e.clientY);
    cv.addEventListener('pointerdown', e => {
      /* Nothing here scrolls or zooms, and letting the browser think otherwise
         costs a visible wait before a drag starts moving anything. */
      e.preventDefault();
      A.unlock();
      cv.setPointerCapture(e.pointerId);
      press(world(e));
    });
    cv.addEventListener('pointermove', e => { if (st.grab) drag(world(e)); });
    cv.addEventListener('pointerup', () => release());
    /* A pointer that is taken away — a system gesture, a phone call arriving —
       is not a move. Letting go without committing is the only safe reading, and
       without this the cask stays stuck to a finger that no longer exists. */
    cv.addEventListener('pointercancel', () => {
      const g = st.grab;
      st.grab = null;
      if (g) st.drawn[g.cask] = st.pos[g.cask];
    });

    const onClick = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    onClick('cskUndo', () => { A.unlock(); undo(); });
    onClick('cskHint', () => { A.unlock(); hint(); });
    /* Restart deals the same floor again, because a level is a fixed board:
       there is no "another board of this difficulty" to offer, and pretending
       there is would hand out a layout nobody swept. */
    onClick('cskRestart', () => { A.unlock(); newBoard(st.level); });
    onClick('cskNext', () => { A.unlock(); nextBoard(); });
    onClick('cskSkip', () => { A.unlock(); nextBoard(); });

    const sound = $('cskSound');
    if (sound){
      const paintSound = () => {
        sound.textContent = A.enabled ? 'Sound' : 'Muted';
        sound.setAttribute('aria-pressed', String(A.enabled));
        sound.classList.toggle('cskOff', !A.enabled);
      };
      sound.onclick = () => {
        A.unlock();
        A.setEnabled(!A.enabled);
        paintSound();
        /* say so, so the button proves itself the moment it is pressed */
        if (A.enabled) A.take();
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

  /* The next floor, or back to the first. Wrapping rather than stopping, because
     the alternative is a button that does nothing and a page with no way out of
     its own last level. */
  function nextBoard(){
    const next = st.level + 1;
    return newBoard(L.make(next) ? next : 1);
  }

  return { boot, newBoard, nextBoard, press, drag, release, play, undo, hint, step, paintHud, _state: st };
})();
globalThis.CasksApp = CasksApp;

/* Booted on sight, because this page is nothing but this game. The other two
   check a data attribute because one of them is also loaded inside the pour
   game; this one is not wired into the graded run at all, and the check is kept
   anyway so that the day it is, nothing here deals a board behind somebody's
   map. */
if (document.body.dataset.only === 'casks'){
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', CasksApp.boot);
  else CasksApp.boot();
}
