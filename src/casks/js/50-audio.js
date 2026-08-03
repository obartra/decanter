/* Sound, synthesized at runtime, so the page still ships as markup and one
   bundle with nothing to fetch.

   Built on the same two primitives the other two games use, `tone` and `burst`,
   and copied rather than shared for the reason everything here is copied rather
   than shared: three games with no module in common cannot have one game's sound
   design pinned by another's. What is not copied is a single voice. The bubble
   game is knocks and pops and the measure is liquid in glass; this room is
   several hundredweight of oak dragging across stone, which is almost entirely
   noise, and none of their cues would be right here.

   The cue that matters is the slide, because it is the only thing the player
   ever does, and it has to say how far the cask went. A shove of one cell and a
   shove of four cost the same single move — that is the whole of
   docs/design/01-puzzle.md's rule — but they are not the same physical event,
   and a sound that made them identical would be flattening the one thing about a
   move that is not a decision. So the scrape lasts as long as the cask is
   actually moving, and the thud at the end is what says it ran out of floor. */
export const CasksAudio = (() => {
  const KEY = 'casks.sound';
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
    const len = Math.floor(ctx.sampleRate * 1.2);
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
  /* `attack` is how long the noise takes to reach full. Everything else here
     wants it near zero, which is a hit; the scrape wants it long, which is
     something being pushed rather than struck. That one parameter is the whole
     difference between wood landing on stone and wood traveling over it. */
  function burst({ freq = 1200, q = 1, dur = 0.09, gain = 0.2, delay = 0,
                   type = 'bandpass', freq2, attack = 0.006 }){
    if (!on || !ctx) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freq2) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(attack, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  return {
    get enabled(){ return on; },
    /* Called from the first gesture of any kind, and cheap after the first. The
       context starts suspended and stays there until a gesture, so anything
       scheduled before the first touch is played to nobody. */
    unlock(){ try { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); } catch(e){} },
    setEnabled(v){
      on = !!v;
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch(e){}
      return on;
    },

    /* A hand on a cask. Almost nothing: a knuckle on a stave. It exists because
       a board where picking something up is silent and moving it is loud reads
       as the game only noticing the second half of what you did. */
    take(){
      burst({ freq: 420, q: 2.2, dur: 0.045, gain: 0.06, type: 'bandpass' });
      tone({ f: 150, f2: 96, type: 'triangle', dur: 0.07, gain: 0.05 });
    },

    /* The slide. `cells` is how far it went and `gilt` is whether it was the
       cask that matters.

       Filtered noise with a slow attack, which is what makes it a scrape rather
       than a hit, and the filter sweeps DOWN across the move: a heavy object
       being pushed starts bright where it breaks free and settles as it runs.
       The length follows the distance because it has to — a four-cell shove that
       sounded like a one-cell nudge would be the audio contradicting the
       animation — while the move itself still costs exactly one either way.

       The gilt cask is a fifth lower and a little louder. It is full and the
       others are not, and that is the only place in this game where a sound says
       something about an object rather than about an event. */
    slide(cells = 1, gilt = false){
      const dur = Math.min(0.34, 0.1 + 0.075 * cells);
      const base = gilt ? 700 : 1050;
      burst({ freq: base * 1.6, freq2: base * 0.55, q: 0.8, dur, gain: gilt ? 0.1 : 0.075,
              type: 'bandpass', attack: dur * 0.35 });
      tone({ f: gilt ? 74 : 96, f2: gilt ? 58 : 76, type: 'triangle', dur: dur * 0.9, gain: 0.05 });
    },

    /* The stop. Only when the cask actually ran into something — a wall or
       another cask — never when the player chose to stop it short, because those
       are different events and only one of them is information. Low, short, and
       with no ring at all: oak against oak does not ring. */
    thud(){
      tone({ f: 118, f2: 62, type: 'triangle', dur: 0.13, gain: 0.13 });
      burst({ freq: 260, q: 1.1, dur: 0.07, gain: 0.06, type: 'lowpass' });
    },

    /* A touch that did nothing: an empty flagstone with nothing in hand, or a
       cell the cask could not have slid to. Deliberately not a buzz. It was not
       a wrong move, it was not a move, and the game should sound like it did not
       hear rather than like it disapproved. */
    nudge(){
      tone({ f: 300, f2: 285, type: 'sine', dur: 0.05, gain: 0.05 });
    },

    /* Taking it back. A slide run backwards — the filter sweeps up where the
       slide sweeps down — so it is audibly the same event undone rather than a
       new one. */
    undo(){
      burst({ freq: 480, freq2: 1200, q: 0.9, dur: 0.16, gain: 0.06, type: 'bandpass', attack: 0.05 });
      tone({ f: 90, f2: 130, type: 'triangle', dur: 0.14, gain: 0.05 });
    },

    /* The door. The gilt cask goes out through the wall and this is the only
       moment on the page worth a sound this long: the groan of a heavy door on
       its hinges, then the room beyond. The rising fifth at the end is the only
       consonant thing in the whole cue, and it is there because everything
       before it is wood and stone. */
    door(){
      burst({ freq: 180, freq2: 620, q: 0.7, dur: 0.6, gain: 0.1, type: 'bandpass', attack: 0.22 });
      tone({ f: 82, f2: 61, type: 'sawtooth', dur: 0.5, gain: 0.05 });
      [392, 587.33].forEach((f, i) =>
        tone({ f, type: 'triangle', dur: 0.5, gain: 0.11, delay: 0.34 + i * 0.11 }));
      burst({ freq: 2400, q: 1.4, dur: 0.4, gain: 0.025, delay: 0.36 });
    }
  };
})();
