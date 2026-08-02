/* The entry point for this page, and its debug surface.

   Modules reach each other by importing. The block below is the one place
   anything is put on `globalThis`, and it holds **every** module on the page
   rather than a chosen few.

   All of them, because two readers need names this file cannot predict. The
   browser suite drives a real page and asserts against the state behind it, and
   the workbench at /lab/ reaches into this page through `contentWindow` and
   reads whichever modules `src/lab/js/pure/00-config.js` names — which is the
   one file allowed to know another game's internals, and the only one that
   should have to be edited when it wants a different one. A surface picked by
   hand makes that a two-file change, and the half nobody does is silent: the
   name is simply undefined and the panel measures nothing. */
import { LabConfig } from './pure/00-config.js';
import { LabStates } from './pure/10-states.js';
import { LabSweep } from './pure/20-sweep.js';
import './90-app.js';

Object.assign(globalThis, {
  LabConfig, LabStates, LabSweep
});
