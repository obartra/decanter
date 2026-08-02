/* Sound, synthesised at runtime so the page still ships as one file with no
   audio to fetch. Same approach as the other game and deliberately not the same
   module: that one is built out of pours and glugs, and none of it is the noise
   a bubble makes.

   The game has one sound that matters and the rest are supporting it. A shot
   that lands and does nothing has to feel different from a shot that clears,
   within the same tenth of a second, or the player is reading the board to find
   out what happened instead of hearing it. So `stick` is dull and short and
   `matched` is bright and opens upward, and the two can never be confused. */
const BubbleAudio = (() => {
  const KEY = 'bubble.sound';
  let ctx, master, noise;
  /* Muted is remembered, because a player who turned the sound off did not mean
     "until the next board". Storage can throw in a locked-down browser, and a
     game that will not start because it could not read a preference is worse
     than one that forgets it. */
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

  /* Every voice goes through one of these two, so a sound is a handful of
     numbers rather than a block of node wiring repeated six times. */
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
    /* Called from the first gesture of any kind. Safe to call on every one. */
    unlock(){ try { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); } catch(e){} },
    setEnabled(v){
      on = !!v;
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch(e){}
      return on;
    },

    /* The launcher. Short and dry, because it fires on every shot and anything
       with a tail turns a fast player's game into a drone. */
    shoot(){
      tone({ f: 300, f2: 620, type: 'triangle', dur: 0.05, gain: 0.1 });
      burst({ freq: 1800, q: 1.4, dur: 0.03, gain: 0.05 });
    },
    /* Landed, matched nothing. A knock with no ring to it: this is the sound of
       the turn being spent, and it should be slightly disappointing. */
    stick(){
      tone({ f: 190, f2: 130, type: 'sine', dur: 0.07, gain: 0.11 });
      burst({ freq: 700, q: 2.2, dur: 0.035, gain: 0.045 });
    },
    /* The group letting go. Opens upward and gets brighter with the size of it,
       so a five is audibly better than a three without anyone being told. */
    matched(n = 3){
      const base = 480 + 40 * Math.min(n - 3, 6);
      [0, 1, 2].forEach(i => tone({
        f: base * Math.pow(1.26, i), f2: base * Math.pow(1.26, i) * 1.5,
        type: 'triangle', dur: 0.16, gain: 0.13, delay: i * 0.035
      }));
      burst({ freq: 2400, q: 0.9, dur: 0.09, gain: 0.06 });
    },
    /* What came away with it. Deliberately behind the match by enough to be
       heard as a consequence of it rather than as part of the same event, and
       it keeps climbing with the size of the chunk, because that is the shot
       the scoring is trying to teach. */
    cut(n = 1){
      const many = Math.min(n, 8);
      for (let i = 0; i < many; i++){
        tone({ f: 700 + 90 * i, f2: 300, type: 'sine',
               dur: 0.2, gain: 0.085, delay: 0.1 + i * 0.045 });
      }
      burst({ freq: 1500, q: 0.7, dur: 0.22, gain: 0.05, delay: 0.12 });
    },
    /* The board coming down a row. Low and a little unpleasant on purpose: it
       is the only warning the player gets that the line is closer than it was. */
    advance(){
      tone({ f: 120, f2: 62, type: 'triangle', dur: 0.3, gain: 0.2 });
      burst({ freq: 260, q: 0.5, dur: 0.26, gain: 0.1, type: 'lowpass' });
    },
    /* The whole board hitting the floor at the end of a lost run. Not `matched`
       made louder: a shelf of glass going over is a spread of breaks arriving
       close together rather than one clean one, so it is several bursts scattered
       across a few tens of milliseconds, over a low body that gives it weight.
       It plays once the last bubble is already off the screen, which is why it
       can afford to be the longest sound in the game. */
    crash(){
      for (let i = 0; i < 5; i++){
        burst({ freq: 2100 + i * 420, q: 0.8 + i * 0.3, dur: 0.16 + i * 0.03,
                gain: 0.11, delay: i * 0.028 });
      }
      tone({ f: 180, f2: 45, type: 'triangle', dur: 0.5, gain: 0.22 });
      burst({ freq: 420, q: 0.5, dur: 0.55, gain: 0.1, delay: 0.03, type: 'lowpass' });
    },
    won(){
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ f, type: 'triangle', dur: 0.4, gain: 0.14, delay: i * 0.1 }));
    },
    lost(){
      [392, 329.63, 261.63].forEach((f, i) =>
        tone({ f, type: 'triangle', dur: 0.45, gain: 0.14, delay: i * 0.13 }));
      burst({ freq: 200, q: 0.5, dur: 0.5, gain: 0.07, delay: 0.1, type: 'lowpass' });
    }
  };
})();
globalThis.BubbleAudio = BubbleAudio;
