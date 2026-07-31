/* Glue: routing between the map and a level, the move queue, and the win flow. */
const App = (() => {
  const progress = Progress.createProgress();
  const S = {
    level: 1, tubes: [], moves: 0,
    history: [], queue: [], running: false,
    par: null, parExact: false, parRequest: 0,
    undosUsed: 0, vesselUsed: false
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
  function showGame(level){
    document.body.dataset.view = 'game';
    Backdrop.kind = 'cellar';
    start(level);
  }

  /* ---------- a level ---------- */
  /* Restarting keeps a vessel the player already paid for, so a restart cannot
     be used to launder the purchase back into a three-star run. Leaving the
     level and coming back deals a clean board, and costs the gold again. */
  function start(level, keepVessel){
    S.level = level;
    S.tubes = Levels.make(level);
    if (keepVessel) S.tubes.push([]);
    S.vesselUsed = !!keepVessel;
    S.undosUsed = 0;
    S.moves = 0;
    S.history = [];
    S.queue = [];
    S.running = false;
    /* the baked table is exact, and so is anything progress kept */
    S.par = PARS[level] ?? progress.parFor(level);
    S.parExact = S.par != null;
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
  /* how many more pours the current star tier can absorb */
  function sparePours(stars){
    if (S.par == null || !S.parExact || stars <= 0) return 0;
    const over = stars === 3 ? CONFIG.stars.three
               : stars === 2 ? CONFIG.stars.two
               : CONFIG.stars.one;
    return Math.max(0, S.par + over - S.moves);
  }

  const undoIsFree = () => S.undosUsed < CONFIG.economy.freeUndos;
  const undoPrice = () => (undoIsFree() ? 0 : CONFIG.economy.undoCost);

  function paintHud(){
    const busy = S.queue.length > 0 || S.running;
    const par = S.par == null ? '—' : (S.parExact ? S.par : '~' + S.par);
    $('statLevel').textContent = S.level;

    /* You start on three stars and spend them. Counting pours up tells you what
       you have done; counting down to the next star tells you what it will cost,
       which is the thing worth knowing while there is still a choice to make. */
    const stars = Rules.rate(S.moves, S.par, S.parExact, S.vesselUsed);
    $('statStars').innerHTML = [0,1,2]
      .map(i => (i < stars ? '★' : '<span class="dim">★</span>')).join('');
    $('movesStat').classList.toggle('over', stars <= 1);
    $('movesStat').classList.toggle('spent', stars === 0);

    const spare = sparePours(stars);
    $('pourLabel').textContent =
      S.par == null || !S.parExact ? `${S.moves} pours`
      : stars === 0 ? 'Too many pours'
      : spare > 0 ? `${spare} to spare`
      : 'Next pour costs a star';
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
  function tap(i){
    Audio.unlock();
    const sel = Board.selected;
    if (sel === null){
      if (!S.tubes[i].length || Rules.isFull(S.tubes[i])){ Board.nudge(i); Audio.deny(); return; }
      Board.selected = i;
      Board.el(i)?.classList.add('lifted');
      Audio.lift();
      return;
    }
    if (sel === i){
      Board.el(i)?.classList.remove('lifted');
      Board.selected = null;
      Audio.drop();
      return;
    }
    if (Rules.canPour(S.tubes, sel, i)){
      Board.el(sel)?.classList.remove('lifted');
      Board.selected = null;
      commit(sel, i);
    } else {
      Board.nudge(i);
      Audio.deny();
      Board.el(sel)?.classList.remove('lifted');
      Board.selected = null;
    }
  }
  function commit(from, to){
    const move = { from, to, n: Rules.pourAmount(S.tubes, from, to), color: S.tubes[from][S.tubes[from].length - 1] };
    S.history.push({ tubes: Rules.clone(S.tubes), moves: S.moves });
    Rules.applyMove(S.tubes, move);
    S.moves++;
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
    if (Rules.isSolved(S.tubes)) finish();
  }

  /* ---------- finishing ---------- */
  function finish(){
    const stars = Rules.rate(S.moves, S.par, S.parExact, S.vesselUsed);
    const before = progress.starsFor(S.level);
    const result = progress.complete(S.level, S.moves, stars);
    const perfect = stars === 3;
    const failed = stars === 0;

    $('stars').innerHTML = [0,1,2].map(i => i < stars ? '★' : '<span class="dim">★</span>').join('');
    $('winTitle').textContent = failed ? 'Too many pours' : perfect ? 'Poured clean' : 'Level cleared';
    const parLine = S.par == null
      ? ''
      : ` ${S.parExact ? 'The minimum is' : 'The best found is about'} ${S.par}.`;
    const bestLine = !failed && progress.bestFor(S.level) != null && progress.bestFor(S.level) < S.moves
      ? ` Your best here is ${progress.bestFor(S.level)}.` : '';
    $('winLine').textContent = `Sorted in ${S.moves} pours.${parLine}${bestLine}`;

    /* say where the gold came from, so the thin payouts read as earned */
    const parts = [`${stars}★`];
    if (result.firstClear) parts.push('first clear');
    $('goldEarned').textContent = `+${result.earned}`;
    $('goldWhy').textContent = failed ? 'No gold · run failed' : `Gold · ${parts.join(' + ')}`;

    /* A failed run banks nothing and does not open the next level, so the panel
       has to say so plainly and offer the only thing that helps: another go. */
    $('winHint').textContent = failed
      ? `Clear it in ${S.par + CONFIG.stars.one} or fewer.`
      : '';
    $('retry').hidden = perfect;
    $('retry').classList.toggle('primary', !perfect);
    $('next').hidden = failed && !progress.isUnlocked(S.level + 1);
    $('next').classList.toggle('primary', perfect);
    if (!failed && result.improvedStars && before > 0) $('winHint').textContent = 'New best for this level.';

    setTimeout(() => {
      if (failed){
        Audio.deny();
      } else {
        Audio.win();
        Confetti.rain(CONFIG.palette.slice(0, Levels.shape(S.level).colors));
      }
      $('veil').classList.add('show');
    }, 700);
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
      start(S.level, S.vesselUsed);
    };
    $('toMap').onclick = () => { Audio.tick(); showMap(false); };
    $('winMap').onclick = () => { $('veil').classList.remove('show'); showMap(true); };
    $('retry').onclick = () => { $('veil').classList.remove('show'); start(S.level); };
    $('next').onclick = () => { $('veil').classList.remove('show'); showGame(S.level + 1); };
    document.querySelectorAll('.js-sound').forEach(btn => {
      btn.onclick = () => {
        Audio.unlock();
        paintSound(Audio.toggle());
        progress.setSound(Audio.enabled);
        if (Audio.enabled) Audio.lift();
      };
    });
    $('mapPlay').onclick = () => { Audio.unlock(); showGame(progress.unlocked); };
    $('daily').onclick = () => {
      Audio.unlock();
      if (!progress.claimDaily(today())){ Audio.deny(); return; }
      Audio.lift();
      paintMap();
    };

    let rt;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (document.body.dataset.view === 'map') MapView.render(progress);
        else if (!S.running && !S.queue.length) Board.render();
      }, 120);
    });
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
