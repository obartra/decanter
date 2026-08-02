import { describe, it, assert, read } from './helpers.mjs';

/* Reading the board after the run is over needs a DOM and a real press, so what
   it does is checked in the browser suite. This pins the one property that whole
   check rests on, which is not visible from a passing run.

   The way back is put on the document while the press that opened the peek is
   still being delivered. Nothing keeps that press from being handed straight
   back to it except the event it listens for: a click has already gone past the
   document by the time a button's own handler runs, so a listener added there
   cannot receive it. A pointerdown has not — the click is still to come — and
   moving the way back to one would open the peek and shut it again in the same
   gesture, which is the bug this shape was arrived at to fix.

   It was guarded by a tick instead for a while, which cost more than it bought:
   the tap was live a tick after the board went grey, and a browser spec tapping
   into that tick failed about one run in three under load. */
const app = read('src/js/90-app.js');

/* Cut to the handler, and drop its comments: this file reads for the absence of
   two shapes, and the handler explains both of them in prose. Both ends of the
   cut are found rather than assumed, because a slice that quietly ran on to the
   end of the file would let the assertions below match something else and pass
   with the handler gone. */
const opens = app.indexOf("$('peek').onclick");
const ends = app.indexOf("$('veil').addEventListener('click'");
const peek = opens > -1 && ends > opens
  ? app.slice(opens, ends).replace(/\/\*[\s\S]*?\*\//g, '')
  : '';

describe('reading the board after the run', () => {
  it('is still where this reads it from', () => {
    assert(peek, 'the peek handler is no longer between its own name and the veil backdrop handler');
  });

  it('takes the way back on the click, not on the press under it', () => {
    assert(/addEventListener\('click', back, true\)/.test(peek),
      'the way back should be captured on the document');
    assert(!/pointerdown/.test(peek),
      'a pointerdown here is handed the press that opened the peek, so the gesture opens it and shuts it again');
  });

  it('arms it in the handler rather than a tick later', () => {
    assert(!/setTimeout\(/.test(peek),
      'a tick here leaves the board grey and the prompt asking for a tap that lands on nothing');
  });
});
