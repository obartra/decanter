/* A stand-in for the sound, until the sound arrives.

   50-audio.js is not in the critical bundle. It is fetched right after the page
   opens rather than as part of opening it, so the first paint is not waiting on
   a synthesiser that is not allowed to make a noise yet anyway. Until it lands,
   every cue still has to go somewhere, and that somewhere must not be a
   TypeError in the middle of a pour.

   Nothing is queued for later. A cue belongs to the moment it fired, and a glug
   replayed half a second after the liquid landed is worse than a glug nobody
   heard. There is also nothing audible to lose: a page that has not been touched
   is not permitted to start an AudioContext, and this window closes long before
   anyone has touched anything.

   What does have to survive is the sound *setting*. The app reads the save and
   calls setEnabled() during boot, which lands here rather than on the real
   module, so a player who plays muted would be un-muted a moment later by their
   own preference arriving too late. 50-audio.js reads that back off this object
   as it takes over.

   Every name the real module publishes has to appear here. The first call to one
   that does not is exactly the bug this file exists to prevent, so a test in
   tests/build.test.mjs compares the two lists rather than trusting this comment. */
/* Published straight onto globalThis rather than through a top-level `const`.
   The standalone build concatenates this and the real module into one script,
   and two lexical declarations of the same name in one script is a syntax
   error — so this one takes the property and lets 50-audio.js own the name. */
globalThis.Sound = (() => {
  let on = true;
  const quiet = () => {};
  return {
    get enabled(){ return on; },
    /* Never, by definition: there is no context yet, so nothing scheduled now
       would be heard. Callers use this to decide whether to bother. */
    get ready(){ return false; },
    unlock: quiet,
    setEnabled(v){ on = !!v; return on; },
    lift: quiet,
    drop: quiet,
    deny: quiet,
    tick: quiet,
    pourStart: quiet,
    pourAt: quiet,
    pourEnd: quiet,
    glug: quiet,
    cork: quiet,
    win: quiet,
    /* Glass going over, for a bottle taken off the board. */
    smash: quiet,
    /* The one cue that must NOT be answered with a shrug.

       Every other name here does nothing and that is correct: a cue belongs to
       the moment it fired. This one is a promise the caller waits on and then
       fires after, precisely so the three explosions land on the recording
       rather than racing the fetch — so resolving it immediately does not drop a
       sound, it drops the recording and lets the synthesised fallback play in
       its place. That still bangs, so nothing else in the suite notices, which
       is the exact failure the wait exists to prevent.

       So wait for the real module and hand the question to it. `Deferred` is
       named lazily because it is defined further down the bundle than this; by
       the time anyone types the secret word it has been there for minutes. */
    loadBoom(){
      return Deferred.ready('audio').then(() => {
        const real = globalThis.Sound;
        return real && real.loadBoom !== this.loadBoom ? real.loadBoom() : undefined;
      });
    },
    boom: quiet
  };
})();
