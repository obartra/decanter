# 13 · Delivery

Building, shipping, working offline, and picking up a new version.

## No bundler

`tools/build.mjs` is the entire build. Files in a game's `js` and `css`
directories are concatenated in **filename order**, which is why modules are
numbered: the number is the dependency order, and there is no import graph to
resolve.

Ordering is by filename and never by path, because the modules that run without
a DOM live in a pure folder beside the ones that do, as in `src/js/pure/`.
Sorting by path would put that whole folder after everything else, which is a
different program.

The folder is not filing: it is exactly what the unit suite loads, so it replaced
seven written-down lists of which modules run headless, one of which named them
in an order the game never loads them in and passed by luck. A test checks that
nothing in it reaches for a document, a window or a frame.

The project has **no dependencies at all**, so there is nothing to install before
building or testing. That is a constraint worth defending: it is what makes the
build a single readable file and the test suite `node tests/run.mjs`.

## Hashed bundles behind a small shell

This used to inline every byte of every game into `index.html`. That made the
page a single download, which was the point — and it also made the page
**code**: 288kb of it, revalidated on every navigation, because a cached page
would have pinned a stale build. Every load paid for the whole game again, and a
size budget had to sit on top of it to stop that quietly getting worse.

Now the code is hashed into its own files under `assets/`. A hashed file can be
cached forever, because a change to it is a change to its **name**. What is left
in the page is a shell of a few kilobytes: markup, the font faces, and the names
of the bundles.

| | | |
| --- | --- | --- |
| `index.html` | ~9kb | the shell. Revalidated every navigation |
| `assets/app-<hash>.css` `assets/app-<hash>.js` | ~230kb | the pour game. Cached forever |
| `assets/audio-<hash>.js` | ~10kb | the sound, fetched after the page opens |
| `assets/solver-<hash>.js` | ~6kb | the A\* worker, fetched on the first solve |
| `./audio/boom.mp3` | 17kb | the one recording, copied from `assets/audio/`, fetched the first time it is needed |
| `assets/<game>-<hash>.{css,js}` | | one game each |
| `<game>/index.html` | ~3kb | a shell per game, at its own path |
| `decanter-standalone.html` | | one portable file, everything inlined |

Two consequences paid for the change on their own:

- **The games stopped fighting over cache space.** Two builds cannot collide
  when their filenames differ, so one worker holds every page on the origin —
  and the second game, which had a scope of its own and therefore no worker at
  all, finally works offline.
- **The sound and the second game left the critical path.** They are fetched
  after the page opens rather than as part of opening it.

### What is critical, and what is merely early

`src/js/96-deferred.js` fetches the rest, listed by the build in a
`<script type="application/json" id="deferredAssets">`. It runs on `load`, so the
map is on the screen and interactive first.

**Eagerly, not on demand**, and that distinction is the whole design. Waiting
until first need would put a network round trip inside a tap, and on a game that
is meant to work offline it would put it there on precisely the load where the
cache is still cold. Fetching immediately after `load` means the worker finishes
filling its cache while the player is still reading the map, and by the time a
bubble level comes up the code for it has been on the device for minutes.

The sound needs one more thing, because the app reads the save and sets the sound
preference during boot — before the real module exists. `src/js/49-audio.js` is a
stand-in that answers every cue silently and remembers that setting;
`50-audio.js` reads it back as it takes over. Without that, a player who plays
muted is un-muted a second later by their own preference arriving too late. A
test compares the two lists of names, because the first call to one the stand-in
missed is exactly the crash this arrangement would otherwise introduce.

### The portable file does not split

`decanter-standalone.html` inlines everything: both stylesheets, every module
including the sound, the solver in a `<script type="text/js-worker">` the browser
will not execute, and the three fonts as data URIs. It is the one build where
splitting would be the wrong answer, because there is nowhere to fetch from. It
opens straight off disk but cannot install, since service workers need HTTPS or
localhost.

### The one recording

