# 13 · Delivery

Building, shipping, working offline, and picking up a new version.

## No bundler

`tools/build.mjs` is the entire build. Files in `src/js` and `src/css` are
concatenated in **filename order** and inlined into the page, which is why modules
are numbered: the number is the dependency order, and there is no import graph to
resolve. Under 50 is pure logic that runs anywhere; above is browser code.

The project has **no dependencies at all**, so there is nothing to install before
building or testing. That is a constraint worth defending: it is what makes the
build a single readable file and the test suite `node tests/run.mjs`.

## Two outputs

- **`index.html`**, the installable app, with fonts as separate cacheable files.
- **`decanter-standalone.html`**, one portable file with the fonts inlined as data
  URIs. It opens straight off disk but cannot install, because service workers
  need HTTPS or localhost.

Both are composed from the same source with different substitutions. There is no
art to ship at all, since the room is drawn (see [08 The room](08-room.md)), which
is what keeps the portable file small enough to be portable.

Everything uses relative paths, so `dist/` works from any subdirectory.

## Offline

The service worker precaches a list **derived from what actually landed in
`dist`**, rather than a list maintained by hand. A test asserts the two match in
both directions: nothing built but unlisted, nothing listed but missing. A
precache entry that does not exist fails the whole install, silently, so this is
worth pinning.

The cache name is a hash of the sources, so a new build gets a new cache and the
old one is deleted on activation. Nothing needs bumping to release.

## Picking up a new version

This took two goes and is worth writing down.

**Navigations revalidate.** The worker fetches the page with `cache: 'no-cache'`.
A plain `fetch()` honours the HTTP cache, and the host sets a max-age on HTML;
since the entire app is inlined into `index.html`, a cached page is cached
**code**, and no amount of reloading shifts it.

**Open tabs update themselves.** Revalidating only helps someone who navigates,
and a tab left open never navigates again. The worker is asked for a new build
every five minutes, when the tab returns to the front, on focus, and when the
connection comes back. When one takes over, the page reloads.

**Not mid-pour.** Reloading during a level would throw the level away, so it waits
for the map with nothing animating. Progress is saved per level, so waiting costs
nothing.

**The install-versus-update trap.** A page that starts uncontrolled is claimed
once as its worker installs, and that claim is an install, not an update. The
first version sampled `navigator.serviceWorker.controller` once at load to tell
them apart, which looks right and is not: the flag stays false for the life of the
tab, so a tab that started uncontrolled — every first visit, every visit after
clearing site data — **never auto-updates again**. Tracking the controller rather
than remembering a flag is the difference between this working and appearing to.

## The build stamp

The page and the worker share one id, derived from the sources, published as a
`<meta name="build">`. "Which version am I looking at" is a question with an
answer that can be read off the page.

It exists because several rounds of debugging were spent on a bug that had already
been fixed in a build the browser was not running.
