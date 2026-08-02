/* Talks to the A* solver. Prefers a real worker so a long search never blocks
   the UI, and degrades to an inline run with a small budget if workers are
   unavailable (some sandboxed embeds). */
const SolverClient = (() => {
  let worker = null, ok = true, nextId = 1;
  const pending = new Map();

  /* Two builds, two ways to reach the same file. The installable one hashes the
     solver into its own script and names it in a meta tag, so it caches like
     everything else. The portable one has nowhere to fetch from, so it carries
     the source in a script tag the browser will not execute and this turns it
     into a blob. Whichever is present is the one that is used. */
  const workerUrl = () => {
    const el = document.querySelector('meta[name="solver"]');
    return el ? el.getAttribute('content') : '';
  };
  const inlineSource = () => {
    const el = document.getElementById('solverSrc');
    return el ? el.textContent : '';
  };
  function boot(){
    if (worker || !ok) return;
    try {
      const url = workerUrl();
      worker = url ? new Worker(url)
        : new Worker(URL.createObjectURL(new Blob([inlineSource()], { type: 'application/javascript' })));
      worker.onmessage = e => {
        const cb = pending.get(e.data.id);
        if (cb){ pending.delete(e.data.id); cb(e.data); }
      };
      worker.onerror = () => { ok = false; worker = null; };
    } catch (e) { ok = false; }
  }
  /* The fallback for embeds where a Worker cannot be constructed at all. It needs
     the source as text, which in the installable build means fetching the same
     file the worker would have been — served from the cache offline, like every
     other asset. Fetched once and kept, because this path runs per solve. */
  let sourceText = null;
  function source(){
    if (sourceText != null) return Promise.resolve(sourceText);
    const inlined = inlineSource();
    if (inlined) return Promise.resolve((sourceText = inlined));
    const url = workerUrl();
    if (!url) return Promise.resolve((sourceText = ''));
    return fetch(url).then(r => r.text()).then(t => (sourceText = t)).catch(() => (sourceText = ''));
  }
  function inline(payload, cb){
    source().then(src => {
      try {
        if (!src) throw new Error('no solver source');
        const stub = {};
        new Function('self', src)(stub);
        stub.postMessage = m => cb(m);
        stub.onmessage({ data: Object.assign({}, payload, { nodeCap: 60000, msCap: 1200 }) });
      } catch (e) { cb({ id: payload.id, par: null, exact: false }); }
    });
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
