/* A bubble board off the graded run, at a pace you pick, with no shot limit.

   Jabari mode only, behind the same word the purse-filling is behind, and off
   the critical path for the same reason the card before a replay is: nobody who
   has not typed that word can reach a single line of it, and every load of the
   page would otherwise pay for it. It is fetched when the button is pressed.

   Its own file rather than a hundred lines inside 90-app.js, for the reason
   86-jabari.js is its own file: the beta leaves as a set of files, and "this
   does not count" is a boundary rather than a remark. It knows how to ask for a
   board and how to say what happened, and its host knows how to deal one. It has
   no idea what a level is or what the map is.

   THE FOUR ARE MEASURED, and the first thing the measuring said was that one
   dial cannot do this. Slowing the drops is the obvious lever and it is the
   weakest: clear rates climb to about a row every sixteen and then flatten near
   half however slow it gets, because past that what ends a run is not the feed,
   it is the board silting up with the player's own misses. An Easy built out of
   cadence alone tops out at a coin flip, which is not what the word says.

   So a setting is three numbers, and `colors` does most of the work: it decides
   how often a match is available at all, and four against six is the difference
   between nearly always and often not. `rows` is what a clear costs, and `every`
   is the pressure, which still bites at the hard end.

   What a competent player clears: 100%, 77%, 43%, 12%. Ultra drops back to five
   rows rather than climbing to seven, because six colors is punishing enough on
   its own and seven rows of it is not a harder game, it is the same game lost
   sooner. See tools/bubble-sandbox.mjs. */
