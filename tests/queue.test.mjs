import { describe, it, assert, equal, read } from './helpers.mjs';

/* The pour queue lives in browser code: it needs a DOM, requestAnimationFrame,
   and a visibility state, none of which exist here, and the project has no test
   dependencies to fake them with. So these are structural checks on the source.
   They do not prove the animation behaves, only that the two guards which keep a
   stalled pour from stranding the level are still in place.

   What they are guarding against: Undo and Restart are both disabled while a
   pour is in flight, so if a drain dies or hangs halfway, the level freezes with
   no way out but a reload. requestAnimationFrame stops firing in a hidden tab,
   which is one tap followed by a screen lock away. */

const board = read('src/js/70-board.js');
const app = read('src/js/90-app.js');
const fluid = read('src/js/72-fluid.js');

const drain = app.slice(app.indexOf('async function drain('),
                        app.indexOf('/* ---------- finishing'));

describe('pour queue', () => {
  it('drives every frame loop through the backstopped helper', () => {
    /* a bare recursive rAF is exactly the shape that hangs when hidden */
    const calls = [...board.matchAll(/requestAnimationFrame\(/g)].length;
    equal(calls, 1, 'requestAnimationFrame should appear only inside frames()');
    const frames = board.slice(board.indexOf('function frames('),
                               board.indexOf('/* --- layout'));
    assert(/requestAnimationFrame\(/.test(frames), 'the single rAF call should be the one in frames()');
  });

  it('backstops the frame loop with a timer, which still fires when hidden', () => {
    const frames = board.slice(board.indexOf('function frames('),
                               board.indexOf('/* --- layout'));
    assert(/setTimeout\(/.test(frames), 'frames() has no timer backstop, a hidden tab will hang it');
    assert(/clearTimeout\(/.test(frames), 'frames() never clears its backstop');
  });

  it('always lets go of the running flag', () => {
    assert(/finally\s*\{/.test(drain), 'drain() must release running in a finally');
    const tail = drain.slice(drain.indexOf('finally'));
    assert(/S\.running\s*=\s*false/.test(tail), 'running is not cleared inside the finally');
  });

  it('does not let one failed animation strand the rest of the queue', () => {
    const around = drain.slice(drain.indexOf('Board.animate'));
    assert(/catch/.test(drain.slice(0, drain.indexOf('Board.animate')) + around.slice(0, 120)),
      'the await on Board.animate should be wrapped so a throw cannot break the loop');
    assert(/Rules\.applyMove\(Board\.view/.test(drain),
      'the view must still be caught up to the logic after a dropped animation');
  });

  it('has no notion of liquid that belongs to no bottle', () => {
    /* This is the invariant the whole rewrite bought. Liquid is drawn through
       the glass it is in, so "outside a glass" has no representation: it is not
       a case that is handled, it is a case that cannot be written down. Every
       pour bug in this file's history was liquid in flight, which needed its own
       aim, its own clip and its own culling, and went wrong in all three. */
    assert(!/home\s*===?\s*-1/.test(fluid), 'a homeless-particle branch is back');
    assert(!/\bparts\b/.test(fluid), 'a particle array is back');
    assert(/ctx\.clip\(\)/.test(fluid), 'the glass clip is gone');
  });

  it('draws nothing outside a clip', () => {
    /* every fill in the renderer has to sit between a clip and its restore */
    const body = fluid.slice(fluid.indexOf('function drawBottle'), fluid.indexOf('function draw()'));
    const clipAt = body.indexOf('ctx.clip()');
    assert(clipAt > 0, 'drawBottle does not clip');
    const firstFill = body.search(/ctx\.fill(Rect|\()/);
    assert(firstFill > clipAt, 'a fill happens before the clip is applied');
  });
});
