/* The deferred sandbox bundle, as its own entry.

   Nothing imports 87-sandbox.js, and that is the point: an import would put it
   in the critical bundle, which is exactly what deferring it exists to prevent.
   It is fetched when the button is pressed, in Jabari mode and nowhere else, and
   hands itself over the only way a separately loaded script can.

   So this file is one line and a handover, the same shape as audio-entry.js. */
import { Sandbox } from './87-sandbox.js';

globalThis.Sandbox = Sandbox;
