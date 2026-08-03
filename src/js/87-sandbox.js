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

   So a setting is three numbers, and `colours` does most of the work: it decides
   how often a match is available at all, and four against six is the difference
   between nearly always and often not. `rows` is what a clear costs, and `every`
   is the pressure, which still bites at the hard end.

   What a competent player clears: 100%, 77%, 43%, 12%. Ultra drops back to five
   rows rather than climbing to seven, because six colours is punishing enough on
   its own and seven rows of it is not a harder game, it is the same game lost
   sooner. See tools/bubble-sandbox.mjs. */
export const Sandbox = (() => {
  const $ = id => document.getElementById(id);

  const PACES = [
    { id: 'easy',   name: 'Easy',   colours: 4, rows: 4, every: 20 },
    { id: 'normal', name: 'Normal', colours: 5, rows: 5, every: 18 },
    { id: 'hard',   name: 'Hard',   colours: 5, rows: 6, every: 11 },
    { id: 'ultra',  name: 'Ultra',  colours: 6, rows: 5, every: 16 }
  ];

  /* Which one was taken last time, kept across reloads.

     A key of its own rather than a field in the save, the way this game's sound
     preference is: the beta leaves as a set of files, and a schema the states
     suite enumerates is not the place to put something that goes away. An
     unreadable or unrecognised value falls back to Normal, which is also what a
     player who has never picked one gets, so there is one answer to "what is
     selected" rather than one for a fresh device and another for a bad read. */
  const KEY = 'decanter.sandbox.pace';
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
  let host = { openBubble(){}, toMap(){}, level: () => 1 };

  /* Built on the first press rather than shipped as markup. The shell is what
     every load revalidates, and a picker only a beta player can open has no
     business in it. */
  function build(){
    if (built) return;
    const veil = document.createElement('div');
    veil.className = 'veil';
    veil.id = 'sandboxVeil';
    veil.innerHTML = `<div class="panel">
      <p class="kicker">Bubble sandbox</p>
      <h2>Pick a pace</h2>
      <p class="sandboxWhy">A row drops every so many shots, and there is no shot
        limit at all. Clear the board to win. Nothing here counts.</p>
      <div class="sandboxPicks" id="sandboxPicks"></div>
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

    $('sandboxClose').onclick = close;
    veil.addEventListener('click', e => { if (e.target === veil) close(); });
    $('sandboxAgain').onclick = () => { hide(); seed++; deal(); };
    $('sandboxPace').onclick = () => { hide(); open(); };
    $('sandboxToMap').onclick = () => { hide(); host.toMap(); };
  }

  function open(){
    build();
    const picks = $('sandboxPicks');
    picks.innerHTML = '';
    for (const p of PACES){
      const b = document.createElement('button');
      b.className = `btn${p.id === pace.id ? ' primary' : ''}`;
      b.type = 'button';
      /* The word and nothing else. What each one is made of is four numbers
         that only mean something together, and printing one of them invites the
         reading that it is the setting: "a row every 16" says nothing about the
         three colours or the four rows that do most of the work. */
      b.textContent = p.name;
      b.onclick = () => { pace = p; remember(p); hide(); deal(); };
      picks.appendChild(b);
    }
    $('sandboxEnd').classList.remove('show');
    $('sandboxVeil').classList.add('show');
  }

  /* Every tool, and free. Nothing here is graded, so there is no run to protect
     and a workbench with the hint switched off is a worse workbench. */
  const FREE = { free: true };
  function deal(){
    host.openBubble({
      level: host.level(), seed, sandbox: true,
      rules: { every: pace.every, runShots: null,
               colours: pace.colours, rows: pace.rows },
      allow: { undo: true, hint: true, swap: true, colour: true, bomb: true },
      prices: () => ({ undo: FREE, hint: FREE, colour: FREE, bomb: FREE }),
      note: `${pace.name}: ${pace.colours} colours, ${pace.rows} rows, a row every ${pace.every}`
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
    $('sandboxEnd').classList.add('show');
  }

  /* Three bubbles, in the same weight as the header's other two so a beta build
     does not look like a different build. Here rather than with them because
     nothing outside this mode ever draws it. */
  const icon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="4"/><circle cx="17" cy="12" r="3"/><circle cx="10" cy="17.5" r="2.5"/></svg>';

  return {
    open, hide, ended, icon,
    get pace(){ return pace; },
    /* Handed in rather than reached for, the way 86-jabari.js is handed a purse:
       dealing a board means a run id, a view, a boot and a fetch, all of which
       are the host's business and none of which are this file's. */
    set host(h){ host = { openBubble(){}, toMap(){}, level: () => 1, ...h }; }
  };
})();
