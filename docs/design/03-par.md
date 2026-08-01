# 03 · Par and the solver

Every level shows the minimum number of pours needed to solve it. This document
is about how that number is known to be the minimum, and what happens when it
cannot be.

## The search

A\* over board states, with a bucket queue and a closed set.

**Heuristic.** `h = (total contiguous colour segments) − (number of colours)`.

**Why it is admissible.** A pour moves one maximal run. The source loses that
segment only if the whole run moves; the target either merges with a matching top
or starts a new segment. Working the cases through, no single pour can reduce the
total segment count by more than one, and the solved state has exactly one
segment per colour. So the remaining distance is never less than `h`.

That last step leans on a property of the **generator**, not of the rules: every
colour is dealt exactly `capacity` units, so every colour finishes in exactly one
bottle. A level that gave some colour two bottles' worth would end with more
segments than colours, `h` would overshoot at the goal, and par could come back
too high with nothing to show for it. Deal colours in whole bottles, or change
`h` to subtract the number of filled bottles the solved state needs rather than
the number of colours. See [02 Levels](02-levels.md).

**Why it is consistent.** Segment count never increases, and drops by at most one
per move, so `h(n) ≤ 1 + h(n')` for every successor. With a consistent heuristic
and a closed set, A\* returns a true minimum.

**Why not IDA\*.** The first implementation used IDA\* with a transposition
table. Pruning a node by returning a sentinel cost corrupts the next bound, which
can overshoot the optimum and report a number that is too high. A\* with a bucket
queue avoids the problem and profiled faster on real levels.

**Pruning.** Two reductions, both state preserving: empty bottles are
interchangeable so only one is considered as a target, and pouring a uniform
bottle into an empty one produces the same multiset of bottles so it is skipped.
Duplicate targets with identical contents are collapsed. `tests/solver.test.mjs`
checks that none of this changes the answer, by comparing against a brute force
breadth-first search that applies no pruning at all.

## Where par actually comes from

Not from the browser. `tools/pars.mjs` solves every level offline with a budget
no page load could afford and writes `src/js/35-pars.js`, which is committed. It
currently holds 120 levels, solved in about twenty seconds.

Levels are deterministic, so par is a fixed property of a level and there is
nothing to rediscover on each visit. A slow phone and a fast laptop show the same
number, and the search never competes with the animation for a frame.

The table is regenerated with `npm run pars` after any change to the generator,
the capacity, or the solver. A test re-solves a spread of levels and fails if the
committed table disagrees, so a stale table cannot survive.

## The fallback, and why an estimate is never scored

For levels past the end of the table, the search runs in the browser: 400,000
expansions or 8 seconds in a Web Worker, and a much tighter 60,000 and 1.2
seconds when Workers are unavailable, as in some sandboxed embeds and privacy
modes.

That tighter budget is not hypothetical. Before the table existed, four of the
first sixty levels ran out of it and fell back to `anySolution()`, whose answer is
whatever depth a depth-first search stumbles into first. Level 38 reported 59
pours against a true minimum of 41.

So an inexact par is shown with a `~`, is never cached as fact, and **never
decides anything**. `rate()` takes an `exact` flag and treats an estimate as no
par at all.

An estimate is an **upper bound**: the search found a way through in that many
pours and stopped looking, so a run that beats it has not been shown to match the
minimum, and a run that misses it has not been shown to miss the minimum. It
cannot honestly move a rating in either direction. This mattered when a bad
estimate could cost a star. It matters far more now that it could **fail a run**,
because scoring one would end somebody's level for the search's shortcomings
rather than their own.
