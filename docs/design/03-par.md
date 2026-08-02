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

**Why a shortage of empty bottles does not break it.** The Towers of Hanoi
intuition, that a bound like this only holds while there is somewhere to put
things, points the wrong way here. `h` must never *over*estimate. A cramped board
is harder, so its true distance is larger, which leaves `h` further below the
truth rather than above it. Constraints can only make an admissible heuristic
more conservative.

The direction that would matter is the opposite one, and it has a single known
cause: the whole-bottle requirement above. If a colour ever spanned two bottles,
`h` would overshoot at the goal and par could come back **too high**, giving a
level easier than advertised, never one that cannot be finished.

**Par is a path, not an estimate.** This is the part worth holding onto. A\*
returns `g`, the length of a sequence of legal moves it actually walked, not `h`.
So par is reachable by construction, provided the moves the search considers are
moves the game allows, which is what the rules-versus-baseline test exists to
guarantee. The only way to publish an unreachable par would be to search a
different game than the one being played.

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
no page load could afford and writes `src/js/pure/35-pars.js`, which is committed. It
currently holds 120 levels, solved in about twenty seconds.

Levels are deterministic, so par is a fixed property of a level and there is
nothing to rediscover on each visit. A slow phone and a fast laptop show the same
number, and the search never competes with the animation for a frame.

The table is regenerated with `npm run pars` after any change to the generator,
the capacity, the solver, or the level ordering in `32-order.js`. Reordering
changes which board a level number deals, so every entry moves. See
[02 Levels](02-levels.md). A test re-solves a spread of levels and fails if the
committed table disagrees, so a stale table cannot survive.

That check re-solves with the **same** solver, so it catches a stale table and
nothing else. A second test asks the harder question: for a spread of levels,
does a sequence of exactly `par` legal moves exist under the **independent** rules
in `baseline.mjs`, and does replaying it really finish the board? A par that
cannot be played would fail every player on that level while looking entirely
reasonable in the table.

`tools/verify-pars.mjs` runs that check over the whole table rather than a sample.
All 120 levels are reachable in exactly par, and none is solvable in fewer.

## Where the graded game ends

`tools/pars.mjs` publishes `LAST_LEVEL` alongside the table, and progression stops
there. This is not a content decision, it is forced by the one below: without a
known par there is no bar to measure a run against, so `rate()` awards full marks.

A level past the table would therefore be a level that **cannot be failed and
cannot be played badly**, paying three stars every time. With the current economy
that is 6 gold for the stars plus 8 for the first clear against a 5 gold attempt
fee, so every such level is a guaranteed +9 and there is no end to them. Unbounded
gold is the one thing the economy is explicitly built to avoid, see
[04 Economy](04-economy.md).

So the frontier is clamped in `40-progress.js` (on load, on clear, and on
purchase), the map's lookahead is clamped in `80-map.js`, and the end-of-run panel
stops offering a next level. Solving in the browser stays as the fallback for a
level whose par is missing; it is not a licence to ship one.

Extending the game means extending the table, not lifting the cap.

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
