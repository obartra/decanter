/* The loop, the input, and the turn.

   The board reaches its final state the instant a pour is applied, before
   anything is animated, and the animation is handed the position it started
   from. So a slow frame, a backgrounded tab or a long stream cannot leave the
   bench and the screen disagreeing about how much is in a vessel — which in a
   game played by reading levels off glass would not be a cosmetic bug, it would
   be a lie about the puzzle.

   Two taps make a pour: one to take a vessel in hand, one to say where it goes.
   Not a drag, deliberately. A drag has to be tracked, can be canceled halfway,
   and on a phone it fights the browser's own gestures; two taps are the same
   number of decisions with none of that, and they leave the vessel in hand
   visible on screen between them, which a drag does not. */
import { MeasureConfig } from './pure/00-config.js';
import { MeasureRules } from './pure/20-rules.js';
import { MeasureSearch } from './pure/25-search.js';
import { MeasureLevels } from './pure/30-levels.js';
import { MeasurePars } from './pure/35-pars.js';
import { MeasureScore } from './pure/45-score.js';
import { MeasureAudio } from './50-audio.js';
import { MeasureView } from './60-view.js';
import { MeasureRender } from './70-render.js';

export const MeasureApp = (() => {
  const C = MeasureConfig;
  const R = MeasureRules;
  const Se = MeasureSearch;
  const L = MeasureLevels;
  const Sc = MeasureScore;
  const A = MeasureAudio;
  const V = MeasureView;
  const D = MeasureRender;

  const st = {
    level: 1,
    caps: [], start: [], target: 0,
    /* the truth, updated the instant a pour is made */
    amount: [],
    /* what is currently drawn, which chases it. Never read by the rules. */
    drawn: [],
    moves: 0,
    /* Par for the OPENING position, from the committed table where there is one
       and from the search where there is not. `rated` is false when neither
       could answer, and everything downstream of that says so rather than
       assuming the best; see 45-score.js. */
    par: null,
    rated: false,
    /* the vessel in hand, or -1 */
    picked: -1,
    /* the move a hint named, drawn until it is played or the selection changes */
    advice: null,
    /* {from, to, t, before} while the wine is in the air, else null */
    pouring: null,
    /* Whether this run leaned on something. Both tools set it here, unlike the
       bubble game where only one does; C.AID_CAP explains why. */
    aided: false,
    past: [],
    /* null while the board is live, then 'measured', or 'nothing' for a board
       whose target cannot be reached at all */
    over: null,
    /* Fewest pours this session has taken on each level. In memory only: there
       is no save file on this page, and inventing one would be inventing a
       schema, a migration and a way for a bad one to stop the game opening, all
       for a number nobody has asked to keep yet. See docs/design/12-saving.md
       for what that costs when it is worth doing. */
    best: new Map()
  };

  /* ---- dealing ---- */
  function newBoard(level){
    const board = L.make(level);
    st.level = level;
    st.caps = board.caps;
    st.start = board.start;
    st.target = board.target;
    st.amount = board.start.slice();
    st.drawn = board.start.slice();
    st.moves = 0;
    st.picked = -1;
    st.advice = null;
    st.pouring = null;
    st.aided = false;
    st.past = [];
    st.over = null;
    /* Whether the search reached the end of what this bench can do. True by
       default because a par read off the table is a settled answer by
       construction; only the in-page fallback can leave it unsettled. */
    st.settled = true;

    /* The table first, the search only as a fallback.

       Not for speed — the search costs about a millisecond here — but because
       the table is the number the levels were CHOSEN against, and a board whose
       par came from somewhere else is a board being graded against a different
       measurement than the one that ordered it.

       The fallback is nevertheless a real par and is graded as one, which is the
       other place this parts company with the pour game. Its in-browser search
       returns an upper bound it settled for, so an estimate there is shown with
       a ~ and decides nothing. Here the search is exhaustive: it either walks
       every position this bench can reach, in which case the answer is the
       minimum, or it hits the tripwire and says nothing at all. */
    const known = MeasurePars && MeasurePars.par
      && MeasurePars.par[level];
    if (Number.isInteger(known)){
      st.par = known;
    } else {
      const got = Se.solve(st.caps, st.amount, st.target);
      st.par = got.exact ? got.par : null;
      /* Which of the two silences this is. `settled` means the search walked
         every position the bench can reach and found no way to the target, so
         "it cannot be done" is a fact. A tripwire means it walked as far as it
         was allowed and stopped, which establishes nothing at all.

         They were the same `null` here, and the page said the first sentence in
         both cases — asserting unsolvability the search had never shown, which
         is exactly the claim 45-score.js exists to refuse. */
      st.settled = got.exact;
    }
    st.rated = Sc.rated(st.par);
    /* A bench with no reachable target is not a failure state and the player has
       done nothing wrong, so it is said at the deal rather than discovered forty
       pours in. Only when it is a fact, though: a search that gave up leaves the
       bench playable and merely unrated, which is what the HUD already draws and
       what 16-measure.md decides.

       This is rare now rather than common. make() walks the seed past the table
       until it finds a bench that can be finished, so reaching here at all means
       sixty seeds in a row failed. */
    if (!st.rated && st.par == null && st.settled !== false) st.over = 'nothing';

    V.fit(st.caps);
    show(st.over);
    paintHud();
    if (st.over === 'nothing') A.stranded();
    return board;
  }

  /* ---- the turn ---- */

  /* Everything a pour changes, including the move count, so undo restores the
     position AND what it cost to get there. Half an undo — the board back but
     the count kept — would be a game quietly charging for a mis-tap. */
  function remember(){
    st.past.push({ amount: st.amount.slice(), moves: st.moves });
    if (st.past.length > C.UNDO_DEPTH) st.past.shift();
  }

  /* One pour. One move, whatever it carries: a full demijohn into a carafe and a
     single unit into a thimble both cost exactly one, exactly as a pour does in
     the other game, and that is what makes par a measure of thinking rather than
     of tapping. */
  function play(from, to){
    const n = R.amountPoured(st.caps, st.amount, from, to);
    if (n <= 0){ A.nudge(); return false; }

    remember();
    const before = st.amount.slice();
    st.amount = R.apply(st.caps, st.amount, { from, to, n });
    st.moves++;
    st.picked = -1;
    st.advice = null;
    st.pouring = { from, to, t: 0, before };

    /* Both cues carry information the player would otherwise have to read off
       the glass: the target hit its brim, or the source went empty. They are the
       two facts a line is built out of. */
    A.pour(st.amount[to] / st.caps[to], n / st.caps[to]);
    if (st.amount[to] === st.caps[to]) A.brim();
    if (st.amount[from] === 0) A.drained();

    if (R.isSolved(st.amount, st.target)) finish('measured');
    paintHud();
    return true;
  }

  /* A tap. The first one takes a vessel in hand, the second says where it goes,
     and tapping the vessel already in hand puts it back down.

     Nothing is refused silently. A tap on an empty vessel, or on a full one with
     something already in hand, gets the nudge — which is deliberately not a
     buzz, because the tap was not a wrong move, it was not a move. */
  function tap(i){
    if (st.over || st.pouring || i < 0) return false;
    /* Putting the vessel down puts the advice down with it. The advice names a
       pour FROM the vessel in hand, and with nothing in hand there is nothing for
       the gold to be pointing out of — it was left lighting a rim and a target
       for a move the player had just abandoned. */
    if (st.picked === i){ st.picked = -1; st.advice = null; A.nudge(); paintHud(); return true; }
    if (st.picked < 0){
      if (st.amount[i] <= 0){ A.nudge(); return false; }
      st.picked = i;
      st.advice = null;
      paintHud();
      return true;
    }
    const from = st.picked;
    if (!play(from, i)){
      /* Nothing would have moved. The vessel stays in hand rather than being put
         down, because the likeliest reason for landing here is a mis-tap and
         making the player pick it up again to try the vessel next door is a
         punishment for the interface's own ambiguity. */
      return false;
    }
    return true;
  }

  function undo(){
    if (st.pouring || !st.past.length) return false;
    const was = st.past.pop();
    st.amount = was.amount.slice();
    st.drawn = was.amount.slice();
    st.moves = was.moves;
    st.picked = -1;
    st.advice = null;
    /* A board that was finished is not finished any more, which is the whole
       point of being able to take back the pour that finished it. */
    st.over = null;
    st.aided = true;
    show(null);
    A.undo();
    paintHud();
    return true;
  }

  /* The move the search would play from where the player actually is, not from
     the opening position: by move four they are not on that line any more, and
     advice about a board they are no longer looking at is worse than none.

     Asked for before it is charged for, so a hint that has nothing to say — a
     finished board, an unmeasurable one — never costs the run its third star. */
  function hint(){
    if (st.over || st.pouring) return null;
    const got = Se.solve(st.caps, st.amount, st.target);
    if (!got.first) return null;
    st.advice = got.first;
    st.picked = got.first.from;
    st.aided = true;
    paintHud();
    return got.first;
  }

  function finish(how){
    st.over = how;
    st.picked = -1;
    st.advice = null;
    /* Through Sc.better rather than a Math.min written here, because best is the
       FEWEST pours in this game and the LONGEST run in the bubble one. Two
       things called best that compare in opposite directions is exactly the kind
       of difference that survives a review and then quietly records the worst
       run of every board forever. */
    if (how === 'measured') st.best.set(st.level, Sc.better(st.best.get(st.level), st.moves));
  }

  /* ---- the frame ---- */
  function step(dt){
    if (st.pouring){
      st.pouring.t += dt / C.POUR_TIME;
      if (st.pouring.t >= 1){
        st.pouring = null;
        st.drawn = st.amount.slice();
        /* The tools come back when the pour lands. paintHud() disables undo and
           hint for the length of a pour, because taking back a move that is
           still in the air has nothing coherent to take back — but the flag it
           reads is cleared here, in the frame loop, and the frame loop does not
           paint the HUD. Without this the buttons go gray on the first move and
           stay gray: undo() itself still worked, so nothing threw and nothing
           looked broken, but the only way to reach it was to tap a vessel first,
           which happens to repaint. The one recovery control in the game, gone
           behind an accident of who repaints. */
        paintHud();
        /* The panel waits for the wine to land. A verdict that arrives while the
           stream is still in the air is the game announcing a result over a
           board that has visibly not reached it yet. */
        if (st.over) show(st.over);
      } else {
        /* Eased at both ends, so the stream starts and stops rather than
           switching on. The drawn level is interpolated from the position the
           pour started at toward the position the rules already reached, so it
           can only ever be somewhere between two true positions. */
        const t = st.pouring.t;
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        for (let i = 0; i < st.amount.length; i++){
          st.drawn[i] = st.pouring.before[i] + (st.amount[i] - st.pouring.before[i]) * e;
        }
      }
    }
  }

  /* The drawn level is a fraction while a pour is in the air, and it goes to the
     renderer as one. It used to be rounded here, which quantised the liquid to
     whole units and threw the whole animation away: step() eased st.drawn every
     frame, and the glass received 0, 0, 1, 1, 2 — so an n-unit pour was n snaps
     however smooth the interpolation underneath was, and a one-unit pour did not
     move at all until it was over. The comment above the rounding described a
     glass that looked half moved, which was the one thing it prevented.

     The numeral is the only thing that needs an integer, and 70-render.js rounds
     it where it draws it. Nothing else reads the fractional part, which is why
     losing it was invisible everywhere except on the screen. */

  function draw(now){
    const ctx = V.frame();
    D.shelf(ctx);

    const boxes = st.caps.map((_, i) => V.vesselBox(st.caps, i));
    const hit = R.isSolved(st.amount, st.target);
    D.targetLine(ctx, st.target, hit && !st.pouring);

    if (st.picked >= 0) D.selection(ctx, boxes[st.picked], now);
    if (st.advice) D.selection(ctx, boxes[st.advice.to], now + 900);

    for (let i = 0; i < boxes.length; i++){
      const lifting = st.pouring && st.pouring.from === i
        ? Math.sin(Math.min(1, st.pouring.t) * Math.PI) * C.LIFT
        : (st.picked === i ? C.LIFT * 0.45 : 0);
      D.vessel(ctx, boxes[i], st.drawn[i], {
        lift: lifting,
        lit: st.picked === i || (st.advice && st.advice.from === i)
      });
    }

    if (st.pouring) D.stream(ctx, boxes[st.pouring.from], boxes[st.pouring.to], st.pouring.t);
    if (!st.moves && !st.over) D.rule(ctx, `Tap a vessel, then another, to pour. Measure out ${st.target}.`);
  }

  /* ---- what the page says ---- */
  const $ = id => document.getElementById(id);

  function paintHud(){
    if (!$('msrLevel')) return;
    $('msrLevel').textContent = st.level;
    /* Said in words as well as drawn as a line. The line is the instrument and
       is what the board is actually read against; this is for the moment a
       player looks up from it and wants to be told what they are trying to do,
       without having to find the one numeral on the canvas that says so. */
    $('msrTarget').textContent = st.target;
    $('msrMoves').textContent = st.moves;

    /* An unrated board says so in the place par would have been, rather than
       showing a dash or a zero. Both of those read as "par is zero", which is a
       claim, and the whole point of 45-score.js is that this page does not make
       claims it cannot support. */
    const par = $('msrPar');
    par.textContent = st.rated ? `of ${st.par}` : 'unrated';
    par.classList.toggle('msrUnrated', !st.rated);

    const held = st.rated ? Sc.stars(st.moves, st.par, st.aided) : 0;
    $('msrStars').innerHTML = [0, 1, 2]
      .map(i => (i < held ? '★' : '<span class="msrDim">★</span>')).join('');
    /* left() counts the pours until the run is worth nothing, and the LAST of
       those is the one that stops it scoring — so the number that still score is
       one fewer. Printing left() itself here promised a scoring pour at par + 2,
       where the very next pour earns nothing. */
    const spare = st.rated ? Sc.left(st.moves, st.par) - 1 : 0;
    $('msrStars').title = st.rated
      ? (spare > 0
          ? `${spare} more ${spare === 1 ? 'pour still scores' : 'pours still score'}`
          : 'past the last pour that scores')
      : 'this board is not in the par table, so it cannot be rated';

    $('msrUndo').disabled = !st.past.length || !!st.pouring;
    $('msrHint').disabled = !!st.over || !!st.pouring;
  }

  /* The one place the result is written, so the panel cannot say one thing while
     the state says another. */
  function show(how){
    const veil = $('msrVeil');
    if (veil){
      veil.classList.toggle('msrShow', !!how);
      veil.classList.toggle('msrBlank', how === 'nothing');
    }
    if (!how) return;
    if (how === 'measured') A.measured();
    if (!veil) return;

    const stars = how === 'measured' ? Sc.stars(st.moves, st.par, st.aided) : 0;
    $('msrResult').textContent = how === 'measured' ? 'Measured' : 'No measure';
    $('msrWhy').textContent = how === 'measured'
      ? `${st.target} exactly, in ${st.moves} ${st.moves === 1 ? 'pour' : 'pours'}.`
      : `No sequence of pours puts ${st.target} in any of these vessels.`;
    $('msrStarsOut').innerHTML = [0, 1, 2]
      .map(i => (i < stars ? '★' : '<span class="msrDim">★</span>')).join('');

    /* Every one of these is a different thing to have happened and they are said
       differently, because "2 stars" with no reason attached reads as the game
       having lost count, and "unrated" with no reason attached reads as a fault. */
    const note = $('msrNote');
    if (how === 'nothing'){
      /* Only ever said when the search settled and found no route, which
         newBoard() now checks before it says it. Rare: make() walks the seed
         past the table until it finds a solvable bench, so reaching this means
         sixty in a row failed. */
      note.textContent = 'Nobody measured this bench, and it turns out it cannot be.';
    } else if (!st.rated){
      /* The tripwire in 25-search.js. Not "past the table": a bench past the
         table is still solved exactly here, because the whole state space fits
         in a millisecond. This is the search failing, which means something is
         wrong, and the run scores nothing rather than being flattered. */
      note.textContent = 'The search could not settle this bench, so it is unrated.';
    } else if (st.aided && stars === C.AID_CAP){
      note.textContent = 'Undo and hint both cap a run at two stars.';
    } else if (st.moves === st.par){
      note.textContent = 'The fewest pours there are.';
    } else {
      const best = st.best.get(st.level);
      note.textContent = `${st.moves - st.par} over the minimum of ${st.par}.`
        + (best != null && best < st.moves ? ` Your best here is ${best}.` : '');
    }

    /* Where the measured game ends. Said once, on the way past it, because a
       player who has just finished the fortieth bench and is handed a three-pour
       one has been given no way to tell that from the game falling over. What is
       past the table really is unvetted: pars there run 1 to 15 against a table
       ending at 20, so some of it is trivial. All of it is solvable, because
       make() will not deal a bench whose target cannot be reached. */
    const last = MeasurePars && MeasurePars.last;
    if (how === 'measured' && st.level === last){
      note.textContent += ' That is the last measured bench; past it they are unchecked.';
    }
    $('msrNext').textContent = how === 'measured' ? 'Next bench' : 'Another bench';
  }

  /* ---- boot ---- */
  let bound = false;
  function boot(){
    const cv = $('msrCanvas');
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

    /* pointerup rather than pointerdown, so a tap that started on a vessel and
       drifted onto the next one before it was lifted lands where it was let go.
       On a phone that difference is most of the mis-taps. */
    cv.addEventListener('pointerup', e => {
      A.unlock();
      tap(V.vesselAt(st.caps, V.screenToWorld(e.clientX, e.clientY)));
    });
    /* Nothing here scrolls or zooms, and letting the browser think otherwise
       costs a 300ms wait on every tap. */
    cv.addEventListener('pointerdown', e => e.preventDefault());

    const onClick = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    onClick('msrUndo', () => { A.unlock(); undo(); });
    onClick('msrHint', () => { A.unlock(); hint(); });
    /* Restart deals the same level again, because a level is a pure function of
       its number: there is no "another board of this difficulty" to offer, and
       pretending there is would hand out a board nobody measured. */
    onClick('msrRestart', () => { A.unlock(); newBoard(st.level); });
    onClick('msrNext', () => { A.unlock(); newBoard(st.level + 1); });
    onClick('msrSkip', () => { A.unlock(); newBoard(st.level + 1); });

    const sound = $('msrSound');
    if (sound){
      const paintSound = () => {
        sound.textContent = A.enabled ? 'Sound' : 'Muted';
        sound.setAttribute('aria-pressed', String(A.enabled));
        sound.classList.toggle('msrOff', !A.enabled);
      };
      sound.onclick = () => {
        A.unlock();
        A.setEnabled(!A.enabled);
        paintSound();
        /* say so, so the button proves itself the moment it is pressed */
        if (A.enabled) A.brim();
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

  return { boot, newBoard, tap, play, undo, hint, step, paintHud, _state: st };
})();

/* Booted on sight, because this page is nothing but this game. The other two
   check a data attribute because they are also loaded inside the pour game; this
   one is not wired into the graded run at all, and the check is kept anyway so
   that the day it is, nothing here deals a board behind somebody's map. */
if (document.body.dataset.only === 'measure'){
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', MeasureApp.boot);
  else MeasureApp.boot();
}
