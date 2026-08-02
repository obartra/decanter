/* Glue: routing between the map and a level, the move queue, and the win flow. */
const App = (() => {
  const progress = Progress.createProgress();
  const S = {
    level: 1, tubes: [], moves: 0,
    history: [], queue: [], running: false,
    par: null, parExact: false, parRequest: 0,
    undosUsed: 0, hintsUsed: 0, vesselUsed: false, over: false, finished: false, reason: null, hinting: false, saying: null
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
    if (Levels.isBubble(level)){
      startBubble(level);
      openChapter(level);
      return true;
    }
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

  /* ---------- the other game ----------

     Some levels are the bubble game. It is booted once, the first time one is
     opened, because mounting a canvas and dealing a board on every page view
     costs something and most views never reach one.

     The board is dealt from the level number, so level 14 is the same board for
     everyone the same way every pour level is. */
  let bubbleReady = false;
  function startBubble(level){
    S.level = level;
    S.undosUsed = 0;
    S.hintsUsed = 0;
    S.vesselUsed = false;
    /* The view goes up before the game is booted, because booting measures the
       canvas to work out how the world maps onto it, and a canvas inside a
       hidden section measures zero. Mounting into that produces a board scaled
       to nothing, which draws as an empty screen with no error to explain it. */
    document.body.dataset.view = 'bubble';
    Backdrop.kind = 'cellar';
    if (!bubbleReady){
      BubbleApp.boot();
      BubbleApp.panelHidden = true;   /* this game shows the panel, with the gold on it */
      BubbleApp.onEnd = banked => finishBubble(banked);
      BubbleApp.charge = what => payFor(what);
      bubbleReady = true;
    }
    /* The chapters hand these over the same way they hand over the pour game's,
       because they are the same grants: an undo is an undo and a hint is a hint
       whichever board is in front of you. Picking a colour is the extra bottle,
       so it arrives with the vessel and costs what a vessel costs. */
    const perks = progress.perks();
    BubbleApp.allow = { undo: perks.undo, hint: perks.hint, colour: perks.vessel, swap: perks.undo };
    $('bubGold').textContent = progress.gold;
    BubbleApp.newBoard(level);
    Trace.note(`dealt level ${level}`, 'bubble board');
  }

  /* What a bubble tool costs, taken from the purse the same way the pour game's
     are. Undo is free for the first few and priced after, a hint costs what a
     hint costs, and a colour costs a vessel. Returning false refuses, and the
     refusal is recorded and heard exactly like every other one in this file. */
  function payFor(what){
    const perks = progress.perks();
    const price = what === 'undo' ? (S.undosUsed < perks.freeUndos ? 0 : CONFIG.economy.undoCost)
      : what === 'hint' ? (S.hintsUsed < perks.freeHints ? 0 : perks.hintCost)
      : what === 'colour' ? CONFIG.economy.vessel
      : 0;
    if (!progress.spend(price)){
      deny(what, `costs ${price}, purse holds ${progress.gold}`);
      return false;
    }
    if (what === 'undo') S.undosUsed++;
    if (what === 'hint') S.hintsUsed++;
    $('bubGold').textContent = progress.gold;
    return true;
  }

  /* A bubble run, banked the same way a pour run is.

     `shots` goes in where `moves` goes for a pour level, and progress knows the
     two compare in opposite directions, so the longest run is kept here and the
     shortest there. Nothing else about the economy changes: the same star gold,
     the same one-off first clear, the same fee already paid to deal it. */
  function finishBubble(run){
    const before = progress.starsFor(S.level);
    const result = progress.complete(S.level, run.shots, run.stars);
    S.over = true;
    S.finished = true;
    S.par = null;
    S.parExact = false;
    S.reason = null;
    showPanel({
      stars: run.stars, failed: run.stars <= 0, result, before,
      line: run.cleared
        ? `Every bubble gone, in ${run.shots} shots.`
        : `Lasted ${run.shots} shots.` + (run.aided ? ' Picking a colour caps a run at two stars.' : '')
    });
  }
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
    S.finished = false;
    S.saying = null;
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
      /* the board moved while the search ran, so this answer can be about a run
         that is already over; nothing else will notice if it is */
      const ended = checkLost();
      paintHud();
      if (ended && !S.running && !S.queue.length) finish();
    });
  }
  /* Is this run over, and if so why.

     A run used to be able to end in one place only: on a pour. That is the
     obvious moment and it is where most endings happen, but it is not the only
     one. Par is not always known when a board is dealt — the baked one is
     refused if it is below what the board plainly still needs — and the search
     that answers it is allowed eight seconds. Pours made during those seconds
     count, so par can arrive already spent, and nothing was asking. The counter
     relabelled itself to no pours left and the run carried on underneath it.

     So the question is asked wherever the answer can change, and answered in one
     place. */
  function checkLost(){
    if (S.over || Rules.isSolved(S.tubes)) return false;
    const why = Rules.lostBecause(S.tubes, S.moves, S.par, S.parExact);
    if (!why) return false;
    S.over = true;
    S.reason = why;
    return true;
  }
  /* A sentence held under the count for a moment, in place of the pour label.

     There is nowhere else for the game to say a short thing during a run: the
     panels all end it, and a tooltip is not a thing a thumb can read. The hint
     needs one, because a hint that finds nothing has to say so — seventeen
     silent refusals in one save is what this is here to stop. */
  let saidUntil = null;
  function say(words){
    S.saying = words;
    clearTimeout(saidUntil);
    saidUntil = setTimeout(() => { S.saying = null; paintHud(); }, 2800);
    paintHud();
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
      S.saying ? S.saying
      : left == null ? 'pours made'
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
    /* the panel follows once the queue has drained, in drain() */
    checkLost();
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
    /* Reachable from the queue draining and from a par that lands on a run
       already over, and those can be the same run: a second pass would score
       and pay for it twice. */
    if (S.finished) return;
    S.finished = true;
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

    showPanel({ stars, failed, result, before });
  }

  /* The end of a run, whichever game it was.

     Both games earn the same way, so both are presented the same way: the same
     stars, the same gold line, the same Retry and Next at the same prices. The
     only thing that differs is the sentence describing what happened, because
     one game counts pours against a minimum and the other counts how long you
     lasted. Split out of finish() so a bubble level cannot drift into having its
     own economy by accident. */
  function showPanel({ stars, failed, result, before, line }){
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
      /* the fee for another go at this board, and the fee for the next one,
         which are not the same number once this one has been beaten */
      canPayFee: progress.canAfford(fee),
      canPayNext: progress.canAfford(costOf(S.level + 1)),
      canPaySkip: progress.canAfford(skipCost()),
      improvedStars: result.improvedStars, hadStars: before,
      par: S.par, parExact: S.parExact, moves: S.moves, best: progress.bestFor(S.level),
      totalStars: progress.totalStars(), reason: S.reason
    });
    $('winTitle').textContent = panel.title;
    /* a bubble run has no par to measure against, so it says what it did */
    $('winLine').textContent = line || panel.line;

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

    const bubble = Levels.isBubble(S.level);
    setTimeout(() => {
      if (failed){
        /* the shelf takes it too, but only when there is a shelf */
        Audio.deny();
        if (!bubble) Board.nudge(S.level % Math.max(1, S.tubes.length));
      } else {
        Audio.win();
        Confetti.rain(CONFIG.palette.slice(0, bubble ? 6 : Levels.shape(S.level).colors));
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
        /* Nothing to show. That is either a board with no way on from here or a
           search that could not find one, and the game cannot tell those apart
           — but the player has to be told either way. Doing nothing at all, for
           a button that says it costs 25, is the worst of the three. */
        if (!res.first){
          deny('hint', 'no way on found from here');
          say('No way on from here');
          paintHud();
          return;
        }
        /* A move the exact search proved is the one this is priced for: taking
           it cannot cost a star, because taking optimal moves is what earns
           them. When the exact search ran out and the fallback found a way
           through instead, the move is still worth showing and is not worth
           paying for — it finishes the board, but longer. */
        const proven = !!res.exact;
        const fee = proven ? hintCost() : 0;
        if (fee > 0 && !progress.spend(fee)){
          deny('hint', `costs ${fee}, purse holds ${progress.gold}`);
          paintHud();
          return;
        }
        if (fee > 0) S.hintsUsed++;
        Board.showHint(res.first[0], res.first[1]);
        Audio.lift();
        if (!proven) say('A way on, not the shortest');
        paintHud();
      });
    };
    $('toMap').onclick = () => { Audio.tick(); showMap(false); };
    /* the other game's way out, which is the same way out */
    $('bubToMap').onclick = () => { Audio.tick(); showMap(false); };
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
      /* Restored on the click rather than on the pointerdown, and that is the
         whole trick. One press is a pointerdown, then a pointerup, then a
         click. Restoring on the pointerdown puts the panel back underneath a
         click that has not happened yet, and the panel closes when clicked
         outside itself, so the gesture would open it and shut it again. On the
         click there is nothing left of the gesture to misread, and the event's
         target was settled before the panel returned, so the panel's own
         backdrop handler is not even on its path.

         Captured on the document because while the board is being read almost
         everything ignores pointers, so which element the press lands on
         depends on what happens to be underneath it.

         Put on here and now rather than a tick later. The tick was left over
         from the pointerdown attempt, where the press that opened this really
         could close it again, and once the way back moved to the click it
         guarded nothing: this runs while that same click is at the button, so
         the document's capture pass is already behind it and no listener added
         now can be handed it. What the tick did leave was a moment in which the
         board was grey and the prompt was asking for a tap that would land on
         nothing, which is a thin thing to look at but a real one to tap, and a
         moment the browser spec had to guess the length of. */
      const back = e => {
        document.removeEventListener('click', back, true);
        document.removeEventListener('keydown', back, true);
        if (e) e.stopPropagation();
        document.body.classList.remove('peeking');
        $('veil').classList.add('show');
      };
      document.addEventListener('click', back, true);
      document.addEventListener('keydown', back, true);
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
     the middle of telling us about something else.

     The word stays in the address bar, and the whole thing goes off again every
     time the link is opened. That is only safe because the purse is brought up
     to a figure rather than paid a sum: landing on it twice lands on the same
     number. An earlier pass added instead, which meant the word had to be
     deleted from the URL to stop a reload paying again — and that made it a
     link that worked once, quietly, which is not what a link is for. */
  function takeGift(){
    let url;
    try { url = new URL(location.href); } catch (e) { return; }
    if (!url.searchParams.has(CONFIG.beta.word)) return;
    const gold = progress.fill();
    Trace.note('purse filled', `${gold} from the query string`);
    goldChanged();
    jabariMode();
  }

  /* The bang: now if the page is allowed to make one, and on the first touch if
     it is not.

     A page nobody has touched yet is not allowed to make a sound — the audio
     context stays suspended until a gesture, and opening a pasted link is not a
     gesture, which is precisely how this arrives. An earlier pass made the whole
     celebration wait for that touch, which bought the sound at the price of the
     thing the word is actually for: the message has to be on the screen the
     moment the link opens, every time, no conditions. So the picture never waits
     and only the noise does.

     The wait ends with the picture. A bang belongs to something on the screen,
     and one that arrives after the screen has gone back to the map is not a
     celebration, it is a noise from nowhere. Returns the way to call it off, and
     the same timer that clears the message calls it.

     Three bangs rather than one, because one is a sound effect and three is a
     point being made.

     The recording is asked for here and waited on before anything fires, which
     is the only way the three land on the sound they were written for: asking
     and firing in the same breath would race the fetch, and the race would be
     won by the fetch on a warm cache and lost on a cold one, so the same word
     would open on a different explosion depending on whether it had been opened
     before. The wait is over long before the touch that ends the other one. */
  function bang(){
    Audio.unlock();
    const loaded = Audio.loadBoom();
    let over = false;
    /* `over` is read after the wait as well as before it, so a message that
       takes itself away mid-fetch takes the bang with it. */
    const fire = () => loaded.then(() => {
      if (over) return;
      Audio.boom(); Audio.boom(0.19); Audio.boom(0.44);
    });
    const deafen = () => {
      document.removeEventListener('pointerdown', go, true);
      document.removeEventListener('keydown', go, true);
    };
    /* Calling off the bang and being done listening for it are two different
       things now that firing takes a moment: the touch that fires it stops the
       listening, and only the message going away calls it off. */
    const standDown = () => { over = true; deafen(); };
    const go = () => {
      if (over) return;
      deafen();
      Audio.unlock();
      fire();
    };
    if (Audio.ready){ fire(); return standDown; }
    document.addEventListener('pointerdown', go, true);
    document.addEventListener('keydown', go, true);
    return standDown;
  }

  /* It goes off, it says what it is, and it takes itself away. Cleared on a
     timer rather than on the animation ending, because reduced motion collapses
     the animation to nothing and there would be no end to wait for. */
  /* Not the game's palette. That one was chosen so no two liquids are close to
     the eye on a dark shelf; this is chosen to be as loud as a screen goes. */
  const JABARI_COLOURS = ['#FF3DDA','#FF2D2D','#FF8A1E','#FFE04A','#5BFF5F','#3DF2FF','#7A5BFF','#FFFFFF'];

  function jabariMode(){
    const el = $('jabari');
    $('jabariGold').textContent = `+${CONFIG.economy.purseCap.toLocaleString('en-US')}`;
    el.hidden = false;
    /* forced out of the frame that unhid it, or the animation never starts */
    void el.offsetWidth;
    el.classList.add('go');

    const quiet = bang();

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
      /* and the bang goes with it: a tap from here is a tap on the map */
      quiet();
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
