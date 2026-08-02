/* What to read out when the game does nothing.

   The report that prompted this said a level did nothing when it was tapped, and
   there was no way to find out what the game thought had happened: which build,
   which save, how much gold, whether anything had been refused and why. All of
   that existed, none of it was reachable, and the game sends nothing anywhere,
   so the only way to get at it is to put it on the screen.

   It is opened by holding the gold count for a moment, on either screen. That is
   deliberately not a button: it costs no room in a footer that is already full,
   it cannot be hit by accident, and it is one sentence to describe to someone
   who is stuck — "press and hold the gold number". Support instructions do not
   need to be discoverable, they need to be sayable.

   Nothing here is collected, uploaded or timed. It reads state that already
   exists and formats it. */
const Diagnostics = (() => {
  const HOLD_MS = 700;
  let readState = () => ({});
  let hold = null;

  const el = id => document.getElementById(id);
  const buildId = () => {
    const m = document.querySelector('meta[name="build"]');
    return (m && m.getAttribute('content')) || 'dev';
  };

  /* The save as a line rather than as JSON. A player reading this to someone
     else can say "unlocked 15, gold 4"; they cannot say a brace. */
  function saveLine(progress){
    const raw = progress.raw;
    const seen = Object.keys(raw.seen || {}).sort().join(',') || 'none';
    return [
      `layout ${raw.layout}`,
      `unlocked ${raw.unlocked}`,
      `gold ${progress.gold}`,
      `${progress.totalStars()} stars`,
      `chapters read ${seen}`,
      `daily ${raw.dailyOn || 'never'}`
    ].join(' · ');
  }
  function perkLine(progress){
    const p = progress.perks();
    /* Every tool a chapter can hand over. This list is the one thing here that
       has to be kept in step with 36-chapters.js by hand, and it was already one
       short: a player reporting that the blast did nothing would have got back a
       line that did not mention the blast. Read off the perks rather than
       written out again, so the next grant appears here without being added. */
    const on = Object.keys(p).filter(k => p[k] === true);
    return `${on.join(' ') || 'none'} · ${p.freeUndos} free undos · hints ${p.hintCost} · ${p.freeHints} free`;
  }
  function runLine(state){
    if (!state || !state.tubes || !state.tubes.length) return 'no board dealt';
    return [
      `level ${state.level}`,
      `${state.tubes.length} bottles`,
      `${state.moves} pours`,
      `par ${state.par == null ? 'unknown' : state.par}${state.parExact ? '' : ' (approx)'}`,
      state.over ? `over: ${state.reason || 'won'}` : 'in play',
      state.running || state.queue.length ? 'animating' : 'settled'
    ].join(' · ');
  }
  function countLine(){
    const c = Trace.counts;
    const kinds = Object.entries(c.refusals).map(([k, n]) => `${k}:${n}`).join(' ') || 'none';
    return `${c.refused} refused (${kinds}) · ${c.fault} faults`;
  }

  function compose(){
    const { progress, state } = readState();
    const lines = [
      `Decanter build ${buildId()}`,
      `${innerWidth}x${innerHeight} dpr${(devicePixelRatio || 1).toFixed(1)} · ${document.body.dataset.view}`,
      ''
    ];
    if (progress){
      lines.push(`save: ${saveLine(progress)}`);
      lines.push(`tools: ${perkLine(progress)}`);
      const d = progress.diag;
      if (d && d.faults) lines.push(`faults on record: ${d.faults} · last: ${d.lastFault}`);
      const ever = Object.entries(d && d.refused || {}).map(([k, n]) => `${k}:${n}`).join(' ');
      if (ever) lines.push(`refused ever: ${ever}`);
    }
    lines.push(`run: ${runLine(state)}`);
    lines.push(`this session: ${countLine()}`);
    lines.push('', '--- what happened ---');
    const log = Trace.lines();
    lines.push(...(log.length ? log : ['nothing recorded']));
    return lines.join('\n');
  }

  function open(){
    el('diagText').textContent = compose();
    el('diagCopy').textContent = 'Copy';
    el('diagVeil').classList.add('show');
  }
  function close(){ el('diagVeil').classList.remove('show'); }

  /* Copying has to work with no network and no permissions prompt in the way, so
     a refused clipboard falls back to selecting the text and saying so: someone
     can always copy a selection by hand. */
  async function copy(){
    const text = el('diagText').textContent;
    try {
      await navigator.clipboard.writeText(text);
      el('diagCopy').textContent = 'Copied';
    } catch (e) {
      const range = document.createRange();
      range.selectNodeContents(el('diagText'));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      el('diagCopy').textContent = 'Selected — copy it';
    }
  }

  return {
    /* the app hands over a way to read itself, rather than this reaching into it */
    set source(fn){ readState = fn; },
    open,
    mount(){
      const cancel = () => { clearTimeout(hold); hold = null; };
      document.querySelectorAll('.purse').forEach(p => {
        p.addEventListener('pointerdown', () => {
          cancel();
          hold = setTimeout(open, HOLD_MS);
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(e => p.addEventListener(e, cancel));
      });
      el('diagClose').onclick = close;
      el('diagCopy').onclick = copy;
      el('diagVeil').addEventListener('click', e => { if (e.target === el('diagVeil')) close(); });
    }
  };
})();
globalThis.Diagnostics = Diagnostics;
