/* All sound is synthesised at runtime, so the app ships with no audio files.
   The pour is broadband noise shaped by two resonant peaks that rise in pitch
   as the receiving bottle fills, which is the cue an ear uses to hear "filling". */
const Audio = (() => {
  let ctx, master, noise, pourNode, on = true;

  function init(){
    if (ctx) return;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 1.5;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  /* `force` plays regardless of the sound setting. Only Jabari mode uses it: an
     Easter egg somebody went out of their way to type a secret word for is a
     request, and a bang nobody hears is not a bang. Nothing the game itself
     does may set it. */
  function tone({ f = 440, f2, type = 'sine', dur = 0.15, gain = 0.2, delay = 0, force = false }){
    if (!on && !force) return; init();
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur * 0.85);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function burst({ freq = 1200, q = 1, dur = 0.09, gain = 0.2, delay = 0, type = 'bandpass', force = false }){
    if (!on && !force) return; init();
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }
  return {
    get enabled(){ return on; },
    /* Whether a sound scheduled right now would actually be heard. A page that
       has not been touched yet is not allowed to make one: the context starts
       suspended and stays there until a gesture, so anything scheduled before
       that is played to nobody. */
    get ready(){ return !!ctx && ctx.state === 'running'; },
    unlock(){ try { init(); if (ctx.state === 'suspended') ctx.resume(); } catch(e){} },
    setEnabled(v){ on = !!v; if (!on) this.pourEnd(); return on; },
    toggle(){ return this.setEnabled(!on); },
    lift(){ tone({ f:660, f2:880, dur:0.09, gain:0.14 }); },
    drop(){ tone({ f:520, f2:340, dur:0.1, gain:0.11 }); },
    deny(){ tone({ f:150, f2:90, type:'triangle', dur:0.14, gain:0.15 }); },
    tick(){ tone({ f:880, f2:1320, dur:0.07, gain:0.1 }); },
    pourStart(){
      if (!on) return; init();
      if (pourNode) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
      const air = ctx.createBiquadFilter(); air.type = 'bandpass'; air.frequency.setValueAtTime(1500, t); air.Q.value = 0.6;
      const r1 = ctx.createBiquadFilter(); r1.type = 'peaking'; r1.frequency.setValueAtTime(360, t); r1.Q.value = 9; r1.gain.value = 17;
      const r2 = ctx.createBiquadFilter(); r2.type = 'peaking'; r2.frequency.setValueAtTime(720, t); r2.Q.value = 6; r2.gain.value = 10;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      s.connect(hp).connect(air).connect(r1).connect(r2).connect(g).connect(master);
      s.start();
      g.gain.linearRampToValueAtTime(0.085, t + 0.1);
      pourNode = { s, g, air, r1, r2 };
      burst({ freq:2600, q:1, dur:0.13, gain:0.06 });
    },
    pourAt(p){
      if (!pourNode || !ctx) return;
      const t = ctx.currentTime + 0.06;
      pourNode.r1.frequency.linearRampToValueAtTime(360 + 540 * p, t);
      pourNode.r2.frequency.linearRampToValueAtTime(720 + 900 * p, t);
      pourNode.air.frequency.linearRampToValueAtTime(1500 + 650 * p, t);
    },
    pourEnd(){
      if (!pourNode || !ctx) return;
      const { s, g } = pourNode, t = ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.16);
      try { s.stop(t + 0.22); } catch(e){}
      pourNode = null;
    },
    glug(p){
      const base = (290 + 250 * p) * (0.9 + Math.random() * 0.2);
      tone({ f:base * 1.7, f2:base * 0.72, dur:0.1, gain:0.12 });
      burst({ freq:base * 3.2, q:2.6, dur:0.045, gain:0.05 });
    },
    cork(){
      burst({ freq:2600, q:0.8, dur:0.03, gain:0.15 });
      tone({ f:940, f2:170, dur:0.085, gain:0.4, delay:0.008 });
      tone({ f:145, f2:75, type:'triangle', dur:0.24, gain:0.2, delay:0.03 });
      burst({ freq:520, q:3, dur:0.16, gain:0.06, delay:0.02 });
    },
    win(){
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ f, type:'triangle', dur:0.45, gain:0.15, delay:i * 0.11 }));
    },
    /* An explosion. Nothing in the puzzle makes this noise, and nothing should:
       it belongs to the one thing here that is not part of the game.

       A bang is three sounds arriving together, and dropping any of them leaves
       it sounding like a door. The crack is the front of it, a hiss of high
       noise with no body. The body is a sine falling off the bottom of hearing,
       which is what makes it felt rather than heard. The tail is low noise
       decaying slowly underneath, the debris still coming down. */
    boom(delay = 0){
      burst({ freq:3400, q:0.7, dur:0.05, gain:0.34, delay, force:true });
      tone({ f:230, f2:30, type:'triangle', dur:0.9, gain:0.5, delay, force:true });
      burst({ freq:240, q:0.4, dur:0.75, gain:0.3, delay:delay + 0.01, type:'lowpass', force:true });
      burst({ freq:950, q:0.5, dur:0.5, gain:0.13, delay:delay + 0.05, force:true });
    }
  };
})();
/* 49-audio.js has been taking every cue until now, and the app read the save and
   set the sound preference on it during boot — before this file existed. Taking
   the name without reading that back would un-mute a player who plays muted, a
   second or so after they opened the game and with nothing to explain it. */
const stub = globalThis.Audio;
globalThis.Audio = Audio;
if (stub && stub !== Audio && typeof stub.enabled === 'boolean') Audio.setEnabled(stub.enabled);
