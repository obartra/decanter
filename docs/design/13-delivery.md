# 13 · Delivery

Building, shipping, working offline, and picking up a new version.

## One bundler, and nothing else

`tools/build.mjs` is the entire build. Every source file is an ES module and
every page has an entry point — `src/js/main.js`, `src/bubble/js/main.js`, one
per game — which esbuild follows to produce one script per page.

The modules that run without a DOM live in a pure folder beside the ones that
do, as in `src/js/pure/`. That is not filing: the folder is exactly what the unit
suite loads, so it replaced seven written-down lists of which modules run
headless, one of which named them in an order the game never loads them in and
passed by luck. A test checks that nothing in it reaches for a document, a window
or a frame.

It did not use to. Files in a game's `js` and `css` directories were
**concatenated in filename order**, which is why the modules are numbered, and
that ordering was the dependency graph: there was no other. It worked, and the
things it cost were not small.

- A module's top level was the **page's** top level, so every file's names were
  in the scope every other file was parsed in. Two files declaring `decide` was a
  silent overwrite that retitled the end-of-run panel; two declaring a `const`
  was a parse error, which on a page that is one script is a blank screen. Every
  module was wrapped in an IIFE to work around this, and two separate checks
  existed to catch the next one that was not.
- The dependency order was **a filename convention**, enforced by nothing. A
  module could use another that had not been defined yet and the only symptom was
  a crash at run time, on whichever page happened to load them in that order.
- Nothing could be **tree shaken**, so anything reachable shipped.
- Tests loaded modules by reading source text and evaluating it in a `vm`
  context, which is not how the browser loads them, and one test read a helper
  out of a file by slicing it at a string literal.

Imports say all of that outright, so the numbers are now only a reading order.
Under 50 is still pure logic that runs anywhere; above is browser code.

The IIFE wrappers stayed, and they are not vestigial. What they were doing —
keeping a module's top level out of the page's — the module system does now, but
they still do the other half: everything above the `return` is private, and only
what the object names can be reached. A module of loose `export`s would put every
helper in its public surface, and `dead-code.mjs` would have nothing to measure.

Two names are still late-bound through `globalThis`, deliberately: `Sound` and
`BubbleApp`. Both arrive over the network after the page has opened, which is
not a thing an import can express — importing either would put it in the
critical bundle and undo the deferral described below.

The output is an **IIFE, not a module**, and that is deliberate: the portable
build is a single HTML file opened from `file://`, where a browser refuses to
load modules at all. One bundle per page, no code splitting except the deferral
described below, which the build arranges by giving the deferred half its own
entry point.

esbuild is the project's **only** dependency outside the toolchain — the game
itself still ships nothing, and the test suite is still `node tests/run.mjs`.
Writing a module system by hand to avoid it was the alternative, and a hand-rolled
one that nobody else has tested is not the cheaper option.

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
| `assets/app-<hash>.css` `assets/app-<hash>.js` | ~176kb | the pour game. Cached forever |
| `assets/audio-<hash>.js` | ~8kb | the sound, fetched after the page opens |
| `assets/preview-<hash>.{css,js}` | ~14kb | the card before a replay, fetched after the page opens |
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

A group is a name with a list of URLs under it, and a caller waits on the name.
For a while a group could only be a whole game or the sound, because that was all
the build could describe: `DEFERRED` was a list of scripts, so everything on it
went under one name, and a stylesheet could not be on it at all.

It is a map of named groups now, each with `js`, `css` or both, so **part of the
app's own script and stylesheet can be deferred as well**. The card shown before
a replay is the first to use it. Nothing on that card is reachable until somebody
taps a medallion for a level they have already cleared, so on the critical path
every byte of it was downloaded by every player and read by the ones who go back;
`src/js/pure/46-preview.js` and `src/css/06-preview.css` now arrive under the name
`preview`, and `showPreview` waits on it before drawing.

A group's script side is an **entry point**, not a list of filenames, because a
bundle holds what its entry imports and nothing else could be true. That has one
cost worth stating: a group carries its own copy of anything it shares with the
critical bundle, so the card duplicates the config and the panel, about 4kb.
Sharing a module between two bundles is code splitting, and esbuild only splits
ESM, which the portable file rules out. Both of the duplicated modules are
stateless, so today this costs bytes; a stateful one would be two copies with two
sets of state, so the overlap is written down and asserted in
`tests/build.test.mjs` rather than tolerated.

`src/js/78-still.js` and `src/css/05-still.css` deliberately stayed behind. They
draw the small bottles on the shelf the blast offers as well as the card's
picture, and that shelf opens in the middle of a run. They were made shared in
the first place because two hand-rolled copies of a small bottle disagreed about
what a half empty one looks like, so splitting them again to move about 3kb would
be buying back a defect this project has already had.

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
portable file naming `./audio/` would fall silently back to the synthesized bang
the moment it left the folder it was built in.

Everything uses relative paths, so `dist/` works from any subdirectory.

`dist/` is **generated, not committed**. The deploy builds from source, so a
committed copy was never what shipped. `npm run build` puts it back, and
`npm run verify:budget` builds it to check what matters has not quietly grown.

### Four budgets, not one

`tools/verify-budget.mjs` used to cap one number, because the page was the
download. Now it caps four, because they go wrong for different reasons:

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

That claim was true of every stylesheet except the app's own, which was left out
of the hash for long enough to be worth recording. Editing `src/css/` minted a
newly named bundle under an unchanged version, which is exactly the growth above,
and stamped the page with the build id of the last *script* change, which is the
one thing the stamp exists not to do. A test now builds a copy of the tree with
one file of each kind altered and asserts the id moved, because the expression
that computes it read correctly while being wrong.

## Picking up a new version

This took two goes and is worth writing down.

**Navigations revalidate.** The worker fetches the shell with `cache: 'no-cache'`.
A plain `fetch()` honors the HTTP cache, and the host sets a max-age on HTML. A
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
