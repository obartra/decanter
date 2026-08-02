/* What the game was doing when it stopped doing anything.

   This exists because of a bug report that could not be answered: a player said
   a level did nothing when he tapped it, and there was no way to find out what
   the game thought had happened. The game runs offline and nothing is sent
   anywhere, so the only place the answer can be is on the device, in a form the
   player can read out.

   Two kinds of thing are worth keeping.

   A **refusal** is an action the game declined: a fee it could not take, a pour
   the rules would not allow, a purchase with nothing behind it. Every one of
   these is a tap that does nothing, and a tap that does nothing is exactly what
   gets reported. They are the whole reason this file is here, and they are
   recorded with the reason rather than just the fact, because "level 15 did
   nothing" and "level 15 cost 5 and the purse held 4" are different bug reports.

   A **fault** is an exception. One thrown inside a click handler is invisible:
   the handler stops, the screen stays as it was, and the player sees a dead
   button. Catching them here is the difference between a mystery and a line of
   text.

   The log is a ring of the last few dozen entries rather than everything. What
   matters is the run-up to the thing that went wrong, and a buffer that grows
   without bound on a device that is never reloaded is its own bug. */
export const Trace = (() => {
  /* enough to cover the run-up to a report without being a leak */
  const CAP = 64;
  const ring = [];
  let seq = 0;
  let origin = null;

  /* Times are relative to the first entry, not wall clock. A player reading
     these out loud does not need the date, and a run of them is easier to read
     as seconds since the game opened than as six identical timestamps. */
  function stamp(){
    const now = Date.now();
    if (origin == null) origin = now;
    return ((now - origin) / 1000).toFixed(1);
  }
  function push(kind, what, detail){
    ring.push({ n: ++seq, at: stamp(), kind, what, detail: detail == null ? '' : String(detail) });
    if (ring.length > CAP) ring.shift();
    return ring[ring.length - 1];
  }

  /* counters that outlive the ring, so a report still says how often rather than
     only what happened most recently */
  const tally = { note: 0, refused: 0, fault: 0 };
  const refusals = {};

  return {
    /* something happened and went as it should */
    note(what, detail){ tally.note++; return push('·', what, detail); },
    /* the game declined to do what it was asked, and why */
    refused(what, why){
      tally.refused++;
      refusals[what] = (refusals[what] || 0) + 1;
      return push('refused', what, why);
    },
    /* something threw. `where` says which part was running at the time, because
       the stack alone does not survive being read down a phone line. */
    fault(where, err){
      tally.fault++;
      const msg = err && err.message ? err.message : String(err);
      return push('FAULT', where, msg);
    },
    get counts(){ return { ...tally, refusals: { ...refusals } }; },
    /* the log as plain text, oldest first, for a panel or a paste */
    lines(){
      return ring.map(e => `${e.at}s ${e.kind === '·' ? '' : e.kind + ' '}${e.what}${e.detail ? ' — ' + e.detail : ''}`);
    },
    /* Everything, counts included. It used to empty the ring and leave the
       tallies standing, which nothing noticed while the suite loaded a fresh
       copy of this module for every test: the counters were new anyway. A module
       is a singleton under real imports, so a half-clear leaves one test's
       refusals in the next one's totals — and that is the same trap for anyone
       clearing a trace from a console to start a clean one. */
    clear(){
      ring.length = 0;
      seq = 0;
      origin = null;
      tally.note = tally.refused = tally.fault = 0;
      for (const k of Object.keys(refusals)) delete refusals[k];
    }
  };
})();
