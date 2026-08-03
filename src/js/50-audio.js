/* Every sound the game itself makes is synthesized at runtime. The pour is
   broadband noise shaped by two resonant peaks that rise in pitch as the
   receiving bottle fills, which is the cue an ear uses to hear "filling".

   One recording ships alongside, and it belongs to the one thing here that is
   not the game. See `loadBoom` for why that one is worth the bytes. */
const Sound = (() => {
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
  /* Plays a decoded recording, forced like the rest of the bang and loud on
     purpose. Not full scale, because three of these overlap: at 0.8 the three
     together peak at 0.49 of full scale against the synthesized bang's 0.25, so
     it is twice the peak and three times the loudness of what it replaces and
     still has half the headroom left. A recording swapped in hotter than this
     one is what would spend that headroom, which is why a test measures the mix
     rather than trusting the number. */
  function shot(buf, gain, delay){
    init();
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(g).connect(master);
    s.start(t);
  }
  /* The one recorded sound in the game.

     Samples are the heaviest thing a small game carries, and every cue the game
     itself makes has a reason not to be one: the pour is a parameter rather than
     a sound, the glug is pitched off the same fill level, and the interface cues
     want to be nearly nothing. A bang is where all of that stops applying.
     Nothing in the puzzle makes this noise, it is never pitched, and its entire
     job is to be bigger than the game around it, which is the one job a
     synthesized imitation of an explosion cannot do, however carefully it is
     tuned.

     Fetched when the bang is called for rather than at startup, so a player who
     never types the word never pays for it. Failure is not handled because there
     is nothing to handle: the synthesized bang below is still there, and a
     celebration that falls back to it is a celebration nobody notices was
     downgraded. */
  let boomBuf = null, boomFetch = null;
  function loadBoom(){
    if (boomFetch) return boomFetch;
    /* The build writes this, as a path or as the bytes themselves. Sources
       served unbuilt have no such tag, and neither would a build whose file went
       missing; both land on the synthesized bang. */
    const src = document.querySelector('meta[name="boom"]')?.content;
    if (!src) return (boomFetch = Promise.resolve());
    init();
    boomFetch = fetch(src)
      .then(r => r.arrayBuffer())
      .then(b => ctx.decodeAudioData(b))
      .then(buf => { boomBuf = buf; })
      .catch(() => {});
    return boomFetch;
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
    /* Waited on before the bang goes off, so the recording is what plays rather
       than what arrives after it. */
    loadBoom,
    /* An explosion. Nothing in the puzzle makes this noise, and nothing should:
       it belongs to the one thing here that is not part of the game.

       The recording plays when it is there. What follows is what happens when it
       is not, and it stays because a bang is the one cue that cannot simply be
       skipped: three sounds arriving together, since dropping any of them leaves
       it sounding like a door. The crack is the front of it, a hiss of high
       noise with no body. The body is a sine falling off the bottom of hearing,
       which is what makes it felt rather than heard. The tail is low noise
       decaying slowly underneath, the debris still coming down. */
    /* Glass giving way, for the blast. Deliberately not boom(): that one forces
       itself past the mute setting because somebody who typed a secret word
       into a URL has asked for it, and nobody buying a tool mid-run has. Short
       and dry, so it reads as one bottle going rather than as the celebration
       below. The crack is on top, the body is what is left of the liquid. */
    smash(){
      burst({ freq:5200, q:0.6, dur:0.06, gain:0.3 });
      burst({ freq:1800, q:0.4, dur:0.22, gain:0.16, delay:0.01 });
      tone({ f:190, f2:60, type:'triangle', dur:0.26, gain:0.2, delay:0.01 });
    },
    boom(delay = 0){
      if (boomBuf){ shot(boomBuf, 0.8, delay); return; }
      burst({ freq:3400, q:0.7, dur:0.05, gain:0.34, delay, force:true });
      tone({ f:230, f2:30, type:'triangle', dur:0.9, gain:0.5, delay, force:true });
      burst({ freq:240, q:0.4, dur:0.75, gain:0.3, delay:delay + 0.01, type:'lowpass', force:true });
      burst({ freq:950, q:0.5, dur:0.5, gain:0.13, delay:delay + 0.05, force:true });
    }
  };
})();
/* 49-audio.js has been taking every cue until now, and the app read the save and
   set the sound preference on it during boot — before this file existed. So the
   setting is read off the stand-in before the name is taken: without that, a
   player who plays muted is un-muted a second or so after opening the game, by
   their own preference arriving too late.

   No local for the stand-in, because the top level of this file is the top level
   of the page and one module may leave exactly one name there. */
Sound.setEnabled(globalThis.Sound?.enabled ?? true);
globalThis.Sound = Sound;
