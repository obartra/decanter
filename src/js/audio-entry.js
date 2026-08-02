/* The deferred sound bundle, as its own entry.

   Nothing imports 50-audio.js, and that is the point: an import would put it in
   the critical bundle, which is exactly what the deferral exists to prevent. It
   is fetched after the page opens and hands itself over the only way a separately
   loaded script can — by replacing the stub's `globalThis.Sound`.

   So this file is one line, and the line is a side effect. */
import './50-audio.js';
