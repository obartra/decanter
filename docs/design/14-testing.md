# 14 · Testing

How this is verified, and what it deliberately cannot verify.

`node tests/run.mjs`, or `npm run check` to build first. No dependencies, no
framework: a few dozen lines of runner and a set of suites.

## Independent implementations, not restated expectations

The strongest tests here do not assert what the code does; they assert that two
things that were built separately **agree**.

- `tests/baseline.mjs` is a second, deliberately naive implementation of the rules
  plus an exhaustive breadth-first search. It shares no code with the real one.
- The rules are checked against it move for move over thousands of random
  positions.
- The solver is checked against it board for board: same answer, or both agree it
  is unsolvable.
- The committed par table is re-solved on a spread of levels and must match.

A test that restates the implementation passes when the implementation is wrong.
A test that compares two independent routes to the same answer does not.

## Properties, not coordinates

Geometry is tested by the properties that matter (one node per level, climbing
steadily, staying inside the column, far enough apart to tap, the canvas tall
enough to hold everything) rather than by pinning exact numbers. Pinned
coordinates fail on every layout tweak and prove nothing.

The economy is tested the same way. Alongside the specific numbers, four
invariants are asserted directly: an attempt must cost less than a clear pays, a
daily draught must buy several attempts, another go must stay cheaper than paying
past a board, and a vessel must cost around three good levels. Those are the
statements that stay true when the numbers are retuned.

## Structural tests, where behaviour cannot be reached

Some code needs a DOM, `requestAnimationFrame` and a visibility state, none of
which exist in this runner and none of which can be faked without adding a
dependency. Where a guard in that code is load-bearing, it is pinned
structurally: the source is asserted to still contain the shape of the fix.

These are honest about being weaker than behavioural tests, and say so in the
files. They cover:

- every frame loop going through the backstopped helper rather than a bare
  recursive `requestAnimationFrame`
- `drain()` releasing its flag in a `finally` and surviving one failed animation
- the liquid renderer having no notion of a particle outside a bottle
- the worker revalidating navigations, and tracking the controller rather than
  sampling it once

## Checks on the repo rather than on the game

A third kind, for the things that rot while nobody is editing them. They are in
the unit suite because they need nothing but the files:

- **`verify:dead`**, its own tool, described in [14b CI](14b-ci.md)
- **the documents**: every relative link resolves, `DESIGN.md` indexes every
  design document and nothing else, every repo path named in backticks is on
  disk. Written after a README row described a folder of painted backdrops that
  does not exist and by these notes' own account never should
- **the checks themselves**: every `verify:*` script is run by the CI workflow.
  `verify:dead` was written, wired into `npm run check`, and would have reached
  main without CI running it once, because the workflow names its steps
  individually rather than calling `check`

## Mutation checks

A test that cannot fail is worth nothing, so the important guards were checked by
breaking them on purpose and confirming the suite went red: the bare frame loop
put back, the `finally` removed, the transform-following narrowed to the pouring
bottle. That last one reproduced the original bug at 330 lit pixels outside the
glass, against 0 with the fix.

The same was done for the sound and repo checks, which need it more than most,
because every one of them guards something whose failure is silent:

- the bang's recording pointed at a path that is not there. The synthesised
  fallback took over, so the game still banged; the node count went from 3 to 9
  and said which one had played
- muting reverted to reaching one game's audio module. Both mute tests went red
- a `verify:*` script replaced in the workflow with `echo skipped`
- an export nothing reads, a stray top-level declaration, and a style rule no
  element carries, each added in turn and each reported

## What is not tested, and why

- **Sound.** Judged by ear.
- **How the pour looks in motion.** The suite has no renderer, and the browser
  used for checking does not paint continuously, so the arc, the splash and the
  settle are unverified by machine.
- **Whether the room looks good.** Alignment is measured; taste is not.
- **Real device performance.**

The failures of this exercise are worth recording, because they were all the same
mistake: **measuring the wrong thing and reporting it as proof**. Lit pixels were
counted outside the glass's bounding box while the defect lived inside that box
and outside the rounded shape, so three consecutive checks read zero while the bug
was plainly visible on screen. A hand-made imitation of a browser stood in for a
browser. And nobody checked which build was being tested.

The lesson that stuck: when a measurement disagrees with a screenshot, the
measurement is the thing to doubt first.
