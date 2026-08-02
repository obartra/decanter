/* The workbench.

   Every other page in this build is a game. This one is a frame around the
   games: it opens the real built page in an iframe and reaches into it. Same
   origin, so `contentWindow` hands over the actual live modules — the same
   objects the player's browser is running, not a copy compiled for a lab.

   That is the whole reason it is built this way rather than as a page that
   mounts each game itself. A workbench that re-hosts a game is a second place
   the game can be set up, and the day the two disagree the workbench is quietly
   testing something nobody ships. Here there is nothing to disagree with: the
   thing in the frame IS /measure/, byte for byte, and turning a knob reaches
   through and moves the same constant the game read at boot.

   It costs almost nothing, too. The games are already built and already
   precached; this page is a sidebar. */
const LabApp = (() => {
  const C = LabConfig;
  const S = LabSweep;

  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const st = {
    game: null,          /* the entry from LabConfig.games */
    win: null,           /* the frame's window, once it has loaded */
    level: 1,
    /* what each knob was when the frame loaded, so Reset means something even
       after a dozen changes */
    defaults: new Map(),
    /* which knobs are no longer at the value the game shipped with. A moved
       generation knob means the committed par table describes boards that are no
       longer being dealt, so the readout has to say that rather than reporting a
       disagreement as though something were broken. */
    moved: new Set(),
    sweeping: false
  };

  /* ---- reaching into the frame ---- */

  /* Everything the lab reads out of the frame goes through here, so a game that
     has not finished loading is one `null` rather than a scattering of
     TypeErrors. */
  function mods(){
    const w = st.win, g = st.game;
    if (!w || !g || !w[g.config] || !w[g.app]) return null;
    const out = { C: w[g.config], app: w[g.app] };
    if (g.levels) out.levels = w[g.levels];
    if (g.pars) out.pars = w[g.pars];
    if (g.search) out.search = w[g.search];
    /* Read off the entry rather than written here. See the note beside
       survivalMods in 00-config.js: that file is the one place allowed to name
       another game's internals, and it only stays the one place if this does
       not quietly become a second. */
    for (const [as, name] of Object.entries(g.survivalMods || {})) out[as] = w[name];
    return out;
  }

  /* ---- the games ---- */

  function pickGame(id){
    const game = C.games.find(g => g.id === id);
    if (!game || game === st.game) return;
    st.game = game;
    st.win = null;
    st.level = game.firstLevel;
    st.defaults.clear();
    st.moved.clear();

    for (const tab of document.querySelectorAll('.labTab')){
      tab.classList.toggle('on', tab.dataset.game === id);
      tab.setAttribute('aria-selected', tab.dataset.game === id ? 'true' : 'false');
    }
    $('labNote').textContent = '';
    $('labKnobs').replaceChildren(el('p', 'labWait', 'Loading ' + game.title + '…'));
    $('labSweepOut').replaceChildren();

    const frame = $('labFrame');
    frame.title = game.title;
    /* A fresh document every time, so a game is never carrying knob changes from
       the last one it was shown with. */
    frame.src = game.path + '?lab=' + Date.now();
  }

  function frameLoaded(){
    const frame = $('labFrame');
    let w = null;
    try { w = frame.contentWindow; } catch (e) { w = null; }
    st.win = w;
    const m = mods();
    if (!m){
      $('labKnobs').replaceChildren(
        el('p', 'labWait', 'That page loaded but did not publish what the lab expects.'));
      return;
    }
    for (const k of st.game.knobs) st.defaults.set(k.key, clone(m.C[k.key]));
    drawKnobs();
    drawLevel();
  }

  const clone = v => (Array.isArray(v) ? v.slice() : (v && typeof v === 'object' ? { ...v } : v));

  /* ---- knobs ---- */

  function drawKnobs(){
    const m = mods();
    const box = $('labKnobs');
    box.replaceChildren();
    for (const knob of st.game.knobs){
      const row = el('div', 'labKnob');
      const head = el('label', 'labKnobHead');
      head.append(el('span', 'labKnobName', knob.key));
      const val = el('b', 'labKnobVal', String(m.C[knob.key]));
      head.append(val);
      row.append(head);

      const input = el('input', 'labRange');
      input.type = 'range';
      input.min = knob.min; input.max = knob.max; input.step = knob.step;
      input.value = m.C[knob.key];
      input.setAttribute('aria-label', knob.key);
      input.oninput = () => {
        const n = Number(input.value);
        val.textContent = String(n);
        setKnob(knob, n);
      };
      row.append(input);
      row.append(el('p', 'labKnobNote', knob.note));
      box.append(row);
    }
    const reset = el('button', 'labBtn', 'Reset to shipped');
    reset.type = 'button';
    reset.onclick = resetKnobs;
    box.append(reset);
  }

  /* Move one constant and put the game back together.

     `rederive` is not a nicety. A config that computes values from other values
     does it once, when the file runs, so a game whose world is derived from its
     column count keeps the old world until something recomputes it — and the
     board is dealt into a grid that no longer matches the walls, which draws as
     bubbles sitting outside the playfield with nothing to explain it. */
  function setKnob(knob, value){
    const m = mods();
    if (!m) return;
    m.C[knob.key] = value;
    const shipped = st.defaults.get(knob.key);
    if (value === shipped) st.moved.delete(knob.key); else st.moved.add(knob.key);
    if (st.game.rederive) rederive(m.C);
    if (knob.reboot && typeof m.app.boot === 'function') m.app.boot();
    deal();
  }

  /* The bubble game's derived block, restated. It lives at the bottom of that
     game's config and runs once; this is the only other place that has to know
     it exists, and tests/lab.test.mjs checks the two agree. */
  function rederive(cfg){
    cfg.WORLD_W = cfg.COLS + 0.5;
    cfg.WORLD_H = cfg.ROW_H * (cfg.ROWS - 1) + 1 + cfg.LAUNCH_BAND;
    cfg.MUZZLE = { x: cfg.WORLD_W / 2, y: cfg.WORLD_H - cfg.LAUNCH_BAND + 1.5 };
  }

  function resetKnobs(){
    const m = mods();
    if (!m) return;
    for (const [key, value] of st.defaults) m.C[key] = clone(value);
    st.moved.clear();
    if (st.game.rederive) rederive(m.C);
    if (typeof m.app.boot === 'function') m.app.boot();
    drawKnobs();
    deal();
  }

  /* ---- levels ---- */

  function deal(){
    const m = mods();
    if (!m) return;
    try { m.app.newBoard(st.level); }
    catch (e) { $('labNote').textContent = 'That board would not deal: ' + e.message; return; }
    drawLevel();
  }

  function drawLevel(){
    const m = mods();
    if (!m) return;
    $('labLevel').value = String(st.level);
    const state = m.app._state || {};
    const bits = [];
    if (state.par != null) bits.push('par ' + state.par);
    else if (st.game.sweep === 'par') bits.push('unrated');
    if (state.moves != null) bits.push(state.moves + ' played');

    /* Ask the search again rather than trusting the readout. On the two games
       with a par this is the cheap version of what the sweep does over a range,
       and it is the one number worth double checking while a knob is moving:
       the shipped table was measured against constants that may no longer be
       the ones in the frame. */
    if (st.game.sweep === 'par' && m.levels && m.search){
      try {
        const board = m.levels.make(st.level);
        if (board){
          const got = board.caps
            ? m.search.solve(board.caps, board.start, board.target)
            : m.search.solve(board.layout, board.start);
          if (got && Number.isInteger(got.par)){
            bits.push('search says ' + got.par);
            if (state.par != null && state.par !== got.par){
              /* Two very different things wear the same shape here. With every
                 knob where the game shipped it, the table and the search
                 disagreeing is a fault worth shouting about. With a knob moved,
                 it is the expected and entirely correct consequence of dealing a
                 board the table was never measured against, and calling that a
                 disagreement would train somebody to ignore the one that
                 matters. */
              bits.push(st.moved.size
                ? `table is stale (${[...st.moved].join(', ')} moved)`
                : 'DISAGREE');
            }
          } else {
            bits.push('search finds no way');
          }
        }
      } catch (e) { bits.push('search threw: ' + e.message); }
    }
    $('labNote').textContent = bits.join(' · ');
  }

  function step(by){
    st.level = Math.max(1, st.level + by);
    deal();
  }

  /* ---- the sweep ---- */

  async function sweep(){
    const m = mods();
    if (!m || st.sweeping) return;
    st.sweeping = true;
    const out = $('labSweepOut');
    out.replaceChildren(el('p', 'labWait', 'Measuring…'));
    /* a frame to paint the word before the search takes the thread */
    await new Promise(r => requestAnimationFrame(() => r()));

    try {
      if (st.game.sweep === 'par'){
        const from = Math.max(1, Number($('labFrom').value) || 1);
        const to = Math.max(from, Number($('labTo').value) || from);
        showPars(S.pars(m, from, Math.min(to, from + 199)));
      } else {
        const seeds = Math.max(5, Math.min(400, Number($('labSeeds').value) || 60));
        /* Three players, because one number cannot say what you need to know:
           the bot that always takes the hint's shot, somebody who misjudges
           three shots in ten, and somebody aiming at any reachable cell at all.
           A bar is only a bar if the gap between the middle one and the last one
           is the whole of it. */
        const good = S.survival(m, seeds, 0.3);
        const bot = S.survival(m, Math.min(seeds, 60), 0);
        const random = S.survival(m, Math.min(seeds, 60), 1);
        showSurvival({ good, bot, random }, m.C.STAR_SHOTS);
      }
    } catch (e) {
      out.replaceChildren(el('p', 'labWait', 'The sweep threw: ' + e.message));
    }
    st.sweeping = false;
  }

  function showPars(res){
    const out = $('labSweepOut');
    out.replaceChildren();
    const vals = res.rows.map(r => r.found ?? r.shipped);
    out.append(chart(vals, res.rows.map(r => r.level)));

    const lines = [];
    lines.push(`par ${res.min} to ${res.max} over ${res.rows.length} levels`);
    lines.push(res.drops.length
      ? `${res.drops.length} step${res.drops.length > 1 ? 's' : ''} down, at ${res.drops.slice(0, 8).join(', ')}`
      : 'no step goes down');
    if (res.disagreements.length)
      lines.push(`SHIPPED PAR DISAGREES WITH THE SEARCH at ${res.disagreements.slice(0, 8).join(', ')}`);
    if (res.unrated.length) lines.push(`${res.unrated.length} unrated`);
    for (const line of lines){
      out.append(el('p', 'labStat' + (/DISAGREE|step/.test(line) && !/no step/.test(line) ? ' bad' : ''), line));
    }
  }

  function showSurvival(runs, stars){
    const out = $('labSweepOut');
    out.replaceChildren();
    const pct = x => Math.round(x * 100) + '%';
    out.append(chart(runs.good.shots.slice(), null));
    out.append(el('p', 'labStat',
      `bars ${stars.one} / ${stars.two} / finish, over ${runs.good.seeds} runs`));
    for (const [name, run] of [['bot', runs.bot], ['player', runs.good], ['random', runs.random]]){
      out.append(el('p', 'labStat',
        `${name.padEnd(6)} ${pct(run.at.one)} · ${pct(run.at.two)} · ${pct(run.at.three)}` +
        `  (median ${run.median}, longest ${run.max})`));
    }
    out.append(el('p', 'labStat',
      `${pct(runs.good.forced)} of turns have nothing to clear with · ` +
      Object.entries(runs.good.how).map(([k, v]) => `${k} ${v}`).join(' · ')));
    const ok = S.tracks(runs.good, runs.random);
    out.append(el('p', 'labStat' + (ok ? '' : ' bad'),
      ok ? 'the bars still separate playing from flailing'
         : 'the bars no longer separate playing from flailing'));
  }

  /* A chart rather than a table, because the shape of a difficulty curve is the
     thing being looked at and a column of sixty numbers does not have one. */
  function chart(values, labels){
    const cv = el('canvas', 'labChart');
    const w = 320, h = 90, dpr = Math.min(3, devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = '100%';
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const seen = values.filter(v => v != null);
    if (!seen.length) return cv;
    const hi = Math.max(...seen), lo = 0;
    const bw = w / values.length;
    for (let i = 0; i < values.length; i++){
      const v = values[i];
      if (v == null){
        ctx.fillStyle = 'rgba(226,84,111,.5)';
        ctx.fillRect(i * bw, h - 4, Math.max(1, bw - 0.6), 4);
        continue;
      }
      const bh = ((v - lo) / Math.max(1, hi - lo)) * (h - 6);
      const down = i > 0 && values[i - 1] != null && v < values[i - 1];
      ctx.fillStyle = down ? '#E2546F' : 'rgba(224,177,92,.75)';
      ctx.fillRect(i * bw, h - bh, Math.max(1, bw - 0.6), bh);
    }
    ctx.fillStyle = 'rgba(162,144,122,.9)';
    ctx.font = '9px "Alegreya Sans", sans-serif';
    ctx.fillText(String(hi), 2, 10);
    if (labels) ctx.fillText(String(labels[0]) + '–' + labels[labels.length - 1], 2, h - 2);
    return cv;
  }

  /* ---- boot ---- */
  function boot(){
    const tabs = $('labTabs');
    for (const game of C.games){
      const tab = el('button', 'labTab', game.title);
      tab.type = 'button';
      tab.dataset.game = game.id;
      tab.setAttribute('role', 'tab');
      tab.onclick = () => pickGame(game.id);
      tabs.append(tab);
    }
    $('labFrame').addEventListener('load', frameLoaded);
    $('labPrev').onclick = () => step(-1);
    $('labNext').onclick = () => step(1);
    $('labLevel').onchange = () => {
      st.level = Math.max(1, Number($('labLevel').value) || 1);
      deal();
    };
    $('labSweep').onclick = sweep;
    pickGame(C.games[0].id);
  }

  return { boot, sweep, _state: st };
})();

/* Not published. Every other 90-app.js parks itself on globalThis because
   something outside it reaches in — the app hands the bubble game its purse, and
   this page reaches into all three. Nothing reaches into the lab, so a name here
   would be one more thing on the page that nothing looks up. */
if (document.body.dataset.only === 'lab'){
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', LabApp.boot);
  else LabApp.boot();
}
