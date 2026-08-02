/* Sound, synthesised at runtime, so the page still ships as markup and one
   bundle with no audio to fetch.

   Built on the bubble game's two primitives, `tone` and `burst`, and they are
   copied rather than shared for the reason every game here copies rather than
   shares: three games with no module in common cannot have one game's sound
   design pinned by another's. What is not copied is any of its voices. That game
   is knocks and pops; this one is liquid in glass, which is a rising pitch and a
   ring, and none of its cues would be right here.

   The one sound that matters is the pour, because it is the only thing the
   player ever does, and it has to say two things at once: how much moved, and
   how full the vessel it went into now is. Both come out of the same physics —
   a filling vessel rings higher as the air column above the liquid gets shorter
   — so the glug slides UP to a pitch set by the target's fill, and a vessel
   filled to the brim finishes on a note the player can learn without ever being
   told what it means. */
const MeasureAudio = (() => {
  const KEY = 'measure.sound';
  let ctx, master, noise;
  /* Muted is remembered, because somebody who turned the sound off did not mean
     "until the next board". Storage throws in a locked-down browser, and a game
     that will not open because it could not read a preference is worse than one
     that forgets it. */
  let on = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch(e){ return true; } })();

  function init(){
    if (ctx) return;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.8);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone({ f = 440, f2, type = 'sine', dur = 0.15, gain = 0.2, delay = 0 }){
    if (!on || !ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur * 0.85);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function burst({ freq = 1200, q = 1, dur = 0.09, gain = 0.2, delay = 0, type = 'bandpass' }){
    if (!on || !ctx) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  return {
    get enabled(){ return on; },
    /* Called from the first gesture of any kind, and cheap after the first. The
       context starts suspended and stays there until a gesture, so anything
       scheduled before the first tap is played to nobody. */
    unlock(){ try { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); } catch(e){} },
    setEnabled(v){
      on = !!v;
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch(e){}
      return on;
    },

    /* The pour. `fill` is how full the receiving vessel ends up, 0 to 1, and
       `share` is how much of its capacity this pour was — a trickle against a
       flood.

       The slide upward is the whole cue: a vessel filling rings higher as the
       air above the liquid runs out, so a pour that nearly fills something ends
       high and a pour that barely wets the bottom stays low. That is a real
       property of the object being drawn and the player already knows it,
       which is why it can carry information without ever being explained.

       The noise on top is the stream, and it lasts as long as the pour looks
       like it lasts rather than a fixed time, so a big pour sounds like more
       liquid rather than like the same liquid played louder. */
    pour(fill = 0.5, share = 0.5){
      const from = 150 + 120 * fill;
      tone({ f: from, f2: from * (1.5 + 1.6 * fill), type: 'sine',
             dur: 0.16 + 0.2 * share, gain: 0.13 });
      burst({ freq: 900 + 700 * fill, q: 1.1, dur: 0.1 + 0.24 * share, gain: 0.05, type: 'bandpass' });
    },

    /* Filled to the brim. The one event in this game that is always
       information: a vessel at its capacity is a vessel that cannot take any
       more, and half of what makes a line work is knowing when something is
       full. A short bright ring, clear of the glug it lands on top of. */
    brim(){
      tone({ f: 1180, f2: 1560, type: 'sine', dur: 0.22, gain: 0.1, delay: 0.06 });
      burst({ freq: 3200, q: 3, dur: 0.05, gain: 0.035, delay: 0.06 });
    },

    /* The source went empty. The other half of the same information, and it has
       to be the opposite shape: a fall rather than a rise, and duller, because
       an emptied vessel is a vessel that has stopped ringing. */
    drained(){
      tone({ f: 260, f2: 130, type: 'triangle', dur: 0.18, gain: 0.09, delay: 0.05 });
    },

    /* A tap that did nothing: the same vessel twice, an empty source, a full
       target. Deliberately not a buzz. The move was not wrong, it was not a
       move, and the game should sound like it did not hear rather than like it
       disapproved. */
    nudge(){
      tone({ f: 320, f2: 300, type: 'sine', dur: 0.05, gain: 0.05 });
    },

    /* Taking it back. A pour run in reverse, at half the level, so it is
       audibly the same event undone rather than a new one. */
    undo(){
      tone({ f: 420, f2: 210, type: 'sine', dur: 0.14, gain: 0.08 });
      burst({ freq: 700, q: 1.6, dur: 0.09, gain: 0.03 });
    },

    /* The measure taken. Four notes up a major triad and out, the length of a
       breath, because this is the whole point of the board and the only moment
       in it worth a sound this long. */
    measured(){
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ f, type: 'triangle', dur: 0.42, gain: 0.13, delay: i * 0.09 }));
      burst({ freq: 2600, q: 1.2, dur: 0.3, gain: 0.03, delay: 0.1 });
    },

    /* A bench that cannot measure its target at all. Not something a player can
       do — no sequence of pours can strand this game, see the top of
       20-rules.js — but something a board dealt past the end of the par table
       can be, since nobody measured it before handing it over. Falling, and left
       hanging rather than resolved, because nothing has gone wrong: there is
       simply no answer to find here. */
    stranded(){
      [392, 311.13, 261.63].forEach((f, i) =>
        tone({ f, type: 'triangle', dur: 0.5, gain: 0.12, delay: i * 0.12 }));
      burst({ freq: 220, q: 0.5, dur: 0.5, gain: 0.05, delay: 0.12, type: 'lowpass' });
    }
  };
})();
globalThis.MeasureAudio = MeasureAudio;
