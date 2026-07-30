/* Glue: routing between the map and a level, the move queue, and the win flow. */
const App = (() => {
  const progress = Progress.createProgress();
  const S = {
    level: 1, tubes: [], moves: 0,
    history: [], queue: [], running: false,
    par: null, parExact: false, parRequest: 0
  };
  const $ = id => document.getElementById(id);

  /* ---------- routing ---------- */
  function showMap(scrollSmooth){
    document.body.dataset.view = 'map';
    MapView.render(progress);
    MapView.scrollToCurrent(!!scrollSmooth);
  }
  function showGame(level){
    document.body.dataset.view = 'game';
    start(level);
  }

  /* ---------- a level ---------- */
  function start(level){
    S.level = level;
    S.tubes = Levels.make(level);
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
  function paintHud(){
    $('statLevel').textContent = S.level;
    $('statMoves').textContent = S.moves;
    $('statPar').textContent = S.par == null ? '—' : (S.parExact ? S.par : '~' + S.par);
    $('statLeft').textContent = S.tubes.filter(t => t.length && !Rules.isFull(t)).length;
    $('movesStat').classList.toggle('over', S.par != null && S.moves > S.par);
    $('undo').disabled = !S.history.length || S.queue.length > 0 || S.running;
    $('restart').disabled = (!S.history.length && !S.moves) || S.queue.length > 0 || S.running;
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
    const stars = Rules.rate(S.moves, S.par, S.parExact);
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
    $('winHint').textContent = perfect ? '' : 'Match par to earn the third star.';
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
      const prev = S.history.pop();
      S.tubes = prev.tubes;
      S.moves = prev.moves;
      Board.view = Rules.clone(prev.tubes);
      Board.selected = null;
      Audio.drop();
      Board.render();
      paintHud();
    };
    $('restart').onclick = () => {
      if (S.queue.length || S.running) return;
      start(S.level);
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
