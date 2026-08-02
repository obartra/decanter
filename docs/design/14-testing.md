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

## Reachability

Nothing is tree shaken, because there is no bundler. A member left on a module's
public object, a class left in a stylesheet, or an id left in the markup ships to
the player whether or not anything reaches it, and neither the linter nor the
tests can see any of it: unused code is not an error, it is just quiet.

`tools/dead-code.mjs` is the check for that, and it runs in `npm run check` and
in CI. It is deliberately conservative, because a detector that cries wolf gets
switched off: a member counts as dead only when its name appears **nowhere else
in the repository**, not when it is missing a qualified `Module.member` call.
Modules alias each other constantly, so a qualified search would call half the
codebase dead. The cost is that a member sharing a name with an unrelated local
stays invisible, which is the right way round for a check that gates a merge.

That cost is real and worth knowing the size of. `BubbleGrid.clone` and
`Fluid.resize` were both dead and both invisible to it, because `clone` and
`resize` are written elsewhere as unrelated locals. They were found by hand and
are gone.

It reports a second, softer category it will not fail on: members only the tests
and tools reach. Sometimes that is exactly right and sometimes it is a hole poked
in a module for one assertion, and that is a judgement, not a rule.

The detector has its own suite, for the reason the section below is about. A
checker is the one kind of tool that fails by succeeding: if its pattern stops
matching, it reports a clean repository forever and the green tick means nothing.
So `tests/dead-code.test.mjs` asserts what it *examined*, not only what it found,
and pins the key extraction against the shapes these modules are really written
in. That test earned its place immediately by catching a bug in the extractor:
`count: CHAPTERS.length` was contributing a phantom member called `length`, which
went unreported precisely because `length` is written everywhere.

## One scope, shared by everything

Both games are concatenated into a single `<script>`, so the top level of a
module is the top level of the page. Two modules declaring one name either
overwrite each other in silence, if they are functions, or fail to parse at all,
if they are `const`, and a page that is one script failing to parse is a blank
screen.

The suite has long forbidden the other game publishing an unprefixed
`globalThis` name for this reason, which was watching one of the two doors. Six
modules declared their functions at the top level and published a namespace
afterwards, putting `shape`, `deal`, `make`, `at`, `rate` and twenty-five more
into that scope. They are IIFEs now, like every module in the other game already
was, and `verify-live.mjs` checks the rule rather than leaving it to be
remembered.

## Checks on the repo rather than on the game

For the things that rot while nobody is editing them:

- **the documents**: every relative link resolves, `DESIGN.md` indexes every
  design document and nothing else, every repo path named in backticks is on
  disk. Written after a README row described a folder of painted backdrops that
  does not exist and by these notes' own account never should
- **the checks themselves**: every `verify:*` script is run by the CI workflow.
  `verify:live` was in `npm run check` and in no CI step at all, so nothing it
  found could fail a pull request

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

## The tunable that lied

`CONFIG.bubblePerChapter` announced "two per ten" over a function that returned a
pair by construction and never asked it anything: it could have been set to five
and nothing would have moved. A stale tunable is the most convincing dead code
there is, because everything else looks like what it is, while a tunable looks
like the place to change the behaviour it claims to control and usually carries a
paragraph explaining the decision.

So `verify-live` checks both `CONFIG` objects, one level of nesting deep, and
asks for a qualified read rather than a name appearing somewhere. It has to: a
config key is a short common word, and `blast`, `daily` and `attempt` are all
written in prose and in other modules' variables, so a name-anywhere test calls
every tunable alive whether or not a line ever reads `CONFIG.economy.blast`.

That check answered its first planted corpse with three accusations, because two
of the nested blocks are written on one line and have no closing brace of their
own to stop at, so matching them against the multi-line shape ran them on to the
next brace and swallowed a neighbour. Both shapes have a planted corpse now.

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
