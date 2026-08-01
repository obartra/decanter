/* Glue: routing between the map and a level, the move queue, and the win flow. */
const App = (() => {
  const progress = Progress.createProgress();
  const S = {
    level: 1, tubes: [], moves: 0,
    history: [], queue: [], running: false,
    par: null, parExact: false, parRequest: 0,
    undosUsed: 0, vesselUsed: false, over: false, reason: null
  };
  const $ = id => document.getElementById(id);

  /* ---------- routing ---------- */
  /* The stylesheets colour bands with var(--cN), the pour and the particle sim
     read CONFIG.palette. Publishing one from the other keeps a single source:
     when the palette moved to jewel tones and the CSS did not, the sim poured
     the old colours into the new bottles. */
  function publishPalette(){
    const s = document.documentElement.style;
    CONFIG.palette.forEach((hex, i) => s.setProperty(`--c${i}`, hex));
  }

  /* A new build is waiting. Reloading is the only way to pick it up, but doing
     it under someone mid-pour would lose their level, so it waits for a moment
     that costs nothing: on the map, with nothing animating. Progress is saved
     per level, so nothing is lost by then. */
  let updatePending = false;
  /* a resize that arrived while the board was mid pour, applied once it lands */
  let missedResize = false;
  function takeUpdate(){
    if (!updatePending) return;
    if (document.body.dataset.view !== 'map') return;
    if (S.running || S.queue.length) return;
    location.reload();
  }

  /* local calendar day, so the draught refreshes on the player's midnight */
  function today(){
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function paintMap(){
    $('mapGold').textContent = progress.gold;
    const ready = progress.dailyReady(today());
    $('daily').disabled = !ready;
    $('dailyCost').textContent = ready ? `+${CONFIG.economy.daily}` : 'drawn';
    /* a board costs gold to deal, so the map has to say so and stop offering one
       that cannot be paid for */
    const fee = CONFIG.economy.attempt;
    $('playCost').textContent = fee;
    $('mapPlay').disabled = !progress.canAfford(fee);
  }
  function showMap(scrollSmooth){
    document.body.dataset.view = 'map';
    Backdrop.kind = 'moss';
    Backdrop.setShelf(null);
    MapView.render(progress);
    MapView.scrollToCurrent(!!scrollSmooth);
    paintMap();
    takeUpdate();
  }
  /* Every board dealt is paid for, whether it is a new level or another go at
     one just lost. Charging here rather than inside start() keeps the internal
     re-deals free: only a deliberate attempt costs. */
  function attempt(level, keepVessel){
    if (!progress.spend(CONFIG.economy.attempt)){ Audio.deny(); paintMap(); return false; }
    document.body.dataset.view = 'game';
    Backdrop.kind = 'cellar';
    start(level, keepVessel);
    return true;
  }
  function showGame(level){ attempt(level); }
  const skipCost = () => CONFIG.economy.attempt * CONFIG.economy.skipMultiple;

  /* ---------- a level ---------- */
  /* A restart deals the level from scratch, and that includes the extra bottle:
     restarting is starting again, and a board that quietly keeps a vessel is not
     the board the level is. The purchase is not refunded, because a restart is
     not an undo. Nothing is laundered by this either, since a run that ever had
     a vessel is capped at two stars whether or not it still has one. */
  function start(level, keepVessel){
    S.level = level;
    S.tubes = Levels.make(level);
    if (keepVessel) S.tubes.push([]);
    S.vesselUsed = !!keepVessel;
    S.undosUsed = 0;
    S.over = false;
    S.reason = null;
    S.moves = 0;
    S.history = [];
    S.queue = [];
    S.running = false;
    /* the baked table is exact, and so is anything progress kept */
    S.par = PARS[level] ?? progress.parFor(level);
    S.parExact = S.par != null;
    /* A par belongs to a particular board. minPours can never overstate the work
       a board has left, so a par below it cannot be this board's, and scoring
       against it would hand out three stars and a payout for a run that never
       happened. Refuse the number rather than the run: an unknown par shows a
       tilde and decides nothing. */
    if (S.parExact && S.par < Rules.minPours(S.tubes)){
      S.par = null;
      S.parExact = false;
    }
    Board.view = Rules.clone(S.tubes);
    Board.selected = null;
    $('veil').classList.remove('show');
    Board.render();
    paintHud();
    if (S.par == null) askPar();
  }
  function askPar(){
    const id = ++S.parRequest;
    const level = S.level;
    $('pourLabel').textContent = 'Reading the board…';
    SolverClient.solve(S.tubes, Levels.shape(level).colors, res => {
      if (id !== S.parRequest) return;
      S.par = res.par;
      S.parExact = !!res.exact;
      progress.rememberPar(level, res.par, res.exact);
      paintHud();
    });
  }
  const poursLeft = () => Rules.poursLeft(S.moves, S.par, S.parExact);

  const undoIsFree = () => S.undosUsed < CONFIG.economy.freeUndos;
  const undoPrice = () => (undoIsFree() ? 0 : CONFIG.economy.undoCost);

  function paintHud(){
    const busy = S.queue.length > 0 || S.running;
    $('statLevel').textContent = S.level;

    /* You start on three stars and spend them, so the stars say what the run is
       still worth while the count says how much of it is left. */
    const stars = Rules.rate(S.moves, S.par, S.parExact, S.vesselUsed);
    $('statStars').innerHTML = [0,1,2]
      .map(i => (i < stars ? '★' : '<span class="dim">★</span>')).join('');
    $('movesStat').classList.toggle('over', stars <= 1);
    $('movesStat').classList.toggle('spent', stars === 0);

    /* One falling number rather than a count of what has been spent. It is the
       number that ends the run, and past par it is also the star count, so the
       two read as the same thing running out. */
    const left = poursLeft();
    $('statLeft').textContent = left == null ? S.moves : left;
    $('pourLabel').textContent =
      left == null ? 'pours made'
      : left === 0 ? 'no pours left'
      : left === 1 ? 'last pour'
      : 'pours left';
    $('gold').textContent = progress.gold;

    const freeLeft = Math.max(0, CONFIG.economy.freeUndos - S.undosUsed);
    $('undoCost').textContent = freeLeft ? `${freeLeft} free` : `${CONFIG.economy.undoCost}`;
    $('undo').disabled = !S.history.length || busy ||
      (!undoIsFree() && !progress.canAfford(CONFIG.economy.undoCost));

    $('vesselCost').textContent = CONFIG.economy.vessel;
    $('vessel').disabled = busy || S.vesselUsed || !progress.canAfford(CONFIG.economy.vessel);
    $('vessel').classList.toggle('spent', S.vesselUsed);

    $('restart').disabled = (!S.history.length && !S.moves) || busy;
  }

  /* ---------- input ---------- */
  /* Logic resolves on tap. Animation trails behind in a queue, so a player can
     keep pouring without waiting for the bottle to finish tipping. */
  /* a bottle worth picking up: it has something in it and is not already done */
  const canLift = i => S.tubes[i].length > 0 && !Rules.isFull(S.tubes[i]);

  function lift(i){
    Board.selected = i;
    Board.el(i)?.classList.add('lifted');
    Audio.lift();
  }
  function drop(){
    if (Board.selected != null) Board.el(Board.selected)?.classList.remove('lifted');
    Board.selected = null;
  }

  function tap(i){
    if (S.over) return;                 /* the run is decided; stop taking pours */
    Audio.unlock();
    const sel = Board.selected;
    if (sel === null){
      if (!canLift(i)){ Board.nudge(i); Audio.deny(); return; }
      lift(i);
      return;
    }
    if (sel === i){ drop(); Audio.drop(); return; }
    if (Rules.canPour(S.tubes, sel, i)){
      drop();
      commit(sel, i);
      return;
    }
    /* The pour will not go: the target is full, or finished, or the colours do
       not meet. Rather than making the player tap twice to put one bottle down
       and pick the next one up, the tap is taken as picking that one up, which
       is what someone reaching for it meant. Only if it is not worth picking up
       does the selection simply end. */
    drop();
    if (canLift(i)){ lift(i); return; }
    Board.nudge(i);
    Audio.deny();
  }
  function commit(from, to){
    const move = { from, to, n: Rules.pourAmount(S.tubes, from, to), color: S.tubes[from][S.tubes[from].length - 1] };
    S.history.push({ tubes: Rules.clone(S.tubes), moves: S.moves });
    Rules.applyMove(S.tubes, move);
    S.moves++;
    /* Decided here, not when the queue happens to empty. Pouring quickly keeps
       the queue full, and a check that waits for it to drain lets the run carry
       on well past the pour that already lost it. */
    const why = Rules.lostBecause(S.tubes, S.moves, S.par, S.parExact);
    if (why){ S.over = true; S.reason = why; }
    S.queue.push(move);
    paintHud();
    drain().catch(() => {});   /* drain's finally has already restored the state */
  }
  /* The view trails the logic here, so this loop owes the player two things: it
     must always let go of `running`, and it must always leave the view where the
     logic already is. Undo and Restart are disabled while a pour is in flight,
     so a drain that dies halfway strands the level with no way out but a reload. */
  async function drain(){
    if (S.running) return;
    S.running = true;
    try {
      while (S.queue.length){
        const move = S.queue.shift();
        try {
          await Board.animate(move);
        } catch {
          /* a dropped animation still owes the board its result */
        }
        Rules.applyMove(Board.view, move);
        Board.render();
        if (Rules.isFull(Board.view[move.to])) Board.seal(move.to);
      }
    } finally {
      S.running = false;
      paintHud();
    }
    /* the pours have landed, so a resize held back during them can be applied */
    if (missedResize){
      missedResize = false;
      try { Board.render(); } catch { /* a failed redraw must not eat the result */ }
    }
    /* the board has stopped moving, so whatever was decided can now be shown */
    if (Rules.isSolved(S.tubes) || S.over) finish();
  }

  /* ---------- finishing ---------- */
  function finish(){
    const stars = Rules.rate(S.moves, S.par, S.parExact, S.vesselUsed);
    const before = progress.starsFor(S.level);
    const result = progress.complete(S.level, S.moves, stars);
    const perfect = stars === 3;
    const failed = stars === 0;

    $('stars').innerHTML = [0,1,2].map(i => i < stars ? '★' : '<span class="dim">★</span>').join('');

    /* say where the gold came from, so the thin payouts read as earned */
    const parts = [`${stars}★`];
    if (result.firstClear) parts.push('first clear');
    $('goldEarned').textContent = `+${result.earned}`;
    $('goldWhy').textContent = failed ? 'No gold · run failed' : `Gold · ${parts.join(' + ')}`;

    const fee = CONFIG.economy.attempt;
    const panel = Panel.decide({
      level: S.level, lastLevel: progress.lastLevel, failed, stars,
      nextUnlocked: progress.isUnlocked(S.level + 1),
      canPayFee: progress.canAfford(fee), canPaySkip: progress.canAfford(skipCost()),
      improvedStars: result.improvedStars, hadStars: before,
      par: S.par, parExact: S.parExact, moves: S.moves, best: progress.bestFor(S.level),
      totalStars: progress.totalStars(), reason: S.reason
    });
    $('winTitle').textContent = panel.title;
    $('winLine').textContent = panel.line;

    $('veil').classList.toggle('failed', failed);
    $('retry').hidden = panel.retryHidden;
    $('retry').innerHTML = panel.retryHidden ? 'Retry' : `Try again<small>${fee} &#9670;</small>`;
    $('retry').classList.toggle('priced', true);
    $('retry').classList.toggle('primary', panel.retryPrimary);
    $('retry').disabled = panel.retryDisabled;
    $('next').hidden = panel.nextHidden;
    $('next').classList.toggle('primary', panel.nextPrimary);
    $('next').disabled = panel.nextDisabled;
    /* Beaten by a board is not the same as stuck on it. Paying past it opens the
       next one and deals it, so a level nobody can crack is a decision with a
       price rather than a wall. */
    $('skip').hidden = panel.skipHidden;
    $('skipCost').textContent = skipCost();
    $('skip').disabled = panel.skipDisabled;
    $('winHint').textContent = panel.hint;

    setTimeout(() => {
      if (failed){
        Audio.deny();
        Board.nudge(S.level % Math.max(1, S.tubes.length));   /* the shelf takes it too */
      } else {
        Audio.win();
        Confetti.rain(CONFIG.palette.slice(0, Levels.shape(S.level).colors));
      }
      $('veil').classList.add('show');
    }, failed ? 260 : 700);
  }

  /* ---------- wiring ---------- */
  function paintSound(on){
    document.querySelectorAll('.js-sound').forEach(b => {
      b.textContent = on ? 'Sound on' : 'Sound off';
      b.classList.toggle('off', !on);
    });
  }
  function bind(){
    Board.mount($('board'));
    Board.onTap = tap;
    MapView.mount($('mapScroll'));
    MapView.onPick = level => { Audio.unlock(); Audio.tick(); showGame(level); };
    /* Paying past a board from the map opens the next one and nothing else: no
       stars, no best, and the first-clear bonus stays unclaimed, so coming back
       and actually beating it still pays what it always would have. */
    MapView.onBuy = level => {
      Audio.unlock();
      if (!progress.buyUnlock(level - 1, skipCost())){ Audio.deny(); return; }
      Audio.tick();
      paintMap();
      MapView.render(progress);
    };

    $('undo').onclick = () => {
      if (S.queue.length || S.running || !S.history.length) return;
      /* charge before rolling back, so a refused payment changes nothing */
      if (!undoIsFree() && !progress.spend(CONFIG.economy.undoCost)){ Audio.deny(); return; }
      S.undosUsed++;
      const prev = S.history.pop();
      S.tubes = prev.tubes;
      S.moves = prev.moves;
      Board.view = Rules.clone(prev.tubes);
      Board.selected = null;
      Audio.drop();
      Board.render();
      paintHud();
    };
    $('vessel').onclick = () => {
      if (S.queue.length || S.running || S.vesselUsed) return;
      if (!progress.spend(CONFIG.economy.vessel)){ Audio.deny(); return; }
      S.vesselUsed = true;
      S.tubes.push([]);
      Board.view.push([]);
      /* the shelf changed shape, so the snapshots behind us no longer describe
         this board and undoing into one would quietly take the vessel back */
      S.history = [];
      Board.selected = null;
      Audio.lift();
      Board.render();
      paintHud();
    };
    $('restart').onclick = () => {
      if (S.queue.length || S.running) return;
      attempt(S.level);
    };
    $('toMap').onclick = () => { Audio.tick(); showMap(false); };
    const closePanel = () => {
      $('veil').classList.remove('show');
      $('veil').classList.remove('failed');
      showMap(true);
    };
    $('winMap').onclick = closePanel;
    /* Tapping the dark outside the panel does what the panel's own way out does.
       Only the backdrop itself counts, so a tap that lands on the panel or on a
       button inside it is not a tap outside. */
    $('veil').addEventListener('click', e => {
      if (e.target === $('veil')) closePanel();
    });
    $('retry').onclick = () => {
      if (!progress.canAfford(CONFIG.economy.attempt)){ Audio.deny(); return; }
      $('veil').classList.remove('show');
      $('veil').classList.remove('failed');
      attempt(S.level);
    };
    $('skip').onclick = () => {
      if (!progress.buyUnlock(S.level, skipCost())){ Audio.deny(); return; }
      $('veil').classList.remove('show', 'failed');
      /* the fee covered the board too, so this deals it without charging again */
      document.body.dataset.view = 'game';
      Backdrop.kind = 'cellar';
      start(Math.min(S.level + 1, progress.lastLevel));
    };
    $('next').onclick = () => {
      if (S.level >= progress.lastLevel){ Audio.deny(); return; }
      if (!progress.canAfford(CONFIG.economy.attempt)){ Audio.deny(); return; }
      $('veil').classList.remove('show');
      showGame(S.level + 1);
    };
    document.querySelectorAll('.js-sound').forEach(btn => {
      btn.onclick = () => {
        Audio.unlock();
        paintSound(Audio.toggle());
        progress.setSound(Audio.enabled);
        if (Audio.enabled) Audio.lift();
      };
    });
    $('mapPlay').onclick = () => { Audio.unlock(); showGame(Math.min(progress.unlocked, progress.lastLevel)); };
    $('daily').onclick = () => {
      Audio.unlock();
      if (!progress.claimDaily(today())){ Audio.deny(); return; }
      Audio.lift();
      paintMap();
    };

    /* A resize while a pour is in flight cannot rebuild the board: render() wipes
       the bottles and would strand the animation mid air. Dropping it is worse
       though, because nothing brings it back: the glass re-centres by itself in
       CSS while the liquid keeps the geometry it measured before, so the two come
       apart and stay apart. So remember it and apply it once the pours land. */
    let rt;
    const relayout = () => {
      if (document.body.dataset.view === 'map') MapView.render(progress);
      else Board.render();
    };
    const onResize = () => {
      if (document.body.dataset.view !== 'map' && (S.running || S.queue.length)){
        missedResize = true;
        return;
      }
      relayout();
    };
    const scheduleResize = () => { clearTimeout(rt); rt = setTimeout(onResize, 120); };
    addEventListener('resize', scheduleResize);
    /* some browsers rotate without firing resize */
    addEventListener('orientationchange', scheduleResize);
    addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.body.dataset.view === 'game') showMap(false);
    });
  }
  return {
    boot(){
      publishPalette();
      Backdrop.mount();
      bind();
      Audio.setEnabled(progress.sound);
      paintSound(progress.sound);
      showMap(false);
    },
    /* a newer build has taken over the page */
    updateReady(){ updatePending = true; takeUpdate(); },
    /* exposed for debugging in the console */
    _state: S, _progress: progress
  };
})();
globalThis.App = App;
document.addEventListener('DOMContentLoaded', () => App.boot());
