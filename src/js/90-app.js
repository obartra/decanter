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
    MapView.render(progress);
    MapView.scrollToCurrent(!!scrollSmooth);
    paintMap();
  }
  function showGame(level){
    document.body.dataset.view = 'game';
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
    $('statPar').textContent = '…';
    SolverClient.solve(S.tubes, Levels.shape(level).colors, res => {
      if (id !== S.parRequest) return;
      S.par = res.par;
      S.parExact = !!res.exact;
      progress.rememberPar(level, res.par, res.exact);
      paintHud();
    });
  }
  const undoIsFree = () => S.undosUsed < CONFIG.economy.freeUndos;
  const undoPrice = () => (undoIsFree() ? 0 : CONFIG.economy.undoCost);

  function paintHud(){
    const busy = S.queue.length > 0 || S.running;
    const par = S.par == null ? '—' : (S.parExact ? S.par : '~' + S.par);
    $('statLevel').textContent = S.level;
    $('statMoves').textContent = S.moves;
    $('statPar').textContent = par;
    $('pourLabel').textContent = `Pours · Par ${par}`;
    $('statLeft').textContent = S.tubes.filter(t => t.length && !Rules.isFull(t)).length;
    $('movesStat').classList.toggle('over', S.par != null && S.moves > S.par);
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

    $('stars').innerHTML = [0,1,2].map(i => i < stars ? '★' : '<span class="dim">★</span>').join('');
    $('winTitle').textContent = perfect ? 'Poured clean' : 'Level cleared';
    const parLine = S.par == null
      ? ''
      : ` ${S.parExact ? 'The minimum is' : 'The best found is about'} ${S.par}.`;
    const bestLine = progress.bestFor(S.level) != null && progress.bestFor(S.level) < S.moves
      ? ` Your best here is ${progress.bestFor(S.level)}.` : '';
    $('winLine').textContent = `Sorted in ${S.moves} pours.${parLine}${bestLine}`;

    /* say where the gold came from, so the thin payouts read as earned */
    const parts = [`${stars}★`];
    if (result.firstClear) parts.push('first clear');
    $('goldEarned').textContent = `+${result.earned}`;
    $('goldWhy').textContent = `Gold · ${parts.join(' + ')}`;

    $('winHint').textContent = S.vesselUsed
      ? 'A bought vessel caps the run at two stars. Clear it unaided for the third.'
      : (perfect ? '' : 'Par or one over earns the third star.');
    $('retry').hidden = perfect;
    $('retry').classList.toggle('primary', !perfect);
    $('next').classList.toggle('primary', perfect);
    if (result.improvedStars && before > 0) $('winHint').textContent = 'New best for this level.';

    setTimeout(() => {
      Audio.win();
      Confetti.rain(CONFIG.palette.slice(0, Levels.shape(S.level).colors));
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
      bind();
      Audio.setEnabled(progress.sound);
      paintSound(progress.sound);
      showMap(false);
    },
    /* exposed for debugging in the console */
    _state: S, _progress: progress
  };
})();
globalThis.App = App;
document.addEventListener('DOMContentLoaded', () => App.boot());
