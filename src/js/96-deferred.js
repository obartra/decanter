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
  const waiting = new Map();

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

  function start(){
    const groups = manifest();
    for (const name of Object.keys(groups)){
      const urls = groups[name] || [];
      waiting.set(name, Promise.all(urls.map(fetchOne)).then(() => true));
    }
  }

  /* Waits for one group. An unknown name resolves rather than hanging, because
     in the standalone build every group is unknown and already present. */
  function ready(name){
    return waiting.get(name) || Promise.resolve(true);
  }

  /* After load, not during it. Registering on `load` rather than firing straight
     away keeps these off the critical path: the map is on the screen and
     interactive before a byte of any of this is asked for. */
  if (document.readyState === 'complete') start();
  else addEventListener('load', start);

  return { ready, started: () => waiting.size };
})();
globalThis.Deferred = Deferred;
