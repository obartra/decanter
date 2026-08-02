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

## Mutation checks

A test that cannot fail is worth nothing, so the important guards were checked by
breaking them on purpose and confirming the suite went red: the bare frame loop
put back, the `finally` removed, the transform-following narrowed to the pouring
bottle. That last one reproduced the original bug at 330 lit pixels outside the
glass, against 0 with the fix.

## Dead code, checked like anything else

`tools/verify-live.mjs` runs in `npm run check` and fails the build on anything
written down and never used. This ships as plain scripts concatenated into one
page, so there is no bundler to shake a tree and nothing that notices a function
nobody calls: every dead byte is downloaded by every player and maintained by the
next person as though it mattered.

Five kinds, each a different way of being unused:

| | |
| --- | --- |
| exports | a key on a module's published object that nothing reads |
| helpers | a top level function in a module that nothing in it calls |
| config | a tunable in either `CONFIG` that nothing reads |
| css | a class in a stylesheet that no markup and no script mentions |
| ids | an element id that no script and no stylesheet mentions |

The **config** check is the one worth explaining, because a stale tunable is the
most convincing dead code there is. Everything else looks like what it is; a
tunable looks like the place to change the behaviour it claims to control, and it
usually has a paragraph above it explaining the decision. `bubblePerChapter` sat
in `CONFIG` announcing "two per ten" over a function that returned a pair by
construction and never asked it anything. The number could have been set to five
and nothing would have moved.

There is no allowlist, deliberately. One existed, covering two exports, about
forty class names and two ids, and emptying it one entry at a time changed
nothing: every entry was speculative. What it would have done is forgive the
first genuinely dead rule for ever.

**Every check has a planted corpse in `tests/live.test.mjs`**, because a checker
that reports nothing is indistinguishable from one that does nothing, and the
second is worse than none: it is a green light nobody should trust. That is not
hypothetical — the helper check reported a clean repo with a dead function
sitting in front of it, and the config check's first version answered one planted
key with three accusations, because two of the nested blocks are written on one
line and have no closing brace of their own to stop at. Only planting found
either.

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
