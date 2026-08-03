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
import { BubbleConfig } from './pure/00-config.js';
import { BubbleRng } from './pure/10-rng.js';
import { BubbleGrid } from './pure/20-grid.js';
import { BubbleShot } from './pure/25-shot.js';
import { BubbleRules } from './pure/30-rules.js';
import { BubbleAdvice } from './pure/40-advice.js';
import { BubbleScore } from './pure/45-score.js';
import { BubbleAudio } from './50-audio.js';
import { BubbleView } from './60-view.js';
import { BubbleRender } from './70-render.js';
import { BubbleApp } from './90-app.js';

Object.assign(globalThis, {
  BubbleConfig, BubbleRng, BubbleGrid, BubbleShot, BubbleRules, BubbleAdvice, BubbleScore, BubbleAudio, BubbleView, BubbleRender, BubbleApp
});
