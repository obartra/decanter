/* The service worker.

   Read and stamped by tools/build.mjs, which replaces the three constants below
   with the real version and the real file list. It lives here as a source file
   rather than as a template literal inside the build for one reason: a string is
   not linted, not checked for dead code, and not read by anyone the way a file
   is. eslint has had a block pointing at `src/sw.js` for as long as this project
   has had a worker, and until now that block matched nothing at all.

   The values here are what a build would produce if it precached nothing. They
   are deliberately valid rather than placeholders, so this file parses, lints and
   reads as the thing it is. */
const VERSION = 'decanter-dev';
const ASSETS = ['./'];
const SHELLS = [];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  /* There is one worker on this origin now. Hashed filenames mean two builds
     cannot collide over an asset, so the games no longer need a cache each to
     keep out of each other's way — which is what left the second game with no
     worker at all, and no offline, for as long as it had its own scope. */
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate'){
    /* Shells are small and they name the bundles, so they are the one thing
       that has to be fresh: a stale shell points at a build that is no longer
       there. no-cache still sends the ETag, so an unchanged shell costs a 304.

       Offline, the fallback is the shell for the path being asked for. Falling
       back to the app for every navigation would serve the pour game at another
       game's URL, which reads as the wrong game loading rather than as being
       offline. */
    /* Matched on the directory, so a page under a project subdirectory works too:
       /decanter/bubble/ is the bubble game as surely as /bubble/ is. */
    const hit = SHELLS.find(([dir]) => url.pathname.includes('/' + dir + '/'));
    const wanted = hit ? hit[1] : './index.html';
    e.respondWith(
      fetch(req.url, { cache: 'no-cache' })
        .catch(() => caches.match(wanted, { ignoreSearch: true }))
    );
    return;
  }

  /* Everything under assets/ is named by its own hash, so a hit is not merely
     probably right, it is the exact bytes that name was minted for. Never
     revalidated, never expired. */
  if (url.pathname.includes('/assets/')){
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok && url.origin === location.origin){
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    })));
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok && url.origin === location.origin){
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
