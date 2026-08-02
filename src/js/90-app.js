/* Glue: routing between the map and a level, the move queue, and the win flow. */
const App = (() => {
  const progress = Progress.createProgress();
  const S = {
    level: 1, tubes: [], moves: 0,
    history: [], queue: [], running: false,
    par: null, parExact: false, parRequest: 0,
    undosUsed: 0, hintsUsed: 0, vesselUsed: false, over: false, reason: null, hinting: false
  };
  const $ = id => document.getElementById(id);

  /* Every refusal in this file goes through here.

     A refused action is a tap that does nothing, and a tap that does nothing is
     what gets reported: the deny sound is the only thing that marks it, and a
     player with sound off does not get even that. Recording the reason alongside
     the sound is what turns "level 15 did nothing" into "level 15 cost 5 and the
     purse held 4" without anyone having to guess. */
  function deny(what, why){
    Trace.refused(what, why);
    progress.recordRefusal(what);
    Audio.deny();
  }

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
    /* "Drawn" said the draught was gone without saying it was coming back, which
       on the one screen a player with nothing left has to look at is the wrong
       half of the sentence. The wait says when, so waiting is a decision rather
       than a dead end, and it runs itself down: when it reaches the local
       midnight, the same repaint finds the draught ready and offers it. */
    $('dailyCost').textContent = ready
      ? `+${CONFIG.economy.daily}`
      : Progress.briefly(Progress.untilNextDay(new Date()));
    /* a board costs gold to deal, so the map has to say so and stop offering one
       that cannot be paid for. A level already beaten is free, and says free
       rather than showing a nought nobody has to think about. */
    const fee = costOf(progress.unlocked);
    $('playCost').textContent = fee > 0 ? fee : 'free';
    $('mapPlay').disabled = !progress.canAfford(fee);
    /* A purse that cannot deal the next board is not the end of the game, it is
       a day's wait, and the draught is the only way through it. So when nothing
       else on this screen can be pressed, it is the thing being offered. */
    $('daily').classList.toggle('primary', ready && !progress.canAfford(fee));
  }
  /* Gold moved while the map is up.

     The purse is what decides which boards can be dealt, so the medallions are
     stale the moment it changes: repainting the footer alone leaves a level
     looking unplayable, or worse, looking playable, until something else happens
     to redraw them. Every place that moves gold on this screen goes through
     here, so there is one thing to remember rather than three. */
  function goldChanged(){
    paintMap();
    MapView.render(progress);
  }
  function showMap(scrollSmooth){
    Trace.note('to the map');
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
    if (!progress.spend(costOf(level))){
      deny('attempt', `level ${level} costs ${costOf(level)}, purse holds ${progress.gold}`);
      paintMap();
      return false;
    }
    Trace.note(`dealt level ${level}`, `paid ${costOf(level)}, purse now ${progress.gold}`);
    document.body.dataset.view = 'game';
    Backdrop.kind = 'cellar';
    start(level, keepVessel);
    openChapter(level);
    return true;
  }

  /* The opening of a chapter, once. Shown after the board is dealt rather than
     instead of it, so what it is talking about is already behind the card. */
  function openChapter(level){
    const section = Levels.sectionOf(level);
    const chapter = Chapters.at(section);
    if (!chapter || progress.hasSeen(section)) return;
    progress.markSeen(section);
    $('chapterNum').textContent = section + 1;
    $('chapterName').textContent = Levels.sectionName(level);
    $('chapterBlurb').textContent = chapter.blurb;
    const grant = Chapters.GRANT_NAMES[chapter.grant];
    $('chapterGrant').hidden = !grant;
    $('chapterGrant').textContent = grant ? `Unlocked · ${grant}` : '';
    $('chapterVeil').style.setProperty('--tint', Levels.sectionTint(level));
    $('chapterVeil').classList.add('show');
    /* The opening covers the board and only goes away when it is dismissed, so
       a report of a level that did nothing has to be able to say whether this
       was over it at the time. */
    Trace.note(`chapter ${section + 1} opening`, Levels.sectionName(level));
  }
  function showGame(level){ attempt(level); }
  const skipCost = () => CONFIG.economy.attempt * CONFIG.economy.skipMultiple;
  /* what this particular board costs to deal: nothing if it is already beaten */
  const costOf = level => (progress.starsFor(level) > 0
    ? CONFIG.economy.replay : CONFIG.economy.attempt);
  /* the first hint of a run can be free, once a chapter has said so */
  const hintCost = () => (S.hintsUsed < progress.perks().freeHints ? 0 : progress.perks().hintCost);

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
    S.hintsUsed = 0;
    S.over = false;
    S.reason = null;
    S.hinting = false;
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

  const undoIsFree = () => S.undosUsed < progress.perks().freeUndos;

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

    const freeLeft = Math.max(0, progress.perks().freeUndos - S.undosUsed);
    $('undoCost').textContent = freeLeft ? `${freeLeft} free` : `${CONFIG.economy.undoCost}`;
    $('undo').disabled = !S.history.length || busy ||
      (!undoIsFree() && !progress.canAfford(CONFIG.economy.undoCost));

    $('vesselCost').textContent = CONFIG.economy.vessel;
    $('vessel').disabled = busy || S.vesselUsed || !progress.canAfford(CONFIG.economy.vessel);
    $('vessel').classList.toggle('spent', S.vesselUsed);

    /* A restart deals the board again and is charged for like any other deal, so
       a purse that cannot cover it must not be offered the button. Left live it
       is the same dead tap the map used to have, and the end-of-run panel already
       disables Try again for exactly this reason. */
    $('restart').disabled = (!S.history.length && !S.moves) || busy
      || !progress.canAfford(costOf(S.level));

    /* Tools arrive a chapter at a time, so one that has not been granted yet is
       not there at all. Showing it disabled would advertise something the player
       cannot act on and cannot find out how to get. */
    const perks = progress.perks();
    const hintFee = hintCost();
    $('undo').hidden = !perks.undo;
    $('vessel').hidden = !perks.vessel;
    $('hint').hidden = !perks.hint;
    $('hintCost').textContent = hintFee > 0 ? hintFee : 'free';
    $('hint').disabled = busy || S.over || S.hinting || !progress.canAfford(hintFee);
    $('hint').classList.toggle('spent', S.hinting);
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
      if (!canLift(i)){ Board.nudge(i); deny('lift', `bottle ${i} is empty or finished`); return; }
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
    deny('pour', `${sel} into ${i} is not a pour the rules allow`);
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
    /* Nothing scores unless the board is actually finished. rate() answers "how
       well was this played", counting pours against par, and it has no idea
       whether the bottles are sorted. A run that ends because it was lost ends
       on a low pour count by definition, so asking rate() about it gets three
       stars for a board that was nowhere near done. */
    const solved = Rules.isSolved(S.tubes);
    const stars = solved ? Rules.rate(S.moves, S.par, S.parExact, S.vesselUsed) : 0;
    const before = progress.starsFor(S.level);
    const result = progress.complete(S.level, S.moves, stars);
    const failed = stars === 0;

    $('stars').innerHTML = [0,1,2].map(i => i < stars ? '★' : '<span class="dim">★</span>').join('');

    /* say where the gold came from, so the thin payouts read as earned */
    const parts = [`${stars}★`];
    if (result.firstClear) parts.push('first clear');
    $('goldEarned').textContent = `+${result.earned}`;
    $('goldWhy').textContent = failed ? 'No gold · run failed' : `Gold · ${parts.join(' + ')}`;

    const fee = costOf(S.level);
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
    $('retry').innerHTML = panel.retryHidden ? 'Retry'
      : fee > 0 ? `Try again<small>${fee} &#9670;</small>` : 'Try again<small>free</small>';
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
    /* the map shows what a board costs, and this is where that is decided */
    MapView.feeFor = costOf;
    MapView.onPick = level => { Audio.unlock(); Audio.tick(); showGame(level); };
    /* Paying past a board from the map opens the next one and nothing else: no
       stars, no best, and the first-clear bonus stays unclaimed, so coming back
       and actually beating it still pays what it always would have. */
    MapView.onBuy = level => {
      Audio.unlock();
      if (!progress.buyUnlock(level - 1, skipCost())){
        deny('buy', `opening ${level} costs ${skipCost()}, purse holds ${progress.gold}`);
        return;
      }
      Audio.tick();
      goldChanged();
    };

    $('undo').onclick = () => {
      if (S.queue.length || S.running || !S.history.length) return;
      /* charge before rolling back, so a refused payment changes nothing */
      if (!undoIsFree() && !progress.spend(CONFIG.economy.undoCost)){
        deny('undo', `costs ${CONFIG.economy.undoCost}, purse holds ${progress.gold}`);
        return;
      }
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
      if (!progress.spend(CONFIG.economy.vessel)){
        deny('vessel', `costs ${CONFIG.economy.vessel}, purse holds ${progress.gold}`);
        return;
      }
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
    /* The search runs on the board as it stands, not on the level, so a hint is
       still the best move after a run has gone wrong. Nothing is charged until
       there is a move to show: a search that gives up owes the player nothing. */
    $('hint').onclick = () => {
      if (S.queue.length || S.running || S.over || S.hinting) return;
      if (!progress.canAfford(hintCost())){
        deny('hint', `costs ${hintCost()}, purse holds ${progress.gold}`);
        return;
      }
      Audio.unlock();
      S.hinting = true;
      paintHud();
      const level = S.level, moves = S.moves;
      SolverClient.solve(S.tubes, Levels.shape(level).colors, res => {
        S.hinting = false;
        /* the board moved on while the search ran, so the answer is about a
           position that is no longer in front of anyone */
        if (level !== S.level || moves !== S.moves){ paintHud(); return; }
        if (!res.first || !progress.spend(hintCost())){
          deny('hint', res.first ? `costs ${hintCost()}, purse holds ${progress.gold}` : 'the search found no move');
          paintHud();
          return;
        }
        S.hintsUsed++;
        Board.showHint(res.first[0], res.first[1]);
        Audio.lift();
        paintHud();
      });
    };
    $('toMap').onclick = () => { Audio.tick(); showMap(false); };
    const closePanel = () => {
      $('veil').classList.remove('show');
      $('veil').classList.remove('failed');
      showMap(true);
    };
    $('chapterGo').onclick = () => {
      Audio.unlock(); Audio.tick();
      $('chapterVeil').classList.remove('show');
      Trace.note('chapter opening read');
      paintHud();
    };
    $('chapterVeil').addEventListener('click', e => {
      if (e.target === $('chapterVeil')) $('chapterGo').click();
    });
    $('winMap').onclick = closePanel;
    /* Look at the board the run ended on. Available however it ended, because
       wanting to see what you were left with is not a thing only winners do.
       The board is read only while it is being looked at: the run is over, and
       a stray tap should not be able to pour into a finished level. */
    $('peek').onclick = () => {
      $('veil').classList.remove('show');
      document.body.classList.add('peeking');
      /* On the next tick, so the press that opened this does not also close it.

         Restored on the click rather than on the pointerdown, and that is the
         whole trick. One press is a pointerdown, then a pointerup, then a
         click. Restoring on the pointerdown puts the panel back underneath a
         click that has not happened yet, and the panel closes when clicked
         outside itself, so the gesture would open it and shut it again. On the
         click there is nothing left of the gesture to misread, and the event's
         target was settled before the panel returned, so the panel's own
         backdrop handler is not even on its path.

         Captured on the document because while the board is being read almost
         everything ignores pointers, so which element the press lands on
         depends on what happens to be underneath it. */
      setTimeout(() => {
        const back = e => {
          document.removeEventListener('click', back, true);
          document.removeEventListener('keydown', back, true);
          if (e) e.stopPropagation();
          document.body.classList.remove('peeking');
          $('veil').classList.add('show');
        };
        document.addEventListener('click', back, true);
        document.addEventListener('keydown', back, true);
      }, 0);
    };
    /* Tapping the dark outside the panel does what the panel's own way out does.
       Only the backdrop itself counts, so a tap that lands on the panel or on a
       button inside it is not a tap outside. */
    $('veil').addEventListener('click', e => {
      if (e.target === $('veil')) closePanel();
    });
    $('retry').onclick = () => {
      if (!progress.canAfford(costOf(S.level))){
        deny('retry', `costs ${costOf(S.level)}, purse holds ${progress.gold}`);
        return;
      }
      $('veil').classList.remove('show');
      $('veil').classList.remove('failed');
      attempt(S.level);
    };
    $('skip').onclick = () => {
      if (!progress.buyUnlock(S.level, skipCost())){
        deny('skip', `costs ${skipCost()}, purse holds ${progress.gold}`);
        return;
      }
      $('veil').classList.remove('show', 'failed');
      /* the fee covered the board too, so this deals it without charging again */
      document.body.dataset.view = 'game';
      Backdrop.kind = 'cellar';
      start(Math.min(S.level + 1, progress.lastLevel));
    };
    $('next').onclick = () => {
      if (S.level >= progress.lastLevel){ deny('next', 'that was the last graded level'); return; }
      if (!progress.canAfford(costOf(S.level + 1))){
        deny('next', `level ${S.level + 1} costs ${costOf(S.level + 1)}, purse holds ${progress.gold}`);
        return;
      }
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
      if (!progress.claimDaily(today())){ deny('daily', 'already drawn today'); return; }
      Audio.lift();
      goldChanged();
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
  /* Gold handed over rather than earned, for a beta player who has run dry in
     the middle of telling us about something else. The word is in the query
     string; it is spent out of the URL as well as into the purse, so pasting the
     link again is the only way to get it twice, and a screenshot of the game
     afterwards does not carry it.

     It arrives with a flash on the purse. A cheat that silently changed a number
     would be its own small version of the bug this branch is about. */
  function takeGift(){
    let url;
    try { url = new URL(location.href); } catch (e) { return; }
    if (!url.searchParams.has(CONFIG.beta.word)) return;
    const gold = progress.grant(CONFIG.beta.gold);
    url.searchParams.delete(CONFIG.beta.word);
    try {
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) { /* a page opened from a file has no history to rewrite */ }
    Trace.note('purse topped up', `+${gold} from the query string`);
    goldChanged();
    whenItCanBeHeard(jabariMode);
  }

  /* The bang is the point, and a page nobody has touched yet is not allowed to
     make one: the audio context stays suspended until a gesture, so firing this
     on load would play it to an empty room. The gold is already in the purse
     either way — only the fanfare waits, and only when there is a sound to wait
     for. With sound off there is nothing to miss, so it goes off at once. */
  function whenItCanBeHeard(run){
    Audio.unlock();
    if (!Audio.enabled || Audio.ready){ run(); return; }
    const go = () => {
      document.removeEventListener('pointerdown', go, true);
      document.removeEventListener('keydown', go, true);
      Audio.unlock();
      run();
    };
    document.addEventListener('pointerdown', go, true);
    document.addEventListener('keydown', go, true);
  }

  /* It goes off, it says what it is, and it takes itself away. Cleared on a
     timer rather than on the animation ending, because reduced motion collapses
     the animation to nothing and there would be no end to wait for. */
  /* Not the game's palette. That one was chosen so no two liquids are close to
     the eye on a dark shelf; this is chosen to be as loud as a screen goes. */
  const JABARI_COLOURS = ['#FF3DDA','#FF2D2D','#FF8A1E','#FFE04A','#5BFF5F','#3DF2FF','#7A5BFF','#FFFFFF'];

  function jabariMode(){
    const el = $('jabari');
    $('jabariGold').textContent = `+${CONFIG.beta.gold.toLocaleString('en-US')}`;
    el.hidden = false;
    /* forced out of the frame that unhid it, or the animation never starts */
    void el.offsetWidth;
    el.classList.add('go');

    /* three bangs rather than one, because one is a sound effect and three is a
       point being made */
    Audio.boom();
    Audio.boom(0.19);
    Audio.boom(0.44);

    /* Thrown against the short side of the screen, not the long one. Scaled off
       the height, a phone flings most of the paper out of frame before anyone
       sees it: the first pass measured particles six hundred pixels left of a
       screen three hundred and ninety wide. */
    const reach = Math.min(innerWidth, innerHeight) * 0.5;
    const throwPaper = () => Confetti.blast(innerWidth / 2, innerHeight / 2, 110, JABARI_COLOURS, reach);
    throwPaper();
    setTimeout(throwPaper, 190);
    setTimeout(throwPaper, 440);
    setTimeout(throwPaper, 900);

    /* and the number it was all about, once the word is out of the way */
    const purse = document.querySelector('#mapView .purse');
    if (purse){
      setTimeout(() => {
        purse.classList.add('granted');
        setTimeout(() => purse.classList.remove('granted'), 1400);
      }, 2100);
    }
    setTimeout(() => {
      el.classList.remove('go');
      el.hidden = true;
    }, 3100);
  }

  /* An exception inside a click handler is the quietest failure the game has:
     the handler stops, the screen stays exactly as it was, and what the player
     sees is a button that does nothing. Nothing here tries to recover — the
     state is already whatever the half-run handler left — it only makes sure the
     failure leaves a mark instead of none at all. */
  function watchForFaults(){
    addEventListener('error', e => {
      Trace.fault(e.filename ? `${e.filename}:${e.lineno}` : 'page', e.message || e.error);
      progress.recordFault(e.message || String(e.error));
    });
    addEventListener('unhandledrejection', e => {
      Trace.fault('a promise', e.reason);
      progress.recordFault(e.reason && e.reason.message ? e.reason.message : String(e.reason));
    });
  }

  return {
    boot(){
      watchForFaults();
      Trace.note('booted', `unlocked ${progress.unlocked}, purse ${progress.gold}`);
      publishPalette();
      Backdrop.mount();
      bind();
      Diagnostics.source = () => ({ progress, state: S });
      Diagnostics.mount();
      Audio.setEnabled(progress.sound);
      paintSound(progress.sound);
      showMap(false);
      takeGift();
      /* The wait on the draught has to run down on its own, or it is a stale
         number that only corrects itself when something else happens to repaint.
         Every half minute is enough for something measured in minutes, and it
         only touches the screen the player is actually looking at. */
      setInterval(() => {
        if (document.body.dataset.view === 'map') paintMap();
      }, 30_000);
    },
    /* a newer build has taken over the page */
    updateReady(){ updatePending = true; takeUpdate(); },
    /* exposed for debugging in the console */
    _state: S, _progress: progress
  };
})();
globalThis.App = App;
document.addEventListener('DOMContentLoaded', () => App.boot());
