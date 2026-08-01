# 02 · Levels

What you get dealt, and why level 12 is the same puzzle for everyone forever.

## Deterministic in the level number

`hashSeed(s)` avalanches a seed and seeds a mulberry32 stream, and the generator
draws only from that. There is no stored level data and no wall clock anywhere in
the path. The seed is the level number unless `src/js/32-order.js` says
otherwise. See [Ordering](#ordering-by-measured-difficulty) below, which changes
*which* board a level deals but not that the answer is fixed.

The consequence is worth stating plainly, because a great deal depends on it:
**a level is a pure function of its number**. That is what lets stars and best
scores mean the same thing on every device, what lets par be computed once
offline and shipped as a table (see [03 Par](03-par.md)), and what makes a bug
report reproducible from a single integer.

## Shape

```
colours = min(minColors + floor((level - 1) / 2), maxColors)
empties = colours is even ? 2 : 3
bottles = colours + empties
```

Colours climb by one every two levels from 4 until they cap at 12, so the board
grows for the first 17 levels and then stops growing. Growing is not the same as
getting harder, which is what the next section is about. The empty count is chosen to
keep the bottle count **even**, so the board can lay out in two equal rows: the
layout only considers row counts that divide the bottles exactly, and an odd
count collapses to a single row of very narrow bottles.

Every colour is dealt **exactly `capacity` units**. This looks like an
implementation detail and is not: the solver's heuristic is only admissible
because each colour finishes in exactly one bottle. Deal a colour two bottles'
worth and par can come back too high, with nothing to indicate it. The
requirement is documented on both sides, here and in [03 Par](03-par.md).

## Dealing

A pool of `colours × capacity` units is shuffled with the seeded stream and cut
into full bottles, then the empties are appended. Two rejections apply:

- **No bottle may start finished.** A level that opens with a bottle already
  solved is a smaller puzzle wearing the same shape.
- **The board must be solvable.** `Rules.isSolvable` runs a depth-first probe
  with a node cap and rejects anything it cannot crack.

The generator retries up to 200 times. In practice it succeeds almost
immediately; the cap exists so that a future change to shape or capacity fails
loudly rather than hanging.

`isSolvable` is a cheap probe, not a proof. It answers "can this be finished at
all", which is a much easier question than "in how few pours", and it is capped
so generation stays fast. The expensive question is answered once, offline, by
`tools/pars.mjs`.

## Ordering by measured difficulty

The shape climbing looked like a difficulty curve and was not one. Measuring the
first 120 levels put the correlation between level number and actual difficulty
at **r = 0.05**: the twelve-colour levels alone, which is everything past 17,
spanned fourteen orders of magnitude in how likely par is, in the arbitrary order
the seeds happened to produce. The three most demanding boards in the whole table
sat at levels 3, 4 and 8.

### What is measured

A board is hard when the optimal line is narrow. At each step some moves are
legal and only some keep par reachable, so the chance of choosing correctly is
`good / legal`, and the chance of walking the whole line is those odds
multiplied. That collapses fast, so it is reported as a log.

Which moves are optimal is decided exactly, not sampled. From a state whose true
distance is `d`, a move is optimal precisely when the result is still solvable in
`d − 1`, because one pour can reduce the distance by at most one, which is the
same fact the heuristic in [03 Par](03-par.md) rests on.

Two numbers come out, and they disagree in a useful way:

| | means |
| --- | --- |
| `tight` | how narrow an average single decision is, independent of length |
| `logOdds` | the chance of getting the whole board right, which folds in length |

A long easy board and a short vicious one are told apart by exactly that
disagreement. `logOdds` orders levels; `tight` says whether a level is demanding
or merely long.

Only one optimal line is walked, not all of them. Walking every line is exact and
explodes on twelve-colour boards; one line is cheap and orders levels the same
way. The middle option is followed at each step, so the line taken is not
systematically whatever the move generator happens to emit first.

The measurement runs against the independent rules in `tests/baseline.mjs`, so it
describes the game as played rather than the solver's model of it.

### What is done with it

`tools/order.mjs` writes `src/js/32-order.js`, a level → seed table. **Only the
seed moves.** The shape still comes from the level number, so the colour count
climbs exactly as before and every property above still holds.

Levels are grouped by shape, and the two halves get different treatment:

- **A shape with many levels** (the 104 twelve-colour ones) already owns enough
  boards to sort. Their difficulties are measured and the group is reordered.
  Nothing new is generated.
- **A shape with few levels** (the pairs below level 17) has nothing to sort, so
  candidate seeds are measured and one is chosen per level.

Candidates are chosen against a **global** target interpolated from where the
sorted groups landed, not against a spread within their own shape. The first
version did the latter and gave level 8 a board harder than most twelve-colour
levels, because every candidate of that shape was hard and being mid-pool said
nothing about how it compared to the rest of the game.

The early shapes have a floor: a nine-colour board cannot be as easy as a linear
ramp asks, because more colours means a longer line and a longer line multiplies
more odds together. Those levels take the easiest board their shape allows and
still overshoot. That is the shape's cost, not a failure to search.

Measurements are independent, so they run across a pool of child processes fed
one job at a time. Cost varies by orders of magnitude between boards of the same
shape, so a fixed slice per worker would strand most of the machine behind one
unlucky board. Each measurement carries an expansion budget and a board that
exceeds it is skipped rather than waited on; candidates are plentiful.

Result: **r = 0.98**.

### The cost of reordering

A level number now deals a different board than it did. Stars and best move
counts are recorded against level numbers, so they describe boards a save will
never be dealt again, and an old best can sit below the new par and read as
impossible. `CONFIG.layout` is stamped into the save and, when it differs, the
per-board records are dropped. Gold, how far the player got, and which
first-clear bonuses were already paid all survive, because none of them
describes a particular board. See [04 Economy](04-economy.md).

Bump `CONFIG.layout` whenever `32-order.js` is regenerated, and regenerate the
par table with it.

## Chapters

Levels are grouped into sections of ten with names and tints from `CONFIG`
(`The Cellar`, `The Apothecary`, and so on). Past the named list, sections are
called `Reserve N` rather than running out. Sections are purely presentational:
they change the map's labelling and tint, and nothing about the puzzle. How they
are laid out is [09 The map](09-map.md).

## Where the ceiling is

`maxColors` is 12 and the palette has exactly 12 entries. A thirteenth colour
would need a palette entry that stays distinguishable from the other twelve on a
dark shelf, which is a real constraint and is enforced by a test in
[10 Visual system](10-visual-system.md).