There is no art to ship at all, since the room is drawn (see
[08 The room](08-room.md)), and the only recording is the 17KB bang behind the
secret word (see [11 Sound](11-sound.md)). The installable build points a
`<meta name="boom">` at `./audio/boom.mp3`, a cacheable file like any other; the
portable file carries the same bytes as a data URI in the same tag, so nothing in
the audio module has to know which kind of build it is running in.

It has to be inlined there rather than pointed at, for the same reason the fonts
are: a `file://` page fetching a sibling path is a cross origin request, so a
portable file naming `./audio/` would fall silently back to the synthesised bang
the moment it left the folder it was built in.

Everything uses relative paths, so `dist/` works from any subdirectory.

`dist/` is **generated, not committed**. The deploy builds from source, so a
committed copy was never what shipped. `npm run build` puts it back, and
`npm run verify:budget` builds it to check what matters has not quietly grown.

### Three budgets, not one

`tools/verify-budget.mjs` used to cap one number, because the page was the
download. Now it caps three, because they go wrong for different reasons:

- **The shells**, because every load revalidates them forever. Code getting
  inlined back into a page is the regression this layout exists to prevent, and
  it would be invisible: the page would work perfectly and merely cost more every
  time.
- **The critical path** — shell plus the app's own CSS and JS — because that is
  what a first paint waits for on a cold cache.
- **Each game**, and **the whole build**, which is paid once at install.

## Offline

The service worker precaches a list **derived from what actually landed in
`dist`**, rather than a list maintained by hand. A test asserts the two match in
both directions: nothing built but unlisted, nothing listed but missing. A
precache entry that does not exist fails the whole install, silently, so this is
worth pinning. The portable file is the one deliberate exclusion — it is a copy
of the app for carrying around, and precaching it would double the install.

Requests are answered three ways, and which one applies is decided by the URL:

- **Navigations revalidate**, and fall back to the shell **for that path**.
  Falling back to the app for every navigation would serve the pour game at
  another game's URL, which reads as the wrong game loading rather than as being
  offline.
- **Anything under `assets/` is cache-first and never revalidated.** Its name is
  its version, so a hit is not merely probably right — it is the exact bytes that
  name was minted for.
- **Everything else** — fonts, icons, the manifest — is cache-first with a
  network fallback.

There is **one worker** now. It used to be one per game, with each deleting only
caches whose names began with its own prefix, because a filter of "everything
that is not me" meant whichever activated last emptied the other's precache and
the two took turns breaking each other, visible only offline. Hashed filenames
removed the reason for any of that.

The cache name is a hash of **every source that ships anywhere in `dist`**, not
just the app's. With one shared cache, a game changing without the version
changing would mean the worker reopening the same cache, adding the newly named
bundles beside the superseded ones, and never sweeping them: the install would
grow a little every release, forever.

## Picking up a new version

This took two goes and is worth writing down.

**Navigations revalidate.** The worker fetches the shell with `cache: 'no-cache'`.
A plain `fetch()` honours the HTTP cache, and the host sets a max-age on HTML. A
shell names the bundles by hash, so serving a cached one serves the names of a
build that may no longer exist, and no amount of reloading would shift it.

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
tab, so a tab that started uncontrolled (every first visit, every visit after
clearing site data) **never auto-updates again**. Tracking the controller rather
than remembering a flag is the difference between this working and appearing to.

## The build stamp

Every page and the worker share one id, derived from the sources, published as a
`<meta name="build">`. "Which version am I looking at" is a question with an
answer that can be read off the page.

It exists because several rounds of debugging were spent on a bug that had already
been fixed in a build the browser was not running.

## Icons

Every page carries one, including the game pages, which have no manifest. A page
without an icon is not merely undecorated: the browser asks for `/favicon.ico`
regardless and logs a 404 when there is none, on every load of a game that
otherwise produces neither a stray request nor a console error — and a browser
spec asserting a clean console then passes or fails depending on whether that
request happened to land before the assertion did.

The game pages get **no manifest**, deliberately. They are where a mechanic gets
worked on; installing one as its own app would put a second Decanter on a home
screen that is a single game and cannot reach the map.
