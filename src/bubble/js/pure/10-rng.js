/* The game's randomness, in one place.

   There were three copies of this xorshift: the one the game actually runs, one
   in the difficulty harness, and one in the unit tests. All three were meant to
   be the same stream, and nothing made them so. A harness that draws its numbers
   differently from the game measures a game nobody plays, which is the same
   trap `dealBoard` was pulled out of the app to avoid.

   Seeded and restorable, because undo has to put the sequence back where it was.
   Restoring the board without the stream deals a different bubble on the retry,
   which is not the position the player asked to return to. */
export const BubbleRng = (() => {
  function stream(seed){
    let s = 1;
    const api = {
      seed(n){ s = n >>> 0 || 1; return api; },
      /* where the sequence has got to, so a turn can be taken back */
      get state(){ return s; },
      set state(v){ s = v >>> 0 || 1; },
      next(){
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
      }
    };
    if (seed !== undefined) api.seed(seed);
    return api;
  }

  /* the same stream as a bare function, for the callers that only want numbers */
  const from = seed => {
    const s = stream(seed);
    return () => s.next();
  };

  return { stream, from };
})();
