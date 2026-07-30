/* Talks to the A* solver. Prefers a real worker so a long search never blocks
   the UI, and degrades to an inline run with a small budget if workers are
   unavailable (some sandboxed embeds). */
const SolverClient = (() => {
  let worker = null, ok = true, nextId = 1;
  const pending = new Map();

  function source(){
    const el = document.getElementById('solverSrc');
    return el ? el.textContent : '';
  }
  function boot(){
    if (worker || !ok) return;
    try {
      const blob = new Blob([source()], { type: 'application/javascript' });
      worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = e => {
        const cb = pending.get(e.data.id);
        if (cb){ pending.delete(e.data.id); cb(e.data); }
      };
      worker.onerror = () => { ok = false; worker = null; };
    } catch (e) { ok = false; }
  }
  function inline(payload, cb){
    setTimeout(() => {
      try {
        const stub = {};
        new Function('self', source())(stub);
        stub.postMessage = m => cb(m);
        stub.onmessage({ data: Object.assign({}, payload, { nodeCap: 60000, msCap: 1200 }) });
      } catch (e) { cb({ id: payload.id, par: null, exact: false }); }
    }, 20);
  }
  return {
    solve(tubes, colors, cb){
      boot();
      const id = nextId++;
      const payload = {
        id, tubes: Rules.clone(tubes), cap: Rules.CAP, colors,
        nodeCap: CONFIG.solver.nodeCap, msCap: CONFIG.solver.msCap
      };
      if (worker && ok){ pending.set(id, cb); worker.postMessage(payload); }
      else inline(payload, cb);
      return id;
    }
  };
})();
globalThis.SolverClient = SolverClient;
