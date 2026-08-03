# 11 · Sound

Every sound the game makes is synthesized at runtime with WebAudio. The app
ships exactly one audio file, and it is not one of the game's sounds.

## Why synthesized

Audio files are by far the heaviest thing a small game carries, and this one has
to work offline from a cache and open as a single portable file. A few hundred
kilobytes of samples would have dwarfed everything else in the build, including
the room, the fonts and the entire game.

The parts are two primitives: a `tone` (oscillator through a gain envelope, with
an optional glide to a second frequency) and a `burst` (filtered noise). Every cue
is built from those.

## The pour is the one that matters

Broadband noise through a highpass, a bandpass, and two peaking filters whose
center frequencies **rise as the receiving bottle fills**.

That rising resonance is the cue an ear actually uses to identify a vessel
filling, and adding it did more for realism than any change to the visuals. It is
also why the pour sound is driven by the fill level rather than being a fixed
sample triggered per move: the information is in the change, not in the timbre.

## The rest of the cues

Lift and drop for selection, a refusal for anything illegal, a cork for a sealed
bottle, and a short flourish on a win. A failed run gets the refusal rather than
the flourish, which is the whole audio treatment of failure and is enough.

## The one recording

`assets/audio/boom.mp3`, 17KB, played only by Jabari mode
(see [04 Economy](04-economy.md)). It is `explosionCrunch_001` from Kenney's
sci-fi pack, CC0, mono at 96k, and the argument above does not apply to it:

- **It is not the game.** Nothing in the puzzle makes this noise, so the bytes
  are only ever fetched by someone who typed the secret word. Everyone else
  downloads a page that mentions it and no more.
- **It is never pitched.** The pour and the glug are driven by the fill level,
  which is why a fixed recording cannot play them. A bang is fired once at one
  size.
- **Its whole job is to be bigger than the game.** That is the one job a
  synthesized imitation of an explosion cannot do, however carefully it is
  tuned, and the synthesized one was tuned carefully.

The synthesized bang is still in `50-audio.js` and still fires when the
recording does not arrive, which is what a page served unbuilt does. It sounds
like a bang, so nothing looks broken, and that is exactly why a test pins the
recording as the thing that played rather than only checking that something did:
the recording is one buffer source per bang and the fallback is three.

To swap it, audition in the sound lab and copy the winner across:

```bash
node tools/sound-lab/make.mjs && cp tools/sound-lab/audio/<name>.mp3 assets/audio/boom.mp3
```

The shipped file is byte for byte what the lab produces, so that is a swap
rather than a re-encode. The build id covers the recording, so installed copies
pick up a new one without a code change.

## Unlocking

Browsers will not start an audio context without a gesture, so the context is
created lazily on the first tap. Every entry point calls `Sound.unlock()` before
doing anything else, and the sound preference is persisted with the rest of the
save.

The module is `Sound` and not `Audio` because the page has one global scope and
`Audio` is a constructor the browser already defines. Nothing here ever built an
`new Audio()`, so the collision was silent, which is what made it worth a name
change and a test rather than a comment.

## One preference, three modules

There are three audio modules on the app page, one per game, and the other two
remember their own preference in keys of their own, because they also ship as
pages of their own where there is no save to read. On the app page the save
wins: `applySound` in `90-app.js` is the only thing that applies it, at boot and
on every toggle, and it reaches the others through `BubbleApp.sound` and
`CasksApp.sound` rather than their audio modules, because the coupling to
another game is one object wide on purpose.

That was a bug before it was a rule. Muting reached one module, so the two
boards a chapter that are the other game stayed loud, on a screen with no sound
button, for a player who had already done the only thing the game offers for
making it stop. The cellar door then arrived as a third module and was wired to
none of it, which is the same bug a second time and the reason the rule is
written down here rather than left in the code.

## One button, one place

A glyph at the left of the header, next to the way out, on every screen there
is. It was two shapes in two places — words in a row of priced buttons in a
level, a glyph in the header on the map — and the screens that are another game
had neither, so the one screen a player could not stop a sound from was the
screen the unfamiliar sound was coming from.

Two shapes is also two things to keep in step. `applySound` paints whatever
carries `js-sound`, and there is now one kind of thing to paint.

## What can be checked, and what cannot

Whether it sounds good cannot be. Nothing here pretends otherwise, and the sound
lab exists because that judgement is made by ear.

Nearly everything around it can be, and the reason to bother is that this is the
subsystem where failure is silent by construction: a sound that stops playing
throws nothing, renders nothing, and fails no test that was not written for it.
So the suites check that a cue actually reached the audio graph, by counting the
nodes it built, which is the only thing a browser will tell you about whether a
sound happened:

- the bang plays the recording rather than the synthesized fallback, by node
  count, because the fallback still sounds and would hide the difference forever
- three of them overlapping neither clip nor come out quieter than the bang they
  replaced, measured by rendering the actual mix
- the portable file still has its bang when opened off disk
- muting reaches all three games, a game muted in an earlier sitting comes back
  muted in all of them, and every screen with a game on it has the button
- every cue a module defines is called by something

See [14 Testing](14-testing.md) for what else is judged by eye rather than by
the suite.
