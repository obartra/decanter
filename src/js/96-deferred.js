/* Everything the page does not need in order to open.

   The critical bundle is the pour game and nothing else. The sound and the
   second game are fetched from here: right after load, eagerly, rather than at
   the moment something first needs them.

   Eagerly rather than on demand is the whole point. Waiting until first need
   would put a network round trip inside a tap, and on a game that is meant to
   work offline it would put it there on precisely the load where the cache is
   still cold. Fetching now means the worker finishes filling its cache while the
   player is still reading the map, and by the time a bubble level comes up the
   code for it has been on the device for several minutes.

   The list is written into the page by the build. The standalone file has no
   list, because it has nothing to fetch: every byte is already in it. So an
   absent or empty manifest is not an error, it is the other build. */
const Deferred = (() => {
  /* name -> a promise that settles when that group has landed */
  const waiting = new Map();
  /* name -> the resolver for it, held from declaration until the fetch finishes */
  const settle = new Map();

  function manifest(){
    const el = document.getElementById('deferredAssets');
    if (!el) return {};
    try { return JSON.parse(el.textContent) || {}; }
    catch (e){ return {}; }
  }

  /* One tag, one promise. Resolves on load and, deliberately, also on error:
     a game that cannot be fetched must not leave a caller awaiting forever with
     nothing on the screen. The caller checks for what it wanted rather than
     trusting that the fetch worked. */
  function fetchOne(url){
    return new Promise(resolve => {
      let el;
      if (url.endsWith('.css')){
        el = document.createElement('link');
        el.rel = 'stylesheet';
        el.href = url;
      } else {
        el = document.createElement('script');
        el.src = url;
        /* Defaults to async, so two scripts in one group could land out of
           order. Off, so a group arrives in the order it was listed the way a
           concatenated bundle would. */
        el.async = false;
      }
      el.onload = () => resolve(true);
      el.onerror = () => resolve(false);
      document.head.appendChild(el);
    });
  }

  /* WHAT there is to fetch is known at once. WHEN it is fetched is what waits.

     Those have to be separated, and the first version did not separate them:
     both the names and the promises were created inside start(), which runs on
     `load`. Scripts here are `defer`, so the app is running and the map is
     interactive from DOMContentLoaded — and `load` waits for three woff2 files
     besides. On a cold cache and a slow connection that is a window of seconds
     during which `waiting` was empty, so ready('bubble') took the unknown-group
     path and resolved instantly, and the caller went looking for a game that had
     not been asked for yet. It would then deny and send the player back to the
     map. The guard was there; the timing walked around it.

     So the groups are declared now and settled later. An unknown name still
     resolves at once, which is what the standalone build needs: every group is
     unknown there because every byte is already in the page. */
  function declare(){
    for (const name of Object.keys(manifest())){
      waiting.set(name, new Promise(res => settle.set(name, res)));
    }
  }

  function start(){
    const groups = manifest();
    for (const name of Object.keys(groups)){
      const urls = groups[name] || [];
      Promise.all(urls.map(fetchOne)).then(() => {
        const done = settle.get(name);
        if (done) done(true);
      });
    }
  }

  /* Waits for one group. An unknown name resolves rather than hanging, because
     in the standalone build every group is unknown and already present. */
  function ready(name){
    return waiting.get(name) || Promise.resolve(true);
  }

  declare();
  /* After load, not during it. Registering on `load` rather than firing straight
     away keeps the fetching off the critical path: the map is on the screen and
     interactive before a byte of any of this is asked for. */
  if (document.readyState === 'complete') start();
  else addEventListener('load', start);

  return { ready, started: () => waiting.size };
})();
globalThis.Deferred = Deferred;
