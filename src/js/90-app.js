/* Glue: routing between the map and a level, the move queue, and the win flow.

   `BubbleApp` is used below and deliberately not imported. It is the other
   game, and the other game is fetched after the page opens rather than as part
   of opening it — an import would put all of it in the critical bundle, which is
   the exact thing the deferral exists to prevent, and the page would then hold
   two copies: this one, and the one the fetched bundle publishes. Every use of
   it below is behind `Deferred.ready('bubble')` and a `typeof` guard, which is
   what a name that may not have arrived yet costs. `Sound` and `Preview` are
   late-bound for the same reason, and 49-audio.js explains it at length. */
import { CONFIG } from './pure/00-config.js';
import { Trace } from './pure/05-trace.js';
import * as Patterns from './pure/07-patterns.js';
import { Rules } from './pure/20-rules.js';
import { Levels } from './pure/30-levels.js';
import { PARS } from './pure/35-pars.js';
import { Chapters } from './pure/36-chapters.js';
import { Progress } from './pure/40-progress.js';
import { Panel } from './pure/45-panel.js';
import { SolverClient } from './60-solver-client.js';
import { Backdrop } from './65-backdrop.js';
import { Board } from './70-board.js';
import { Confetti } from './75-confetti.js';
import { Still } from './78-still.js';
import { MapView } from './80-map.js';
import { Diagnostics } from './85-diagnostics.js';
import { Jabari } from './86-jabari.js';
import { Deferred } from './96-deferred.js';

