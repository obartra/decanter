/* The deferred card, as its own entry.

   Nothing in the critical bundle imports 46-preview.js, and that is the point:
   an import would put the card back on the first paint, which is what deferring
   it exists to prevent. It arrives after the page opens and hands itself over
   the only way a separately loaded script can, by taking a name on the page —
   the same arrangement the sound uses, and `90-app.js` waits on the group and
   checks for the name before drawing.

   The module itself stays clean. It is a pure module, tested by importing it,
   and publishing a global is a fact about how this bundle is delivered rather
   than anything the card needs to know. So the entry point does it. */
import { Preview } from './pure/46-preview.js';

globalThis.Preview = Preview;
