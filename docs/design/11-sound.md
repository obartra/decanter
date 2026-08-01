# 11 · Sound

Every sound is synthesised at runtime with WebAudio. The app ships no audio
files.

## Why synthesised

Audio files are by far the heaviest thing a small game carries, and this one has
to work offline from a cache and open as a single portable file. A few hundred
kilobytes of samples would have dwarfed everything else in the build, including
the room, the fonts and the entire game.

The parts are two primitives: a `tone` (oscillator through a gain envelope, with
an optional glide to a second frequency) and a `burst` (filtered noise). Every cue
is built from those.

## The pour is the one that matters

Broadband noise through a highpass, a bandpass, and two peaking filters whose
centre frequencies **rise as the receiving bottle fills**.

That rising resonance is the cue an ear actually uses to identify a vessel
filling, and adding it did more for realism than any change to the visuals. It is
also why the pour sound is driven by the fill level rather than being a fixed
sample triggered per move: the information is in the change, not in the timbre.

## The rest of the cues

Lift and drop for selection, a refusal for anything illegal, a cork for a sealed
bottle, and a short flourish on a win. A failed run gets the refusal rather than
the flourish, which is the whole audio treatment of failure and is enough.

## Unlocking

Browsers will not start an audio context without a gesture, so the context is
created lazily on the first tap. Every entry point calls `Audio.unlock()` before
doing anything else, and the sound preference is persisted with the rest of the
save.

## Not tested

There is no meaningful automated check here. Sound is judged by ear, and the
suite does not pretend otherwise. See [14 Testing](14-testing.md) for what else
falls in that category.
