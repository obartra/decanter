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

`baseShape(level)` is what a level would be with no ordering applied:

```
colours = min(minColors + floor((level - 1) / 2), maxColors)
empties = colours is even ? 2 : 3
bottles = colours + empties
```

Colours climb by one every two levels from 4 until they cap at 12, so the board
grows for the first 17 levels and then stops growing. Growing is not the same as
getting harder, which is what [Ordering](#ordering-by-measured-difficulty) is
about, and which is why the colour count a level actually deals may differ from
this. What never differs is the **bottle count**.

The empty count keeps that count **even**, so the board can lay out in two equal
rows: the layout only considers row counts that divide the bottles exactly, and
an odd count collapses to a single row of very narrow bottles.

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

`tools/order.mjs` writes `src/js/32-order.js`, a table of
`level: [colours, empties, seed]`. All three travel together because all three
decide which board you are dealt, and splitting them let the par table and the
ordering disagree about what a level even was.

**What stays welded to the level number is the bottle count.** The board grows
steadily and never shrinks, which is what a player reads as progress and what the
layout, the shelving and the map all depend on. Everything else is free.

That freedom matters because of the second problem, which was worse than the
first: the shape itself sawtoothed.

```
 1  4c   1.89      9  8c   3.64
 2  4c   1.95     10  8c   3.70
 3  5c   5.00     11  9c   6.36
 4  5c   5.13     12  9c   7.91   <- wall
 5  6c   2.33     13 10c   3.97   <- relief
 6  6c   2.46     14 10c   3.77
 7  7c   4.41     15 11c   7.02
 8  7c   6.10     16 11c   9.36   <- harder than everything up to level 90
```

`empties` alternates with the parity of the colour count, to keep the bottle
count even, and **empties dominate**: every extra empty adds legal moves and most
of them are wrong. So the odd-colour levels came out far harder than the
even-colour levels on either side. A player hit a wall at 12, got relief at 13, a
worse wall at 16, and relief again at 17.

The fix falls out of the constraint. Two shapes share each bottle count: 5
colours with 3 empties and 6 colours with 2 empties are both eight bottles and
look the same on screen. So levels are grouped into **bottle-count bands** and
each band's levels are filled from the measured difficulty of the boards that fit
that many bottles, whichever shape they wear.

- **A band with many levels** (the fourteen-bottle band holds every level past
  fifteen) sorts boards of the shape its levels already used. It needs
  comfortably more candidates than levels, and not only to absorb the ones too
  expensive to measure: those are disproportionately the *hardest* boards, so
  without slack the top of the curve gets quietly truncated by its own
  measurement cost.
- **A band with few levels** measures a field of every shape it could wear and
  lets the numbers pick. Every one of them chose the two-empty shape.

Small bands are filled in **level order, carrying a floor**, not band by band. A
band can only offer boards of its own bottle count, so a band that starts easier
than the last one ended puts a dip in the curve exactly where the board grows,
which is the moment the game is claiming to get harder. The floor costs a little
accuracy against the target and buys monotonicity.

Candidates are chosen against a **global** target interpolated from where the
sorted band landed, not against a spread within their own band. An earlier
version did the latter and gave level 8 a board harder than most twelve-colour
levels, because every candidate there was hard and being mid-pool said nothing
about how it compared to the rest of the game.

### Two things that did not work

Both are recorded because both looked obviously right.

**Sifting on par.** Full measurement is expensive and par is milliseconds, so the
first version sifted a wide field on par and measured only the shortest boards,
reasoning that a shorter line multiplies fewer odds together. Across shapes that
is backwards: a three-empty board has a *shorter* par than a two-empty one and a
far narrower line. The sift reliably nominated the hardest board in the band and
called it the easiest, and the ten-bottle band came out at 10^-9.6. Everything is
measured properly now; nothing is chosen on a proxy.

**Letting a band fail.** When a band could not measure every candidate it left
itself alone, which sounds conservative and is not: the fourteen-bottle band
failed on 26 of 106 boards and so 106 levels got no entry at all, which silently
disabled the ordering for seven eighths of the game. A band now proceeds on what
it measured and says how many it lost.

### How it is run

Measurements are independent, so they run across a pool of child processes fed
one job at a time. Cost varies by orders of magnitude between boards of the same
shape, so a fixed slice per worker would strand most of the machine behind one
unlucky board. Each measurement carries an expansion budget and a board that
exceeds it is skipped rather than waited on. The budget is not a preference: a
`Map` tops out near 2^24 entries and the memo holds one per failed state, so the
first version of this ran until it died.

### Result

Difficulty is **non-decreasing across all 120 levels**, from 10^-2.5 at level 1 to
10^-16.6 at level 120, with no dip anywhere. Correlation with level number is
0.96, and the shortfall from 1.0 is the curve being concave rather than straight,
which is what a difficulty ramp should be.

The measurement is committed to `docs/difficulty.json` and a test asserts it never
goes down. Re-measuring in the test suite would take twenty minutes, so the
alternative was to eyeball it once and hope; a hand-edited order or a
regeneration that quietly made the curve worse now fails a test instead of
reaching a player.

Every band chose a **two-empty** shape, so the colour count now runs
4, 4, 6, 6, 6, 6, 8, 8, 8, 8, 10, 10, 10, 10, 12 and then holds. The odd-colour
three-empty shapes are no longer dealt at all.

### The cost of reordering

A level number now deals a different board than it did. Stars and best move
counts are recorded against level numbers, so they describe boards a save will
never be dealt again, and an old best can sit below the new par and read as
impossible. `CONFIG.layout` is stamped into the save and, when it differs, the
per-board records are dropped. Gold, how far the player got, and which
first-clear bonuses were already paid all survive, because none of them
describes a particular board. See [04 Economy](04-economy.md).

Bump `CONFIG.layout` whenever `32-order.js` is regenerated, and regenerate the
par table with it. All 120 pars are re-verified as reachable in exactly par, with
none solvable in fewer, by `tools/verify-pars.mjs`.

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
