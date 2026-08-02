/* The one thing in the build that is not trying to be tasteful.

   A word in the query string fills the purse, and it goes off rather than
   sliding in: a strobe, three shockwaves, three bangs, and JABARI MODE shaking
   across the screen in rainbow over a neon number. 04-economy.md says none of
   it should be borrowed for anything else the game does, and this file is that
   sentence made structural. It was a hundred lines in the middle of 90-app.js,
   between the wiring and the fault handler, where "do not borrow this" was a
   remark rather than a boundary.

   It knows about the purse and about one callback, and nothing else knows about
   it. That is the whole seam: `takeGift` is handed the progress it should fill
   and the thing to call once gold has moved, so this file has no idea what a
   level is, what the map is, or that either exists.

   It comes out with the beta, and taking it out is deleting one file and one
   call. See docs/design/04-economy.md. */
const Jabari = (() => {
  const $ = id => document.getElementById(id);

  /* Gold handed over rather than earned, for a beta player who has run dry in
     the middle of telling us about something else.

     The word stays in the address bar, and the whole thing goes off again every
     time the link is opened. That is only safe because the purse is brought up
     to a figure rather than paid a sum: landing on it twice lands on the same
     number. An earlier pass added instead, which meant the word had to be
     deleted from the URL to stop a reload paying again — and that made it a
     link that worked once, quietly, which is not what a link is for. */
  function takeGift(progress, onGold){
    let url;
    try { url = new URL(location.href); } catch (e) { return; }
    if (!url.searchParams.has(CONFIG.beta.word)) return;
    const gold = progress.fill();
    Trace.note('purse filled', `${gold} from the query string`);
    onGold();
    jabariMode();
  }

  /* The bang: now if the page is allowed to make one, and on the first touch if
     it is not.

     A page nobody has touched yet is not allowed to make a sound — the audio
     context stays suspended until a gesture, and opening a pasted link is not a
     gesture, which is precisely how this arrives. An earlier pass made the whole
     celebration wait for that touch, which bought the sound at the price of the
     thing the word is actually for: the message has to be on the screen the
     moment the link opens, every time, no conditions. So the picture never waits
     and only the noise does.

     The wait ends with the picture. A bang belongs to something on the screen,
     and one that arrives after the screen has gone back to the map is not a
     celebration, it is a noise from nowhere. Returns the way to call it off, and
     the same timer that clears the message calls it.

     Three bangs rather than one, because one is a sound effect and three is a
     point being made.

     The recording is asked for here and waited on before anything fires, which
     is the only way the three land on the sound they were written for: asking
     and firing in the same breath would race the fetch, and the race would be
     won by the fetch on a warm cache and lost on a cold one, so the same word
     would open on a different explosion depending on whether it had been opened
     before. The wait is over long before the touch that ends the other one. */
  function bang(){
    Sound.unlock();
    const loaded = Sound.loadBoom();
    let over = false;
    /* `over` is read after the wait as well as before it, so a message that
       takes itself away mid-fetch takes the bang with it. */
    const fire = () => loaded.then(() => {
      if (over) return;
      Sound.boom(); Sound.boom(0.19); Sound.boom(0.44);
    });
    const deafen = () => {
      document.removeEventListener('pointerdown', go, true);
      document.removeEventListener('keydown', go, true);
    };
    /* Calling off the bang and being done listening for it are two different
       things now that firing takes a moment: the touch that fires it stops the
       listening, and only the message going away calls it off. */
    const standDown = () => { over = true; deafen(); };
    const go = () => {
      if (over) return;
      deafen();
      Sound.unlock();
      fire();
    };
    if (Sound.ready){ fire(); return standDown; }
    document.addEventListener('pointerdown', go, true);
    document.addEventListener('keydown', go, true);
    return standDown;
  }

  /* It goes off, it says what it is, and it takes itself away. Cleared on a
     timer rather than on the animation ending, because reduced motion collapses
     the animation to nothing and there would be no end to wait for. */
  /* Not the game's palette. That one was chosen so no two liquids are close to
     the eye on a dark shelf; this is chosen to be as loud as a screen goes. */
  const JABARI_COLOURS = ['#FF3DDA','#FF2D2D','#FF8A1E','#FFE04A','#5BFF5F','#3DF2FF','#7A5BFF','#FFFFFF'];

  function jabariMode(){
    const el = $('jabari');
    $('jabariGold').textContent = `+${CONFIG.economy.purseCap.toLocaleString('en-US')}`;
    el.hidden = false;
    /* forced out of the frame that unhid it, or the animation never starts */
    void el.offsetWidth;
    el.classList.add('go');

    const quiet = bang();

    /* Thrown against the short side of the screen, not the long one. Scaled off
       the height, a phone flings most of the paper out of frame before anyone
       sees it: the first pass measured particles six hundred pixels left of a
       screen three hundred and ninety wide. */
    const reach = Math.min(innerWidth, innerHeight) * 0.5;
    const throwPaper = () => Confetti.blast(innerWidth / 2, innerHeight / 2, 110, JABARI_COLOURS, reach);
    throwPaper();
    setTimeout(throwPaper, 190);
    setTimeout(throwPaper, 440);
    setTimeout(throwPaper, 900);

    /* and the number it was all about, once the word is out of the way */
    const purse = document.querySelector('#mapView .purse');
    if (purse){
      setTimeout(() => {
        purse.classList.add('granted');
        setTimeout(() => purse.classList.remove('granted'), 1400);
      }, 2100);
    }
    setTimeout(() => {
      el.classList.remove('go');
      el.hidden = true;
      /* and the bang goes with it: a tap from here is a tap on the map */
      quiet();
    }, 3100);
  }

  return { takeGift };
})();
globalThis.Jabari = Jabari;
