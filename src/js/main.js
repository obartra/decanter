/* The app's entry point, and the only file the build is pointed at.

   Everything else is reached from here by `import`, which is what decides both
   what ships and what order it runs in. That used to be the filename: the build
   concatenated `src/js/*.js` sorted, so `20-` came before `90-` because of its
   name and for no other reason. The numbers are kept because they still say
   roughly what depends on what at a glance, but nothing reads them now.

   Three things are deliberately absent, and all three for the same reason: they
   are fetched over the network after the page opens. The sound, the other game
   and the card shown before a replay are named in the deferred manifest the
   build writes into the page, and 96-deferred.js pulls them in. Importing any of
   them here would put it in the critical bundle and undo that, which is why none
   of them appears below.

   90-app.js is imported for its side effects as much as for the name: it
   registers the DOMContentLoaded listener that boots the page, as every game's
   does. This file must not register a second one — two listeners is two boots,
   and the only symptom is a number counted twice. */
import { CONFIG } from './pure/00-config.js';
import { Trace } from './pure/05-trace.js';
import { RNG } from './pure/10-rng.js';
import { Rules } from './pure/20-rules.js';
import { Levels } from './pure/30-levels.js';
import { ORDER } from './pure/32-order.js';
import { PARS, LAST_LEVEL } from './pure/35-pars.js';
import { Chapters } from './pure/36-chapters.js';
import { Progress } from './pure/40-progress.js';
import { Panel } from './pure/45-panel.js';
import './49-audio.js';
import { SolverClient } from './60-solver-client.js';
import { Backdrop } from './65-backdrop.js';
import { Board } from './70-board.js';
import { Fluid } from './72-fluid.js';
import { Confetti } from './75-confetti.js';
import { Still } from './78-still.js';
import { MapGeom, MapView } from './80-map.js';
import { Diagnostics } from './85-diagnostics.js';
import { Jabari } from './86-jabari.js';
import { App } from './90-app.js';
import './95-pwa.js';
import { Deferred } from './96-deferred.js';

/* ---- the debug surface ----

   The one place this bundle puts anything on `globalThis`, and it is deliberate
   rather than structural. Modules talk to each other by importing; nothing here
   is how the game works.

   Every module on the page, rather than a chosen few, because three readers need
   names this file cannot predict. The browser suite drives a real page and has
   to reach the state behind it — there is no other way to assert that a run
   ended for the right reason. The diagnostics card answers "it did nothing when
   I tapped it" on somebody else's phone, offline, from a console. And the
   workbench at /lab/ opens this page in a frame and reads whichever modules
   `src/lab/js/pure/00-config.js` names, which is the one file allowed to know
   this game's internals and should stay the only one that has to be edited when
   it wants another. Picking the surface by hand made that a two-file change, and
   the half nobody did was silent: `Progress` and `Panel` were simply undefined
   through the frame, and the lab's panel sweep measured nothing.

   The late-bound names are not here and do not need to be: `Sound`, `Preview`
   and `BubbleApp` are globals already, taken by the bundles that arrive after
   the page opens. 49-audio.js explains why that is the only thing a network
   boundary can do. */
Object.assign(globalThis, {
  CONFIG, Trace, RNG, Rules, Levels, ORDER, PARS, LAST_LEVEL, Chapters, Progress,
  Panel, SolverClient, Backdrop, Board, Fluid, Confetti, Still, MapGeom, MapView,
  Diagnostics, Jabari, App, Deferred
});