export const App = (() => {
  const progress = Progress.createProgress();
  const S = {
    level: 1, tubes: [], moves: 0,
    history: [], queue: [], running: false,
    par: null, parExact: false, parRequest: 0,
    undosUsed: 0, hintsUsed: 0, vesselUsed: false, over: false, finished: false, reason: null, hinting: false, saying: null,
    /* The blast, as two fields that always move together. `blownUp` is the once
       a run gate and half of what caps the stars; `spilled` is which colors it
       took units from, which every later judgement about this board has to be
       told or the run is graded by a law it is no longer playing under.

       A Set rather than a list because membership is the only question anyone
       asks of it. It is deliberately not saved: a blast belongs to a run, and a
       run does not outlive the page. */
    blownUp: false, spilled: new Set()
  };
  /* What the shelf is being judged by right now. Both games' scoring, the
     ending, and the HUD go through these two rather than reading the flags, so
     a new tool that eases the board is one call site rather than six. */
  const eased = () => S.vesselUsed || S.blownUp;
  /* Putting the end of run panel away, both classes every time.

     Four exits did this in three different spellings and one of them removed
     only `show`, leaving the failure styling on a hidden panel for the next run
     to inherit. That was harmless only by accident: showPanel happens to set the
     class again before it shows anything. A panel with two states and four ways
     out wants one way to close. */
  const closeVeil = () => $('veil').classList.remove('show', 'failed');

  /* Three stars, lit up to `n`. Written twice, once for the chip that counts a
     run down and once for the panel that reports it, and the two have to say
     the same thing in the same markup: they are the same claim about the same
     run, half a second apart. */
  const starRow = n => [0, 1, 2]
    .map(i => (i < n ? '★' : '<span class="dim">★</span>')).join('');

  const spilled = () => (S.spilled.size ? S.spilled : null);
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
    Sound.deny();
  }

  /* ---------- routing ---------- */
  /* The stylesheets color bands with var(--cN), the pour and the particle sim
     read CONFIG.palette. Publishing one from the other keeps a single source:
     when the palette moved to jewel tones and the CSS did not, the sim poured
     the old colors into the new bottles. */
  function publishPalette(){
    const s = document.documentElement.style;
    /* The hatch travels with the color it belongs to, published in the same
       pass, so the two cannot go out of step. See pure/07-patterns.js. */
    CONFIG.palette.forEach((hex, i) => {
      s.setProperty(`--c${i}`, hex);
      s.setProperty(`--p${i}`, Patterns.cssFor(i));
    });
  }

  /* A new build is waiting. Reloading is the only way to pick it up, but doing
     it under someone mid-pour would lose their level, so it waits for a moment
     that costs nothing: on the map, with nothing animating. Progress is saved
     per level, so nothing is lost by then. */
  let updatePending = false;
  /* a resize that arrived while the board was mid pour, applied once it lands */
  let missedResize = false;
  /* The end of run panel arrives a moment after the run does, so the last pour
     or the last shot is seen before the result covers it. Held so that leaving a
     board which has already finished can cancel it. */
  let reveal = 0;
  /* Which run is on screen, and which one the other game is playing.

     A board does not stop when the player walks away from it. The pour queue
     drains on its own promise chain and the other game's frame loop keeps
     stepping whatever view is up, so both can arrive at a result a second or
     more after the map replaced the board they belonged to. Banking it then
     credits whatever level is current by now, and revealing it puts a priced
     panel over the map.

     So a run carries the number it was dealt with and banks nothing if that is
     no longer the number on screen. Leaving a live board has always abandoned
     the run; this only makes a board that happened to be one animation from
     finishing behave the same way rather than differently by accident.

     The rule is not about those two callers, and the next thing to reach for
     this will not be a pour queue. Anything that can answer after the tap that
     asked for it belongs here: the card before a replay waits on a bundle and
     checks the same number, and a third game joining the graded run will have to
     do what `finishBubble` does, because eslint gates which game the host can
     reach and nothing gates whether it stopped when the player walked away. */
  let runId = 0;
  let bubbleRun = 0;
  /* who owns S.running; see drain() for why that is a different question */
  let drainId = 0;
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
    /* a render moves which level is "yours" and rebuilds every node, so whether
       the way back is needed, and which level it names, can both have changed */
    paintJump();
  }
  function showMap(scrollSmooth){
    Trace.note('to the map');
    clearTimeout(reveal);
    runId++;
    /* Leaving takes the sandbox with it. The board on screen is abandoned by the
       run id above like any other, and this makes sure the next bubble board is
       asked for as a level rather than inheriting a pace nobody chose for it. */
    bubbleSandbox = false;
    if (typeof Sandbox !== 'undefined') Sandbox.hide();
    document.body.dataset.view = 'map';
    Backdrop.kind = 'moss';
    Backdrop.setShelf(null);
    MapView.render(progress);
    MapView.scrollToCurrent(!!scrollSmooth);
    paintMap();
    paintJump();
    takeUpdate();
  }

  /* The way back to your level, shown only while it is out of sight.

     This is the job the Play button was really doing. Tapping the medallion
     already deals the board and the medallion already shows the price, so Play
     duplicated both; what it did not duplicate was being reachable when the map
     had been scrolled somewhere else. Making that the whole purpose lets it
     disappear when there is nothing to go back to, and gives the map the strip
     of screen the footer used to hold. */
  function paintJump(){
    const jump = $('mapJump');
    if (!jump) return;
    const away = document.body.dataset.view === 'map' && !MapView.currentIsVisible();
    jump.hidden = !away;
    $('mapJumpLevel').textContent = MapView.currentLevel;
    jump.setAttribute('aria-label', `Back to level ${MapView.currentLevel}`);
  }
  /* Every board dealt is paid for, whether it is a new level or another go at
     one just lost. Charging here rather than inside start() keeps the internal
     re-deals free: only a deliberate attempt costs. */
  /* Put a board on the screen, whichever game it is.

     Money is not this function's business: attempt() charges for the board and
     paying past one has already paid for the next. What is very much its
     business is which game the level number is, and that is the whole reason it
     exists rather than being a branch inside attempt().

     It was a branch inside attempt(), and Move on did not have it. That button
     dealt the next level by calling the pour game's start() directly, so paying
     past a board into one of the twenty three bubble levels dealt a shelf of
     bottles on a level the rest of the game treats as the other game: a par to
     score against, a pour count in the HUD, and a best recorded through
     progress.complete, which reads Levels.isBubble to decide which direction
     better is and would have filed a twelve pour clear as a twelve shot run. */
  function deal(level){
    clearTimeout(reveal);
    runId++;
    if (Levels.isBubble(level)){
      startBubble(level);
    } else {
      document.body.dataset.view = 'game';
      Backdrop.kind = 'cellar';
      start(level);
    }
    /* after the board, so what the card is talking about is already behind it */
    openChapter(level);
  }

  function attempt(level){
    if (!progress.spend(costOf(level))){
      deny('attempt', `level ${level} costs ${costOf(level)}, purse holds ${progress.gold}`);
      paintMap();
      return false;
    }
    Trace.note(`dealt level ${level}`, `paid ${costOf(level)}, purse now ${progress.gold}`);
    deal(level);
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

  /* ---------- the card before a replay ----------

     A level already cleared is the one tap on the map that should not deal a
     board. Everything the map has no room to say about it fits on a card: which
     board it was, how well it went, and what going back would actually pay,
     which once it is at three stars is nothing at all. That last one is not
     guessable and not what anyone assumes; before this the only way to learn it
     was to play the level again and be handed a +0, by which point the answer
     had cost a run.

     A level not yet cleared has none of that to show, so it is still dealt on
     the tap. A card with a picture and three blanks under it is an extra tap in
     front of the button that was already there. */
  /* which level the card is about, so Play deals that one rather than whatever
     the map happens to consider current */
  let previewLevel = null;
  /* Which tap the card being drawn belongs to, the way `parRequest` marks which
     search a par belongs to. A bubble level's card waits for a bundle, and a
     player who taps a second medallion during that wait must not be handed the
     first one's card when it lands. */
  let previewRequest = 0;

  function showPreview(level){
    const token = ++previewRequest;
    const bubble = Levels.isBubble(level);
    /* Neither the card nor the other game's numbers are on the critical path.

       The card rides in a bundle of its own now, because none of it is reachable
       until a tap like this one and it was being downloaded by everybody for the
       players who come back to a cleared level. Like the game's, it is fetched
       the moment the page opens, so by the time anybody has read the map it has
       been on the device for minutes and this resolves at once. On the one load
       where it has not, the tap waits rather than dealing a board nobody asked
       to pay for.

       Both are awaited together for the plain reason that a bubble level's card
       needs both, and waiting on them one after the other would make the slower
       one wait for the faster.

       They fail differently, though, so they are answered differently. Without
       the other game the card is still worth drawing: what it is for is what a
       replay pays, and that is this game's arithmetic: only the picture and the
       shot count come from over there, and both know how to be absent. Without
       the card there is nothing to draw at all, so the tap is refused, which at
       least leaves a reason behind it rather than a medallion that does
       nothing. */
    const want = bubble ? ['preview', 'bubble'] : ['preview'];
    /* Which board was on screen when the card was asked for.

       `previewRequest` catches a second medallion tapped during the wait, but
       that is not the only thing a map can do with a tap: one on a level never
       cleared deals its board there and then. The card would land on top of that
       board a second later, quoting one level's price and one level's stars over
       another level's run, with a Play on it that charges again for the board
       behind it. Every card waits now that the card is a bundle of its own, so
       this is not just the levels that are the other game. Same wait, same stale
       answer, so the same token the pour queue and that game's loop check. */
    const mine = runId;
    Promise.all(want.map(name => Deferred.ready(name))).then(() => {
      if (token !== previewRequest || mine !== runId) return;
      if (typeof Preview === 'undefined'){
        deny('preview', 'the card before a replay could not be loaded');
        return;
      }
      const loaded = !bubble || typeof BubbleApp !== 'undefined';
      if (!loaded) deny('preview', 'the bubble game could not be loaded');
      paintPreview(level, loaded);
    });
  }

  function paintPreview(level, loaded){
    const bubble = Levels.isBubble(level);
    const stars = progress.starsFor(level);
    const fee = costOf(level);
    /* dealt rather than drawn: the still is this level's actual board, and the
       par is the one that board would be scored against */
    const tubes = bubble ? null : Levels.make(level);
    const par = bubble ? null : parOf(level, tubes);
    const card = Preview.decide({
      level, stars, bubble,
      best: progress.bestFor(level),
      par, parExact: par != null,
      goal: bubble && loaded ? BubbleApp.runShots : null,
      fee, canPayFee: progress.canAfford(fee),
      /* what a perfect run would pay on this save, answered by the same
         arithmetic that will pay it out */
      earned: progress.wouldEarn(level, 3).earned
    });

    $('previewChapter').textContent = Levels.sectionName(level);
    $('previewTitle').textContent = card.title;
    $('previewKind').hidden = !card.kind;
    $('previewKind').textContent = card.kind;
    $('previewStars').innerHTML = starRow(stars);
    /* no picture rather than a wrong one, on the one load where the other game's
       bundle never arrived */
    $('previewStill').innerHTML = !bubble ? Still.pour(tubes)
      : loaded ? Still.bubbles(BubbleApp.still(level))
      : '';
    $('previewLine').textContent = card.line;
    $('previewPayout').hidden = card.payoutHidden;
    $('previewGold').textContent = card.earnedLabel;
    $('previewWhy').textContent = card.why;
    /* Hidden rather than emptied, so a card with nothing to advise closes up
       instead of leaving a gap where a sentence used to be. */
    $('previewHint').hidden = !card.hint;
    $('previewHint').textContent = card.hint;
    $('previewFee').textContent = card.feeLabel;
    $('previewPlay').disabled = card.playDisabled;
    $('previewVeil').style.setProperty('--tint', Levels.sectionTint(level));
    $('previewVeil').classList.add('show');
    previewLevel = level;
    Trace.note(`looking at level ${level}`, `${stars} stars, a perfect run pays ${card.earnedLabel}`);
  }

  /* ---------- the other game ----------

     Some levels are the bubble game. It is booted once, the first time one is
     opened, because mounting a canvas and dealing a board on every page view
     costs something and most views never reach one.

     The board is dealt from the level number, so level 14 is the same board for
     everyone the same way every pour level is. */
  let bubbleReady = false;
  /* whether the board on screen is a sandbox one, which decides whether it is
     banked and which panel it ends on */
  let bubbleSandbox = false;

  /* Booted once, whichever kind of board asked for it. Both the graded path and
     the sandbox need the same three wires and the same panel decision, and a
     second copy of them is how one of the two ends up banking through a handler
     the other one set. */
  function bootBubble(){
    if (bubbleReady) return;
    BubbleApp.boot();
    BubbleApp.panelHidden = true;   /* this game shows the panel, with the gold on it */
    BubbleApp.onEnd = banked => finishBubble(banked);
    BubbleApp.charge = what => payFor(what);
    bubbleReady = true;
  }

  /* One way in to a bubble board, whichever kind it is.

     The view goes up before the boot, because booting measures the canvas and
     one inside a hidden section measures zero: mounting into that draws an empty
     screen with no error to explain it. The game itself is fetched right after
     the page opens, so `ready` resolves at once by the time anybody gets here.

     Together rather than as two, because two drifted the moment they existed:
     the sandbox was the only caller that set a pace, so it was the only one that
     put it back, and a level dealt after one carried it. Setting `rules` on
     every board makes that impossible rather than remembered. */
  function openBubble({ level, rules, sandbox, seed, allow, prices, charge, note }){
    bubbleRun = runId;
    newRun(level);
    bubbleSandbox = !!sandbox;
    document.body.dataset.view = 'bubble';
    Backdrop.kind = 'cellar';
    Deferred.ready('bubble').then(() => {
      /* the player may have gone back to the map while that was in the air */
      if (S.level !== level || document.body.dataset.view !== 'bubble') return;
      if (bubbleSandbox !== !!sandbox) return;
      if (typeof BubbleApp === 'undefined'){
        deny('bubble', 'the bubble game could not be loaded');
        showMap();
        return;
      }
      bootBubble();
      BubbleApp.rules = rules;
      BubbleApp.allow = allow;
      BubbleApp.prices = prices;
      /* Who takes payment for a tool, decided per board rather than once at
         boot. A level pays out of the purse; a sandbox board pays out of an
         allowance of its own. Setting only the prices was the bug: the label
         said free and the charge still went to the purse. */
      BubbleApp.charge = charge || (what => payFor(what));
      $('bubGold').textContent = progress.gold;
      BubbleApp.newBoard(seed);
      Trace.note(note, sandbox ? 'sandbox board' : 'bubble board');
    });
  }

  function startBubble(level){
    /* The chapters hand these over the same way they hand over the pour game's,
       because they are the same grants: an undo is an undo and a hint is a hint
       whichever board is in front of you. Picking a color is the extra bottle,
       so it arrives with the vessel and costs what a vessel costs. */
    const perks = progress.perks();
    openBubble({
      level, seed: level, rules: null, sandbox: false,
      allow: { undo: perks.undo, hint: perks.hint, color: perks.vessel,
               swap: perks.undo, bomb: perks.blast },
      prices: () => bubblePrices(),
      note: `dealt level ${level}`
    });
  }

  /* ---------- the sandbox ----------

     Jabari mode's bubble workbench: a board off the graded run, at a pace you
     pick, with no shot limit. All of it is 87-sandbox.js, fetched on the press,
     because nobody without the word in the address bar can reach a line of it
     and every load would otherwise pay for it. What is left here is the press
     and the one thing the module cannot do for itself, which is deal a board. */
  function openSandbox(){
    Sound.unlock(); Sound.tick();
    Deferred.ready('sandbox').then(() => {
      if (typeof Sandbox === 'undefined'){
        deny('sandbox', 'the bubble sandbox could not be loaded');
        return;
      }
      Sandbox.host = {
        openBubble, toMap: () => showMap(false), level: () => S.level,
        /* A tool the sandbox has spent is one the board no longer offers, so the
           row is re-handed rather than left showing a button that refuses. */
        retool: (allow, prices) => {
          if (typeof BubbleApp === 'undefined') return;
          BubbleApp.allow = allow;
          BubbleApp.prices = prices;
          BubbleApp.paintTools();
        },
        /* The board a difficulty would deal, drawn the way the card before a
           replay draws one: the game's own dealer under those rules, through the
           same `Still`. A picture mocked up here would be a picture of a board
           nobody is ever dealt, which is the one thing a preview must not be. */
        still: (seed, under) => (typeof BubbleApp === 'undefined'
          ? '' : Still.bubbles(BubbleApp.still(seed, under)))
      };
      Sandbox.open();
    });
  }

  /* ---------- the door in front of a chapter ----------

     A floor of casks, and getting the gilt one out is what opens the chapter
     behind it. Eleven of them, one before every chapter but the first, chosen in
     30-levels.js.

     Nothing about it is graded. No par, no stars, no best, no first-clear bonus,
     no fee to attempt and nothing to spend: a floor is out or it is not, and a
     gate that can be got through badly is a toll rather than a gate. That is
     also why none of it is wired to the purse — there is no transaction here to
     have gone wrong, which is the whole appeal of it as a gate.

     The no-aids rule is not a flag. The door view in index.html carries the
     canvas and nothing else, so that game's own paintHud() and panel find none
     of the elements they paint and quietly do nothing, and there is no button in
     this document that reaches its undo() or hint(). A rule made of missing
     elements cannot be left switched on. */
  let doorReady = false;
  /* Which chapter the floor on screen is the way into, so the callback cannot
     open a different one from the one the player is standing at. */
  let doorSection = null;

  function showDoor(section){
    const floor = Levels.doorFor(section);
    if (floor == null) return;
    if (progress.isDoorOpen(section)){ showMap(); return; }
    /* The chapter behind it has to be one the player has actually reached.
       The map disables a door further on than that, and this is the same
       refusal made where it cannot be got round. */
    const first = section * CONFIG.sectionSize + 1;
    if (progress.unlocked < first){
      deny('door', `the door to chapter ${section + 1} is further on than level ${progress.unlocked}`);
      return;
    }
    runId++;
    doorSection = section;
    $('doorChapter').textContent = Levels.sectionName(first);
    /* Up before the game is booted, for the reason startBubble gives: booting
       measures the canvas, and a canvas in a hidden section measures zero. */
    document.body.dataset.view = 'door';
    Backdrop.kind = 'cellar';

    const mine = runId;
    Deferred.ready('casks').then(() => {
      if (mine !== runId || document.body.dataset.view !== 'door') return;
      if (typeof CasksApp === 'undefined'){
        deny('door', 'the cellar door could not be loaded');
        showMap();
        return;
      }
      if (!doorReady){
        CasksApp.boot();
        CasksApp.onOut = () => openedDoor();
        doorReady = true;
      }
      CasksApp.newBoard(floor);
      Trace.note(`opened the door to chapter ${section + 1}`, `casks floor ${floor}`);
    });
  }

  /* The gilt cask is out. Read off `doorSection` rather than off the floor
     number the callback carries: the same floor could stand in front of two
     chapters one day, and a door that opened whichever chapter happened to use
     that board is a bug nobody would find twice. */
  function openedDoor(){
    const section = doorSection;
    if (section == null) return;
    doorSection = null;
    if (!progress.openDoor(section)) return;
    Trace.note(`chapter ${section + 1} opened`, 'the door was got through');
    paintHud();
    showMap();
    /* The opening card, now that the chapter it is about is genuinely open.
       openChapter() marks it seen, so it still shows once and only once. */
    openChapter(section * CONFIG.sectionSize + 1);
  }

  /* What a bubble tool costs, taken from the purse the same way the pour game's
     are. Undo is free for the first few and priced after, a hint costs what a
     hint costs, and a color costs a vessel. Returning false refuses, and the
     refusal is recorded and heard exactly like every other one in this file. */
  /* What each bubble tool costs right now. One place, so the button and the
     charge cannot disagree: a control that says "free" and then takes eight gold
     is worse than one with no label at all. */
  function bubblePrices(){
    const perks = progress.perks();
    return {
      undo: S.undosUsed < perks.freeUndos
        ? { free: true, left: perks.freeUndos - S.undosUsed } : { cost: CONFIG.economy.undoCost },
      hint: S.hintsUsed < perks.freeHints ? { free: true } : { cost: perks.hintCost },
      color: { cost: CONFIG.economy.vessel },
      /* the bomb is this game's blast, so it is priced from the same key */
      bomb: { cost: CONFIG.economy.blast }
    };
  }

  function payFor(what){
    const p = bubblePrices()[what];
    /* A tool with no entry here used to fall through to nought, which is not a
       price: it is a free ride, granted silently, to whatever the other game
       asks for next. `free` is a price and a missing entry is not, so the two
       are told apart rather than collapsed into one falsy check. */
    if (!p){
      deny(what, 'no price for this tool');
      return false;
    }
    const price = p.free ? 0 : p.cost;
    if (!progress.spend(price)){
      deny(what, `costs ${price}, purse holds ${progress.gold}`);
      return false;
    }
    if (what === 'undo') S.undosUsed++;
    if (what === 'hint') S.hintsUsed++;
    $('bubGold').textContent = progress.gold;
    BubbleApp.paintTools();
    return true;
  }

  /* A bubble run, banked the same way a pour run is.

     `shots` goes in where `moves` goes for a pour level, and progress knows the
     two compare in opposite directions, so the longest run is kept here and the
     shortest there. Nothing else about the economy changes: the same star gold,
     the same one-off first clear, the same fee already paid to deal it. */
  function finishBubble(run){
    /* The other game's frame loop does not stop when the view changes, so a
       board left mid collapse still reaches its ending a second later. Banking
       it then would credit whatever level is current by now. */
    if (bubbleRun !== runId) return;
    /* A sandbox board is not a level and has no level to be banked against. The
       game already zeroes the stars on a run played under anything but the
       graded rules, so this is the second of two locks rather than the only one,
       and it is here because `progress.complete` would otherwise be called with
       whatever level was last opened. */
    if (run.graded === false) return Sandbox.ended(run);
    const before = progress.starsFor(S.level);
    const result = progress.complete(S.level, run.shots, run.stars);
    S.over = true;
    S.finished = true;
    showPanel({
      stars: run.stars, failed: run.stars <= 0, result, before,
      line: (run.cleared ? `Every bubble gone, in ${run.shots} shots.`
        : run.survived ? `Survived all ${run.shots} shots.`
        : `Lasted ${run.shots} shots.`)
        + (run.aided ? ` ${run.aid} caps a run at two stars.` : '')
    });
  }
  const skipCost = () => CONFIG.economy.attempt * CONFIG.economy.skipMultiple;
  /* what this particular board costs to deal: nothing if it is already beaten */
  const costOf = level => (progress.starsFor(level) > 0
    ? CONFIG.economy.replay : CONFIG.economy.attempt);
  /* the first hint of a run can be free, once a chapter has said so */
  const hintCost = () => (S.hintsUsed < progress.perks().freeHints ? 0 : progress.perks().hintCost);

  /* ---------- a level ---------- */
  /* Everything a run owns, cleared before either game deals one.

     One function because both games run out of this one state object: they share
     the purse, the panel and the chapter card, so they share the fields those
     read. A bubble level used to clear the four it obviously touched and leave
     the rest as the last pour level left them, which meant the panel was still
     building a sentence out of that level's pours, par and best before throwing
     it away. Nothing showed, because the bubble path always passes a line of its
     own, so the whole thing rested on an argument at one call site. Clearing in
     one place is what stops the next reader having to know that. */
  function newRun(level){
    S.level = level;
    S.tubes = [];
    S.moves = 0;
    S.history = [];
    S.queue = [];
    S.running = false;
    S.par = null;
    S.parExact = false;
    S.undosUsed = 0;
    S.hintsUsed = 0;
    S.vesselUsed = false;
    /* A blast is not kept the way a vessel is: a restart deals the shelf the
       level deals, and the bottle it took off came back with the board. */
    S.blownUp = false;
    S.spilled = new Set();
    S.over = false;
    S.finished = false;
    S.reason = null;
    S.hinting = false;
    S.saying = null;
  }

  /* The par this board is scored against, which is not simply the one written
     down for the level.

     The baked table is exact, and so is anything progress kept. But a par
     belongs to a particular board: minPours can never overstate the work a board
     has left, so a par below it cannot be this board's, and scoring against it
     would hand out three stars and a payout for a run that never happened.
     Refuse the number rather than the run: an unknown par shows a tilde and
     decides nothing.

     Asked here rather than inline, because the card shown before a replay quotes
     this number as a target and has to quote the one the run will honor. A card
     promising three stars for twelve pours, in front of a run that will not
     score at all, is a worse lie than no target. */
  function parOf(level, tubes){
    const par = PARS[level] ?? progress.parFor(level);
    return par != null && par >= Rules.minPours(tubes) ? par : null;
  }

  /* A restart deals the level from scratch, and that includes anything bought:
     restarting is starting again, and a board that quietly keeps a vessel or
     stays a bottle short is not the board the level is. The purchase is not
     refunded, because a restart is not an undo, and nothing is laundered by it
     either: what was paid for is gone along with the run it was paid into.

     This used to be a choice. `start` took a `keepVessel` and threaded it up
     through `deal` and `attempt`, and no caller ever passed it, so all three
     signatures described a decision the game had already made in `newRun`. It
     is gone, and the fact that a restart deals clean is pinned by a test. */
  function start(level){
    newRun(level);
    S.tubes = Levels.make(level);
    S.par = parOf(level, S.tubes);
    S.parExact = S.par != null;
    Board.view = Rules.clone(S.tubes);
    Board.selected = null;
    closeVeil();
    Board.render();
    paintHud();
    if (S.par == null) askPar();
  }
  function askPar(){
    const id = ++S.parRequest;
    const level = S.level;
    const mine = runId;
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
      if (ended && mine === runId && !S.running && !S.queue.length) finish();
    });
  }
  /* Is this run over, and if so why.

     A run used to be able to end in one place only: on a pour. That is the
     obvious moment and it is where most endings happen, but it is not the only
     one. Par is not always known when a board is dealt — the baked one is
     refused if it is below what the board plainly still needs — and the search
     that answers it is allowed eight seconds. Pours made during those seconds
     count, so par can arrive already spent, and nothing was asking. The counter
     relabeled itself to no pours left and the run carried on underneath it.

     So the question is asked wherever the answer can change, and answered in one
     place. */
  function checkLost(){
    if (S.over || Rules.isSolved(S.tubes, spilled())) return false;
    const why = Rules.lostBecause(S.tubes, S.moves, S.par, S.parExact, spilled());
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
    const stars = Rules.rate(S.moves, S.par, S.parExact, eased());
    $('statStars').innerHTML = starRow(stars);
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
    Sound.lift();
  }
  function drop(){
    if (Board.selected != null) Board.el(Board.selected)?.classList.remove('lifted');
    Board.selected = null;
  }

  function tap(i){
    if (S.over) return;                 /* the run is decided; stop taking pours */
    Sound.unlock();
    const sel = Board.selected;
    if (sel === null){
      if (!canLift(i)){ Board.nudge(i); deny('lift', `bottle ${i} is empty or finished`); return; }
      lift(i);
      return;
    }
    if (sel === i){ drop(); Sound.drop(); return; }
    if (Rules.canPour(S.tubes, sel, i)){
      drop();
      commit(sel, i);
      return;
    }
    /* The pour will not go: the target is full, or finished, or the colors do
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
    /* `mine` is the board this queue belongs to. Checked around the await as
       well as at the end, because nothing cancels an animation and start()
       re-points Board.view, so a drain left behind by a board the player walked
       away from would apply its move to whatever is on screen now. That desync
       is permanent for the level: taps are read off S.tubes and the drawing off
       Board.view, so a bottle ends up drawn short, or past the cap.

       `me` answers a different question: who owns S.running. Returning early
       still runs the finally, and by then the flag belongs to the drain
       animating the new board; clearing it there re-enables undo and restart
       over a live pour. It cannot key on `mine`, because leaving for the map
       moves runId without dealing anything, and then nothing would ever clear
       the flag that takeUpdate() waits on. */
    const mine = runId;
    const me = ++drainId;
    S.running = true;
    try {
      while (S.queue.length){
        if (mine !== runId) return;
        const move = S.queue.shift();
        try {
          await Board.animate(move);
        } catch {
          /* a dropped animation still owes the board its result */
        }
        if (mine !== runId) return;
        Rules.applyMove(Board.view, move);
        Board.render();
        if (Rules.isFull(Board.view[move.to])) Board.seal(move.to);
      }
    } finally {
      /* whoever bumped drainId last is still running and will clear it */
      if (drainId === me){ S.running = false; paintHud(); }
    }
    /* the pours have landed, so a resize held back during them can be applied */
    if (missedResize){
      missedResize = false;
      try { Board.render(); } catch { /* a failed redraw must not eat the result */ }
    }
    /* the board has stopped moving, so whatever was decided can now be shown,
       unless it stopped moving somewhere the player is no longer looking */
    if (mine === runId && (Rules.isSolved(S.tubes, spilled()) || S.over)) finish();
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
    const solved = Rules.isSolved(S.tubes, spilled());
    const stars = solved ? Rules.rate(S.moves, S.par, S.parExact, eased()) : 0;
    const before = progress.starsFor(S.level);
    const result = progress.complete(S.level, S.moves, stars);
    const failed = stars === 0;
    /* Here rather than in checkLost, which a win never goes through. */
    progress.recordEnding(S.level, solved ? 'cleared' : (S.reason || 'given up'));

    showPanel({ stars, failed, result, before });
  }

  /* ---------- the blast ----------

     Offered on the failure panel rather than in the tool row, and the reason is
     when a run ends rather than where a button fits. A run stops the moment it
     is lost and `S.over` is never unset, so a rescue living only in the tool row
     can be pressed only before the game has said you need it. The vessel has
     always had that problem. This one does not inherit it.

     Which bottles may be destroyed is the rules' question, not this file's, and
     it is answered on a copy by the same function that ended the run. A bubble
     level is never offered one: it has a bomb of its own in its own tool row,
     and `S.tubes` there is whatever the last pour level left behind. */
  const blastTargets = () =>
    (Levels.isBubble(S.level) ? []
      : Rules.blastTargets(S.tubes, S.moves, S.par, S.parExact, spilled()));

  /* One button doing both halves of the job.

     Closed it offers the blast and shows what it would cost. Open it is the way
     back out of the shelf, and says the thing worth saying at that moment:
     nothing has been taken yet. A second button to put the first one away is a
     row that grows every time something can be opened, and this row is on a
     panel that already carries three.

     The label and the price are written together, the way #retry writes its
     two, because they are one statement about what pressing it does. The word
     under Cancel is `free` rather than a struck out price for the same reason it
     is `free` on Retry: this game says free when a press costs nothing. */
  function paintBlast(armed){
    const b = $('blast');
    b.innerHTML = armed
      ? 'Cancel<small>free</small>'
      : `Blast<small id="blastCost">${CONFIG.economy.blast}</small>`;
    b.classList.toggle('armed', armed);
    b.setAttribute('aria-expanded', armed ? 'true' : 'false');
  }

  function closeBlastPick(){
    $('blastPick').hidden = true;
    $('blastPick').innerHTML = '';
    paintBlast(false);
  }

  /* The shelf, as the bottles the rules will actually allow, each drawn as the
     liquid it holds. Built fresh every time it is opened, because the board it
     describes can have moved since the panel was written. Nothing is charged
     for opening it: the gold goes when a bottle is chosen. */
  function openBlastPick(){
    const targets = blastTargets();
    if (!targets.length) return closeBlastPick();
    const pick = $('blastPick');
    pick.innerHTML = '';
    for (const i of targets){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stillBottle';
      b.title = `destroy bottle ${i + 1}`;
      b.setAttribute('aria-label', `Destroy bottle ${i + 1}`);
      /* Drawn by the same thing that draws the board on the card before a
         replay, so the glass on this shelf holds what the bottle holds. The
         hand-rolled version gave every band an equal share of the glass, which
         drew a one unit bottle and a full one identically on the one screen
         where the difference is the whole decision. */
      b.innerHTML = Still.bottle(S.tubes[i]);
      b.onclick = () => takeBlast(i);
      pick.appendChild(b);
    }
    pick.hidden = false;
    paintBlast(true);
  }

  /* Destroy a bottle and put the player back on the board.

     Nothing is re-dealt and no attempt is charged. A failed run banked nothing —
     `progress.complete` short circuits on nought stars and writes neither gold
     nor unlock — so there is nothing to undo, and the fee for this board was
     paid when it was dealt. What changes is the shelf and what the shelf is
     judged by.

     The history goes, for the reason the vessel's does: those snapshots describe
     a shelf with a different number of bottles in it, and every queued or
     remembered move is a pair of positions into an array that has just moved
     underneath them. */
  function takeBlast(index){
    if (S.blownUp || !blastTargets().includes(index)) return;
    if (!progress.spend(CONFIG.economy.blast)){
      deny('blast', `costs ${CONFIG.economy.blast}, purse holds ${progress.gold}`);
      return;
    }
    const after = Rules.blast(S.tubes, index);
    S.tubes = after.tubes;
    for (const color of after.spilled) S.spilled.add(color);
    S.blownUp = true;
    S.history = [];
    closeBlastPick();
    drop();
    Board.view = Rules.clone(S.tubes);
    Board.render();
    Sound.smash();
    Trace.note(`blast on level ${S.level}`,
      `bottle ${index + 1}, spilled ${after.spilled.join(',')}, purse now ${progress.gold}`);

    /* Blowing up the last bottle in the way is a legitimate way to finish, and
       `blastTargets` deliberately keeps a target that solves the board. So the
       question is asked before the run is handed back, or a finished board would
       be handed to a player with nothing left to do on it. */
    if (Rules.isSolved(S.tubes, spilled())){
      closeVeil();
      finish();
      return;
    }
    /* All three have to go. `finished` alone left true makes finish() return
       forever and the resumed run could never score; `over` alone left true
       stops the board taking pours and disables the hint. */
    S.over = false;
    S.finished = false;
    S.reason = null;
    closeVeil();
    paintHud();
    say('One bottle gone. Two stars is the most this run can take.');
  }

  /* The end of a run, whichever game it was.

     Both games earn the same way, so both are presented the same way: the same
     stars, the same gold line, the same Retry and Next at the same prices. The
     only thing that differs is the sentence describing what happened, because
     one game counts pours against a minimum and the other counts how long you
     lasted. Split out of finish() so a bubble level cannot drift into having its
     own economy by accident. */
  function showPanel({ stars, failed, result, before, line }){
    $('stars').innerHTML = starRow(stars);

    /* say where the gold came from, so the thin payouts read as earned */
    const parts = [`${stars}★`];
    if (result.firstClear) parts.push('first clear');
    $('goldEarned').textContent = `+${result.earned}`;
    $('goldWhy').textContent = failed ? 'No gold · run failed' : `Gold · ${parts.join(' + ')}`;

    const fee = costOf(S.level);
    const trouble = progress.troubleOn(S.level);
    const panel = Panel.decide({
      level: S.level, lastLevel: progress.lastLevel, failed, stars,
      nextUnlocked: progress.isUnlocked(S.level + 1),
      /* Whether a shut cellar door stands between this board and the next. This
         panel is the one screen the map is not on, and without it the way on
         from the last board of a chapter dealt the first board of the next. */
      doorNext: progress.doorBefore(S.level + 1) != null,
      /* the fee for another go at this board, and the fee for the next one,
         which are not the same number once this one has been beaten */
      canPayFee: progress.canAfford(fee),
      canPayNext: progress.canAfford(costOf(S.level + 1)),
      canPaySkip: progress.canAfford(skipCost()),
      /* How many bottles could be destroyed without leaving the run worse off.
         A count, because that is all the decision needs; which ones they were is
         worked out again when the chooser is opened, on the board as it then
         stands rather than as it was when this panel was written. */
      canPayBlast: progress.canAfford(CONFIG.economy.blast),
      blastGranted: progress.perks().blast,
      blastUsed: S.blownUp,
      blastTargets: failed ? blastTargets().length : 0,
      improvedStars: result.improvedStars, hadStars: before,
      par: S.par, parExact: S.parExact, moves: S.moves, best: progress.bestFor(S.level),
      totalStars: progress.totalStars(), reason: S.reason,
      /* read after `complete`, so this run is already in the count */
      lostHere: trouble.lost, bricksHere: trouble.bricks, alreadyAsked: trouble.asked
    });
    /* Kept, for the same reason `_state` and `_progress` are exposed: so a spec
       can ask what was decided rather than deciding it again. The browser suite
       compares the panel on the screen against this, and a spec that rebuilt the
       inputs would be asserting the app against its own idea of the run — which
       is how a spec passes while the two have parted company. */
    S.panel = panel;
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
    /* Named for what pressing it opens: at the end of a chapter that is the
       gate, and "Next level" there promises a board it will not deal. */
    $('next').textContent = panel.nextIsDoor ? 'The cellar door' : 'Next level';
    $('next').classList.toggle('primary', panel.nextPrimary);
    $('next').disabled = panel.nextDisabled;
    /* Beaten by a board is not the same as stuck on it. Paying past it opens the
       next one and deals it, so a level nobody can crack is a decision with a
       price rather than a wall. */
    $('skip').hidden = panel.skipHidden;
    $('skipCost').textContent = skipCost();
    $('skip').disabled = panel.skipDisabled;
    /* The chooser is closed every time the panel is written, so a run that ended
       with it open cannot hand the next one a list of bottles from a board that
       is no longer there. */
    closeBlastPick();
    $('blast').hidden = panel.blastHidden;
    $('blast').disabled = panel.blastDisabled;
    $('reportOffer').hidden = panel.reportHidden;
    $('winHint').textContent = panel.hint;

    const bubble = Levels.isBubble(S.level);
    clearTimeout(reveal);
    reveal = setTimeout(() => {
      if (failed){
        /* the shelf takes it too, but only when there is a shelf */
        Sound.deny();
        if (!bubble) Board.nudge(S.level % Math.max(1, S.tubes.length));
      } else {
        Sound.win();
        /* as many colors as the board actually had, and on a bubble level that
           is the other game's business rather than a 6 written down here */
        Confetti.rain(CONFIG.palette.slice(0,
          bubble ? BubbleApp.colors : Levels.shape(S.level).colors));
      }
      $('veil').classList.add('show');
    }, failed ? 260 : 700);
  }

  /* ---------- wiring ---------- */
  /* Drawn rather than typed. An emoji speaker arrives in whatever the platform
     feels like, which here was a gray plastic blob sitting in a gold and brown
     header; these are two paths in currentColor, so they are the same ink as
     everything around them at any size. */
  const ICON = {
    sound: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    muted: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9.5l4 5M21 9.5l-4 5"/></svg>',
    settings: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.6 5.4l-1.9 1.9M7.3 16.7l-1.9 1.9M18.6 18.6l-1.9-1.9M7.3 7.3L5.4 5.4"/></svg>',
    install: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v10"/><path d="M8.5 10.5L12 14l3.5-3.5"/><path d="M5 17.5h14"/></svg>'
  };

  /* One preference, every game, one place that applies it.

     There are three sound modules on this page, one per game, each with its own
     idea of whether it is muted: this game's lives in the save, the other two in
     keys of their own, because they also ship as pages of their own where there
     is no save to read. On those pages that is right. Here it meant a player who
     muted the game still got noise out of the boards that are another game, on a
     screen with no button to stop it, having already done the only thing the
     game offers for stopping it.

     So the save is the preference and this hands it to all three. Their own keys
     still get written by their own pages, and nothing here reads them.

     Through `BubbleApp` and `CasksApp` rather than their audio modules directly.
     The coupling to another game is one object wide on purpose, and a boolean is
     not a reason to make it two.

     One shape of button, in one place: a glyph at the left of the header, on
     every screen there is. It used to be words in a level and a glyph on the
     map, which is two things to find and two to keep in step, and the two
     screens that are another game had neither. */
  /* One class on the body, because that is the whole switch: the stylesheet
     decides what a hatched band looks like and the canvases ask for it. The
     bubble game is fetched after the page opens, so it is handed the setting the
     moment it arrives, exactly as the sound is below and for the same reason. */
  function applyColorblind(on){
    document.body.classList.toggle('cb', !!on);
    const row = document.getElementById('setCb');
    if (row){
      row.setAttribute('aria-pressed', on ? 'true' : 'false');
      row.querySelector('b').textContent = on ? 'On' : 'Off';
    }
    if (typeof BubbleApp !== 'undefined') BubbleApp.colorblind = !!on;
    else Deferred.ready('bubble').then(() => {
      if (typeof BubbleApp !== 'undefined') BubbleApp.colorblind = progress.colorblind;
    });
    /* Only when there is a board to repaint. This is called during boot as well
       as from the settings card, and at boot the board is not mounted yet: a
       render then measured a shelf against bottles that were not standing on it
       and moved the rows by a pixel, which the layout suite caught. */
    if (document.body.dataset.view === 'game') Board.render();
    return !!on;
  }
  function applySound(on){
    Sound.setEnabled(on);
    /* The bubble game is fetched after the page opens, so during boot this name
       does not exist yet: an unguarded assignment here is a ReferenceError in
       boot(), which is a blank screen caused by the sound preference.

       Guarding alone is not enough either. The setting has to actually arrive,
       or a game muted in an earlier sitting comes back with the other half of it
       unmuted and nothing says so. So if the bundle is not here, hand the
       setting over the moment it is — reading the live value rather than the one
       captured now, in case the button was pressed again in between. */
    if (typeof BubbleApp !== 'undefined') BubbleApp.sound = on;
    else Deferred.ready('bubble').then(() => {
      if (typeof BubbleApp !== 'undefined') BubbleApp.sound = Sound.enabled;
    });
    /* And the cellar door, which is a third audio module and was reached by
       none of this: every gate in the run answered a muted game at full
       volume. */
    if (typeof CasksApp !== 'undefined') CasksApp.sound = on;
    else Deferred.ready('casks').then(() => {
      if (typeof CasksApp !== 'undefined') CasksApp.sound = Sound.enabled;
    });
    document.querySelectorAll('#setSound').forEach(b => {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.querySelector('b').textContent = on ? 'On' : 'Off';
      b.classList.toggle('off', !on);
    });
    return on;
  }
  function bind(){
    Board.mount($('board'));
    Board.onTap = tap;
    MapView.mount($('mapScroll'));
    /* the map shows what a board costs, and this is where that is decided */
    MapView.feeFor = costOf;
    MapView.unlockFeeOf = skipCost;
    /* A level with a record behind it gets the card; one without has nothing to
       put on a card, so the tap still deals the board. */
    MapView.onPick = level => {
      Sound.unlock(); Sound.tick();
      if (progress.starsFor(level) > 0) showPreview(level);
      else showGame(level);
    };
    MapView.onDoor = section => { Sound.unlock(); Sound.tick(); showDoor(section); };
    /* Paying past a board from the map opens the next one and nothing else: no
       stars, no best, and the first-clear bonus stays unclaimed, so coming back
       and actually beating it still pays what it always would have. */
    MapView.onBuy = level => {
      Sound.unlock();
      if (!progress.buyUnlock(level - 1, skipCost())){
        deny('buy', `opening ${level} costs ${skipCost()}, purse holds ${progress.gold}`);
        return;
      }
      Sound.tick();
      goldChanged();
      /* The fee covered the board too, which is what makes it twice an attempt,
         and is what the panel's own Move on has always done with it. Charging the
         same amount here and dealing nothing meant the same ten gold bought two
         different things depending on which screen it was spent from, and a purse
         between the two prices came away holding a level it had paid for and
         could not afford to enter until the next day's draught. */
      Trace.note(`dealt level ${level}`, `paid past ${level - 1} for ${skipCost()}, purse now ${progress.gold}`);
      deal(level);
    };
    /* The same purchase made against the last board of a chapter, so the same
       price: what is bought is passage past a board, wherever it is bought
       from. The frontier moves one board and lands at the gate, which is why
       this ends at the floor of casks and not at a level. See 17-casks.md. */
    MapView.onDoorBuy = section => {
      Sound.unlock();
      const inTheWay = section * CONFIG.sectionSize;
      if (!progress.buyUnlock(inTheWay, skipCost())){
        deny('buy', `moving past ${inTheWay} costs ${skipCost()}, purse holds ${progress.gold}`);
        return;
      }
      Sound.tick();
      goldChanged();
      Trace.note(`stood at the door to chapter ${section + 1}`,
        `paid past ${inTheWay} for ${skipCost()}, purse now ${progress.gold}`);
      showDoor(section);
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
      Sound.drop();
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
      Sound.lift();
      Board.render();
      paintHud();
    };
    $('restart').onclick = () => {
      if (S.queue.length || S.running) return;
      attempt(S.level);
    };
    /* Arming, not buying. Pressing this opens the shelf and pressing it again
       puts it away; the gold moves only when a bottle is chosen, so a player who
       opens it to see what is on offer is charged nothing for looking. */
    $('blast').onclick = () => {
      Sound.unlock();
      Sound.tick();
      if ($('blastPick').hidden) openBlastPick(); else closeBlastPick();
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
      Sound.unlock();
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
        Sound.lift();
        if (!proven) say('A way on, not the shortest');
        paintHud();
      });
    };
    $('toMap').onclick = () => { Sound.tick(); showMap(false); };
    /* the other game's way out, which is the same way out */
    $('bubToMap').onclick = () => { Sound.tick(); showMap(false); };
    /* Leaving a door costs nothing and forfeits nothing, because there was
       nothing to lose: it is not a run, it has no fee and it banks no score. It
       will be exactly the same floor when you come back. */
    $('doorToMap').onclick = () => { Sound.tick(); doorSection = null; showMap(false); };
    $('doorRestart').onclick = () => {
      Sound.tick();
      if (doorSection != null && typeof CasksApp !== 'undefined') CasksApp.newBoard(Levels.doorFor(doorSection));
    };
    const closePanel = () => { closeVeil(); showMap(true); };
    /* The card is a question, so both answers close it and only one of them
       spends anything. Backing out has to leave the map exactly as it was: no
       fee, no board dealt, nothing moved. */
    const closePreview = () => {
      $('previewVeil').classList.remove('show');
      previewLevel = null;
    };
    $('previewBack').onclick = () => { Sound.tick(); closePreview(); };
    $('previewPlay').onclick = () => {
      const level = previewLevel;
      if (level == null) return;
      closePreview();
      Sound.tick();
      showGame(level);
    };
    $('previewVeil').addEventListener('click', e => {
      if (e.target === $('previewVeil')) closePreview();
    });
    $('chapterGo').onclick = () => {
      Sound.unlock(); Sound.tick();
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
      /* `show` only, and deliberately not closeVeil(): this hides the panel to
         look behind it and puts the same panel back afterwards, so the failure
         styling has to survive the trip. */
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
         board was gray and the prompt was asking for a tap that would land on
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
    /* Marked before it opens: offered and declined read the same from here. */
    $('reportOpen').onclick = () => {
      Sound.tick();
      progress.markAsked(S.level);
      $('reportOffer').hidden = true;
      Trace.note(`offered to report level ${S.level}`, 'opened the card from the panel');
      Diagnostics.open();
    };
    $('retry').onclick = () => {
      if (!progress.canAfford(costOf(S.level))){
        deny('retry', `costs ${costOf(S.level)}, purse holds ${progress.gold}`);
        return;
      }
      closeVeil();
      attempt(S.level);
    };
    $('skip').onclick = () => {
      if (!progress.buyUnlock(S.level, skipCost())){
        deny('skip', `costs ${skipCost()}, purse holds ${progress.gold}`);
        return;
      }
      closeVeil();
      const next = Math.min(S.level + 1, progress.lastLevel);
      /* The fee covered the board too, so this deals it without charging again,
         unless what stands next is a door: money reaches the gate and stops. */
      if (progress.doorBefore(next) != null){ showDoor(Levels.sectionOf(next)); return; }
      deal(next);
    };
    $('next').onclick = () => {
      if (S.level >= progress.lastLevel){ deny('next', 'that was the last graded level'); return; }
      /* The way on at the end of a chapter is the door, and it is free. Dealing
         the board behind it here walked straight through the gate. */
      if (progress.doorBefore(S.level + 1) != null){
        closeVeil();
        showDoor(Levels.sectionOf(S.level + 1));
        return;
      }
      if (!progress.canAfford(costOf(S.level + 1))){
        deny('next', `level ${S.level + 1} costs ${costOf(S.level + 1)}, purse holds ${progress.gold}`);
        return;
      }
      closeVeil();
      showGame(S.level + 1);
    };
    $('install').innerHTML = ICON.install;

    /* The sandbox, behind the same word the purse-filling is behind. Drawn and
       wired only when that word is in the address bar, so a shipped build has
       one hidden button and no listeners rather than a feature a query string
       away from anybody who reads the markup. */
    /* The sandbox button, in Jabari mode only. Its glyph lives with the rest of
       the sandbox rather than here, so a build nobody opens it in carries
       neither, and the fetch is started now rather than on the press: in this
       mode it is wanted, and a picker that waits on a network round trip inside
       a tap is the thing 96-deferred.js exists to avoid. */
    if (Jabari.on()){
      const btn = $('sandbox');
      btn.hidden = false;
      btn.onclick = openSandbox;
      Deferred.ready('sandbox').then(() => {
        if (typeof Sandbox !== 'undefined') btn.innerHTML = Sandbox.icon;
      });
    }
    MapView.onScroll = paintJump;
    $('mapJump').onclick = () => {
      Sound.tick();
      MapView.scrollToCurrent(true);
      /* hidden at once rather than on the next scroll event, so it does not sit
         there through the smooth scroll it just started */
      $('mapJump').hidden = true;
    };
    /* Same shape as the sound toggle next to it: one class, every header, wired
       once. A player who needs the hatch needs it on every screen, so the button
       is wherever the sound button is rather than buried in a menu the game does
       not otherwise have. */
    /* One card, opened from every header. What used to be two icons in each of
       four headers is one, which is what stops every future setting costing a
       button on every screen and moving the board under it. */
    document.querySelectorAll('.js-settings').forEach(btn => {
      /* Drawn rather than typed, like every other header icon: a glyph arrives
         as whatever the platform has, which is how a gray plastic blob ended up
         in a gold header once already. */
      btn.innerHTML = ICON.settings;
      btn.onclick = () => { Sound.tick(); $('setVeil').classList.add('show'); };
    });
    $('setClose').onclick = () => { Sound.tick(); $('setVeil').classList.remove('show'); };
    $('setVeil').addEventListener('click', e => {
      if (e.target === $('setVeil')) $('setVeil').classList.remove('show');
    });
    $('setSound').onclick = () => {
      Sound.unlock();
      const on = applySound(!Sound.enabled);
      progress.setSound(on);
      if (on) Sound.lift();
    };
    $('setCb').onclick = () => {
      Sound.tick();
      applyColorblind(!progress.colorblind);
      progress.setColorblind(document.body.classList.contains('cb'));
    };
    $('daily').onclick = () => {
      Sound.unlock();
      if (!progress.claimDaily(today())){ deny('daily', 'already drawn today'); return; }
      Sound.lift();
      goldChanged();
    };

    /* A resize while a pour is in flight cannot rebuild the board: render() wipes
       the bottles and would strand the animation mid air. Dropping it is worse
       though, because nothing brings it back: the glass re-centers by itself in
       CSS while the liquid keeps the geometry it measured before, so the two come
       apart and stay apart. So remember it and apply it once the pours land. */
    let rt;
    const relayout = () => {
      /* Three views now, not two. `else Board.render()` rebuilt the pour game's
         shelf on any resize taken while a bubble level was up — a board that is
         not on the screen, measured at zero height, which then handed Backdrop a
         shelf line at the top of the window to draw the room against. The bubble
         game has its own transform and re-fits itself. */
      const view = document.body.dataset.view;
      if (view === 'map') MapView.render(progress);
      else if (view === 'game') Board.render();
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
    /* Escape puts away whatever is in front of you, and leaves the level only
       when nothing is.

       It used to mean one thing, "leave the level", and it meant it whatever was
       on the screen. A panel is not part of the level though: pressing Escape
       over the end-of-run panel moved the game to the map and left the panel
       sitting on top of it, fully live, offering Try again and Next level for a
       run that had already been banked, over a board that was no longer there.
       The chapter opening did the same.

       So the panels are listed, topmost concern first, and each is closed the
       way its own button closes it rather than by peeling off a class here. A
       panel that grows a way out later gets it here too, in one readable order,
       instead of four handlers disagreeing about which of them is in front. */
    addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if ($('diagVeil').classList.contains('show')){ Diagnostics.close(); return; }
      if ($('previewVeil').classList.contains('show')){ closePreview(); return; }
      if ($('chapterVeil').classList.contains('show')){ $('chapterGo').click(); return; }
      if ($('veil').classList.contains('show')){ closePanel(); return; }
      if (document.body.dataset.view === 'game') showMap(false);
    });
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
      applySound(progress.sound);
      applyColorblind(progress.colorblind);
      showMap(false);
      Jabari.takeGift(progress, goldChanged);
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
    _state: S, _progress: progress,
    /* Ending a run without playing one out.

       The interesting endings are the ones hardest to reach by hand — a board
       that is short of pours rather than out of them, which is the only ending
       a blast can answer — and reaching one in a browser means pouring badly
       against a shelf the level chose. So a spec builds the shelf it wants and
       asks for the ending, which then goes through the same finish() as every
       real run: the same solved check, the same rating, the same panel. */
    _end(){ checkLost(); finish(); }
  };
})();

document.addEventListener('DOMContentLoaded', () => App.boot());