export const Sandbox = (() => {
  const $ = id => document.getElementById(id);

  const PACES = [
    { id: 'easy',   name: 'Easy',   colors: 4, rows: 4, every: 20 },
    { id: 'normal', name: 'Normal', colors: 5, rows: 5, every: 18 },
    { id: 'hard',   name: 'Hard',   colors: 5, rows: 6, every: 11 },
    { id: 'ultra',  name: 'Ultra',  colors: 6, rows: 5, every: 16 }
  ];

  /* Which one was taken last time, kept across reloads.

     A key of its own rather than a field in the save, the way this game's sound
     preference is: the beta leaves as a set of files, and a schema the states
     suite enumerates is not the place to put something that goes away. An
     unreadable or unrecognized value falls back to Normal, which is also what a
     player who has never picked one gets, so there is one answer to "what is
     selected" rather than one for a fresh device and another for a bad read. */
  const KEY = 'decanter.sandbox.pace';
  /* Best score per difficulty, kept beside the pace and for the same reasons: a
     key of its own rather than a field in the save, because the beta leaves as a
     set of files and the states suite enumerates that schema. Per difficulty
     because one number across four settings compares runs that are not the same
     game: Easy deals four colors and Ultra six. */
  const BEST_KEY = 'decanter.sandbox.best';
  const bestAll = () => {
    try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; }
    catch (e){ return {}; }
  };
  const bestFor = id => Number(bestAll()[id]) || 0;
  const rememberBest = (id, score) => {
    if (!(score > bestFor(id))) return;
    try { localStorage.setItem(BEST_KEY, JSON.stringify({ ...bestAll(), [id]: score })); }
    catch (e){}
  };
  const NORMAL = PACES[1];
  const remembered = () => {
    try { return PACES.find(p => p.id === localStorage.getItem(KEY)) || NORMAL; }
    catch (e){ return NORMAL; }
  };
  const remember = p => { try { localStorage.setItem(KEY, p.id); } catch (e){} };

  /* the pace the last board was dealt at, so Again means again */
  let pace = remembered();
  /* which board, stepped so Again at one pace is a different board rather than
     the same one replayed */
  let seed = 1;
  let built = false;
  /* what the host can do that this cannot: deal a board, say which level is
     current, and leave */
  let host = { openBubble(){}, toMap(){}, level: () => 1, retool(){}, still: null };

  /* Built on the first press rather than shipped as markup. The shell is what
     every load revalidates, and a picker only a beta player can open has no
     business in it. */
  function build(){
    if (built) return;
    const veil = document.createElement('div');
    veil.className = 'veil';
    veil.id = 'sandboxVeil';
    veil.innerHTML = `<div class="panel">
      <h2>Bubble Blaster!</h2>
      <p class="sandboxWhy">No shot limit. Clear the board to win.<br>
        Games here don't count toward your journey.</p>
      <div class="sandboxPicks" id="sandboxPicks"></div>
      <div class="stillBox" id="sandboxStill"></div>
      <p class="sandboxBest" id="sandboxBest"></p>
      <button class="btn primary" id="sandboxPlay" type="button">Play</button>
      <button class="btn" id="sandboxClose" type="button">Back</button>
    </div>`;

    const end = document.createElement('div');
    end.className = 'veil';
    end.id = 'sandboxEnd';
    end.innerHTML = `<div class="panel">
      <h2 id="sandboxResult">Board cleared</h2>
      <p class="sandboxWhy" id="sandboxWhy"></p>
      <p class="payout"><b id="sandboxScore">0</b><span>points</span></p>
      <button class="btn primary" id="sandboxAgain" type="button">Again</button>
      <button class="btn" id="sandboxPace" type="button">Change pace</button>
      <button class="btn ghost" id="sandboxToMap" type="button">&larr; Map</button>
    </div>`;

    document.body.append(veil, end);
    built = true;

    $('sandboxPlay').onclick = () => { hide(); deal(); };
    $('sandboxClose').onclick = close;
    veil.addEventListener('click', e => { if (e.target === veil) close(); });
    $('sandboxAgain').onclick = () => { hide(); seed++; deal(); };
    $('sandboxPace').onclick = () => { hide(); open(); };
    $('sandboxToMap').onclick = () => { hide(); host.toMap(); };
  }

  /* Taking a name shows what it deals rather than dealing it.

     A difficulty is three numbers that only mean something together, so a name
     on its own says nothing and the numbers say less. A board does: four colors
     against six is obvious at a glance in a way "a row every 20" never is. So
     the pick is a preview and starting is a separate press.

     The board shown is the one the Play button would deal, drawn through the
     game's own dealer under those rules rather than mocked up here. */
  function show(){
    for (const b of $('sandboxPicks').children){
      b.classList.toggle('primary', b.dataset.pace === pace.id);
    }
    const box = $('sandboxStill');
    if (box && host.still){
      box.innerHTML = host.still(seed, {
        colors: pace.colors, rows: pace.rows, every: pace.every, runShots: null
      });
    }
    const best = bestFor(pace.id);
    $('sandboxBest').textContent = best
      ? `Best on ${pace.name.toLowerCase()}: ${best}`
      : `No ${pace.name.toLowerCase()} run yet.`;
  }

  function open(){
    build();
    const picks = $('sandboxPicks');
    picks.innerHTML = '';
    for (const p of PACES){
      const b = document.createElement('button');
      b.className = 'btn';
      b.type = 'button';
      b.dataset.pace = p.id;
      /* The word and nothing else. What each one is made of is three numbers
         that only mean something together, and printing one of them invites the
         reading that it is the setting: "a row every 16" says nothing about the
         colors or the rows that do most of the work. The board below says it
         all at once. */
      b.textContent = p.name;
      b.onclick = () => { pace = p; remember(p); show(); };
      picks.appendChild(b);
    }
    show();
    $('sandboxEnd').classList.remove('show');
    $('sandboxVeil').classList.add('show');
  }

  /* One of each, per board.

     Unlimited and free was the first shape and it was wrong twice over. It made
     the workbench a solver, which is the same objection the cellar door's tools
     failed: a hint you can press on every shot is not advice, it is the answer,
     and a board played that way tells you nothing about the setting you picked.
     And it quietly lied, because saying "free" here only changed the label. The
     charge still went through the host and took real gold; Jabari mode fills the
     purse to seven figures, so nobody would have noticed it draining.

     One each is enough to get out of a corner and not enough to be carried, and
     it costs nothing, which is the honest version of what the label already
     said. A spent tool is taken off the row rather than left to be pressed and
     refused, the same way an ungranted one is. */
  const ALLOWANCE = { undo: 1, hint: 1, color: 1, bomb: 1 };
  let left = { ...ALLOWANCE };
  /* Swap is not in here. It costs nothing in the graded game either, because it
     reorders two bubbles the sequence was going to hand over anyway. */
  const allowFrom = () => ({ swap: true,
    undo: left.undo > 0, hint: left.hint > 0,
    color: left.color > 0, bomb: left.bomb > 0 });
  const pricesFrom = () => {
    const say = n => (n > 0 ? { free: true, left: n } : undefined);
    return { undo: say(left.undo), hint: say(left.hint),
             color: say(left.color), bomb: say(left.bomb) };
  };

  /* Asked before the tool acts, so a refusal changes nothing. Spending one
     re-hands the row to the game, because a tool with none left is a tool the
     board no longer offers. */
  function spend(what){
    if (!(what in left)) return true;
    if (left[what] <= 0) return false;
    left[what] -= 1;
    host.retool(allowFrom(), pricesFrom);
    return true;
  }
  function deal(){
    left = { ...ALLOWANCE };
    host.openBubble({
      level: host.level(), seed, sandbox: true,
      rules: { every: pace.every, runShots: null,
               colors: pace.colors, rows: pace.rows },
      allow: allowFrom(),
      prices: pricesFrom,
      charge: spend,
      note: `${pace.name}: ${pace.colors} colors, ${pace.rows} rows, a row every ${pace.every}`
    });
  }

  const close = () => { if (built) $('sandboxVeil').classList.remove('show'); };
  const hide = () => {
    if (!built) return;
    $('sandboxVeil').classList.remove('show');
    $('sandboxEnd').classList.remove('show');
  };

  /* What a sandbox run did, which is never anything a save should hear about.
     The game zeroes the stars on a run played under anything but the graded
     rules, and the host refuses to bank one, so this only has to say it out
     loud. */
  function ended(run){
    if (!built) return;
    const cleared = run.cleared;
    $('sandboxResult').textContent = cleared ? 'Board cleared' : 'Game over';
    $('sandboxWhy').textContent = cleared
      ? `Every bubble gone, in ${run.shots} shots at ${pace.name.toLowerCase()}.`
      : `${run.shots} shots at ${pace.name.toLowerCase()} before the line.`;
    $('sandboxScore').textContent = run.score;
    rememberBest(pace.id, run.score);
    $('sandboxEnd').classList.add('show');
  }

  /* Three bubbles, in the same weight as the header's other two so a beta build
     does not look like a different build. Here rather than with them because
     nothing outside this mode ever draws it. */
  /* Four circles of different sizes packed together rather than three of nearly
     one size. Varied size is what makes a cluster read as bubbles at all; evenly
     sized circles read as dots, or as the nodes of a diagram. */
  const icon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8.5" cy="8.5" r="4.6"/><circle cx="17" cy="7.5" r="2.6"/><circle cx="14.5" cy="16" r="4"/><circle cx="6.5" cy="17.5" r="2.2"/></svg>';

  return {
    open, hide, ended, icon,
    get pace(){ return pace; },
    /* Handed in rather than reached for, the way 86-jabari.js is handed a purse:
       dealing a board means a run id, a view, a boot and a fetch, all of which
       are the host's business and none of which are this file's. */
    set host(h){ host = { openBubble(){}, toMap(){}, level: () => 1, retool(){}, still: null, ...h }; }
  };
})();
