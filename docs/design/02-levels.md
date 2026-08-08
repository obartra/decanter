# 02 · Levels

What you get dealt, and why level 12 is the same puzzle for everyone forever.

## Deterministic in the level number

`hashSeed(s)` avalanches a seed and seeds a mulberry32 stream, and the generator
draws only from that. There is no stored level data and no wall clock anywhere in
the path. The seed is the level number unless `src/js/pure/32-order.js` says
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
colors = min(minColors + floor((level - 1) / 2), maxColors)
empties = colors is even ? 2 : 3
bottles = colors + empties
```

Colors climb by one every two levels from 4 until they cap at 12, so the board
grows for the first 17 levels and then stops growing. Growing is not the same as
getting harder, which is what [Ordering](#ordering-by-measured-difficulty) is
about, and which is why the color count a level actually deals may differ from
this. What never differs is the **bottle count**.

The empty count keeps that count **even**, so the board can lay out in two equal
rows: the layout only considers row counts that divide the bottles exactly, and
an odd count collapses to a single row of very narrow bottles.

Every color is dealt **exactly `capacity` units**. This looks like an
implementation detail and is not: the solver's heuristic is only admissible
because each color finishes in exactly one bottle. Deal a color two bottles'
worth and par can come back too high, with nothing to indicate it. The
requirement is documented on both sides, here and in [03 Par](03-par.md).

## Dealing

A pool of `colors × capacity` units is shuffled with the seeded stream and cut
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

The shape climbing looked like a difficulty curve and was not one. Measured over
the first 120 levels, the order the game shipped with correlated with actual
difficulty at **r = 0.15**, and **62 of its 119 steps went down**: more than half
the time, the next level was easier than the one before. The board grew, and that
was all it did.

### What is measured

A board is hard when the optimal line is narrow. At each step some number of
things you could do keep par reachable and the rest do not, so the chance of
choosing correctly is `good / distinct`, and the chance of walking the whole line
is those odds multiplied. That collapses fast, so it is reported as a log.

**Distinct, not legal.** Moves are counted by the board they produce, not by the
pair of bottles they name. Pouring into the first empty bottle and pouring into
the second are one decision, and counting them as two made every extra empty look
like another way to go wrong. This is the same state-preserving reduction the
solver applies, for the same reason, and getting it wrong cost more than any
other mistake here: see [below](#three-things-that-did-not-work).

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
explodes on twelve-color boards; one line is cheap and orders levels the same
way. The middle option is followed at each step, so the line taken is not
systematically whatever the move generator happens to emit first.

The measurement runs against the independent rules in `tests/baseline.mjs`, so it
describes the game as played rather than the solver's model of it.

### What is done with it

`tools/order.mjs` writes `src/js/pure/32-order.js`, a table of
`level: [colors, empties, seed]`. All three travel together because all three
decide which board you are dealt, and splitting them let the par table and the
ordering disagree about what a level even was.

**What stays welded to the level number is the bottle count.** The board grows
steadily and never shrinks, which is what a player reads as progress and what the
layout, the shelving and the map all depend on. Everything else is free.

That freedom is what the ordering needs, because the boards a level dealt were
simply whatever its seed produced. Measured, the original first sixteen went:

```
 1  4c/2e   1.85      9  8c/2e   5.91
 2  4c/2e   3.35     10  8c/2e   7.25
 3  5c/3e   6.58     11  9c/3e   6.51
 4  5c/3e   8.92     12  9c/3e   6.94
 5  6c/2e   6.99     13 10c/2e   9.89
 6  6c/2e   2.92     14 10c/2e   3.82   <- easier than level 3
 7  7c/3e   7.07     15 11c/3e   5.75
 8  7c/3e  10.58     16 11c/3e  14.10   <- harder than most of what follows
```

Not a curve, and not a pattern either: level 14 is easier than level 3 and level
16 is harder than the great majority of the levels after it.

Two shapes share each bottle count: 5 colors with 3 empties and 6 colors with 2
empties are both eight bottles and look the same on screen. So levels are grouped
into **bottle-count bands** and each band's levels are filled from the measured
difficulty of the boards that fit that many bottles, whichever shape they wear.

- **A band with many levels** (the fourteen-bottle band holds every level past
  fifteen) sorts boards of the shape its levels already used. It needs
  comfortably more candidates than levels, and not only to absorb the ones too
  expensive to measure: those are disproportionately the *hardest* boards, so
  without slack the top of the curve gets quietly truncated by its own
  measurement cost.
- **A band with few levels** measures a field of every shape it could wear and
  lets the numbers pick.

Every band chose a **two-empty** shape, and kept choosing it after the counting
was corrected, so an empty bottle does cost something. Just nowhere near what the
first version of the measurement claimed.

Small bands are filled in **level order, carrying a floor**, not band by band. A
band can only offer boards of its own bottle count, so a band that starts easier
than the last one ended puts a dip in the curve exactly where the board grows,
which is the moment the game is claiming to get harder. The floor costs a little
accuracy against the target and buys monotonicity.

Candidates are chosen against a **global** target rather than a spread within
their own band. An earlier version did the latter and gave level 8 a board harder
than most twelve-color levels, because every candidate there was hard and being
mid-pool said nothing about how it compared to the rest of the game.

### Three things that did not work

All three are recorded because all three looked obviously right.

**Counting legal moves instead of distinct outcomes.** This one was not a
performance shortcut but a wrong definition, and it is the reason the section
above was rewritten. Three empty bottles offer three legal pours of the same
liquid to the same effect; counted separately, two of them are wrong answers that
nobody could have got wrong. It inflated three-empty boards by up to **ten orders
of magnitude** (level 11 measured 10^-16.1, and 10^-6.5 once corrected) and
produced a confident, entirely false account of the early game as a parity
sawtooth. The lesson is not that the number was imprecise. It is that a metric
can be precise, reproducible, and measuring the wrong thing.

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

|  | shipped order | now |
| --- | --- | --- |
| correlation with level number | 0.15 | **0.96** |
| steps that go down | 62 of 119 | **0 of 119** |
| range | scattered | 10^-2.4 to 10^-16.2 |

Difficulty is **non-decreasing across all 120 levels**, with no dip anywhere. The
shortfall from a correlation of 1.0 is the curve being concave rather than
straight, which is what a difficulty ramp should be.

The measurement is committed to `docs/difficulty.json` and a test asserts it never
goes down. Re-measuring in the test suite would take twenty minutes, so the
alternative was to eyeball it once and hope; a hand-edited order or a
regeneration that quietly made the curve worse now fails a test instead of
reaching a player.

The color count now runs 4, 4, 6, 6, 6, 6, 8, 8, 8, 8, 10, 10, 10, 10, 12 and
then holds, since every band chose a two-empty shape. The odd-color three-empty
shapes are no longer dealt.

## The other axis: bricking

Ordering by measured difficulty answers one question, "how easy is it to miss
par", and for a long time that was taken to be the whole of what makes a board
unkind. It is not, and the difference is what a beta player reported first:
not that a level was hard, but that it kept leaving them with nothing legal to
pour.

A board **bricks** when ordinary play reaches a state with no useful pour left.
Every board is solvable when it is dealt, so this is never an impossible deal; it
is the player painting themselves into a corner. The measurement is
`tools/brick-core.mjs`, reported by `npm run brick`.

**The two axes are independent.** Two twelve-color boards measured at 9.92 and
9.93 slips brick at 42% and 92%. Across the run as it stood, the correlation
between level number and brick rate was **−0.10**: nothing had ever selected for
it, so it drifted free of the curve for 120 levels.

What made that worse than a random nuisance is *where* it drifted. The level that
prompted this bricked in 66% of ordinary playouts, and the fatal pour landed a
median of **four pours before any visible symptom**, up to eleven. A player who
checks three pours ahead still bricked it 45% of the time, so it was not
carelessness and no amount of care would have fixed it. Compare a board whose
trap is one pour deep: the mistake is visible, and one undo takes it back.

### The ceiling

Bricking is only unfair when the player has no answer to it, and the game has
one: the vessel buys an extra bottle, which is exactly the shape of the problem.
An extra empty took the offending board from 68% to 5%. So the ceiling steps with
what the player is holding rather than sitting flat:

| levels | ceiling | what they have |
| --- | --- | --- |
| chapter 1 | 15% | undo, and no idea yet what a wasted empty costs |
| up to the vessel | 25% | undo and hints, no way to make room |
| after | 50% | a rescue they can buy |

The relaxation never comes earlier than the third chapter however early the
vessel is granted. Keying it to the grant alone has a trap in it: moving the
vessel forward to help players through the opening would relax the ceiling over
exactly the boards it was moved forward to protect, and the two changes would
cancel.

`tools/order.mjs` filters candidates on this before the curve chooses among them,
and `tests/brick.test.mjs` fails if a shipped level goes over. The numbers are
committed to `docs/difficulty.json` alongside the difficulty measurement, and the
test re-measures a sample so a stale table is caught rather than trusted.

### Why the shape is not the lever

Fourteen bottles can be 12 colors and 2 empties or 11 colors and 3 empties, and
the second is a near-perfect answer to bricking: **all 40** sampled three-empty
boards came in under 25%, median 2.5%, against a median of 40.5% for the shape
the game deals.

They are unusable, and not for the reason the sifting note below gives. The whole
run spans 2.75 to 21.01 slips, and the one three-empty board at this size cheap
enough to measure came out at **27.68** — harder than level 120. There is nowhere
in the game to put them. The extra empty adds legal pours, most of them wrong,
which is the same fact that makes the board forgiving and makes it brutal to par.

So the big band keeps two empties and picks on the seed instead, over a field
widened six-fold to leave the ceiling something to choose from. The small bands,
levels 1 to 14, can afford three-empty boards and do use them. That is lucky
rather than designed, and it is the right way round: it is where new players are.

### Result

| | before | now |
| --- | --- | --- |
| median brick rate | 33.5% | **21.5%** |
| worst level | 91.5% | **50.0%** |
| levels over ceiling | 27 of 97 | **0** |
| the reported level | 66% | **24%** |
| difficulty dips | 0 of 119 | 0 of 119 |

The curve is untouched: the slips range still tops out at 21.01 and nothing goes
down. The reported level sits at 9.1 slips against the 9.3 it had before, so it
is the same difficulty and a different kind of board.

### The cost of reordering

A level number now deals a different board than it did. `CONFIG.layout` is
stamped into the save and, when it differs, the **cached par** is dropped: it is
a note of how few pours a particular board needed, and that board is gone, so
keeping it would score a level against a bar belonging to a different puzzle.

Everything a player earned stays. Stars, best move counts, gold, how far they
got, and which first-clear bonuses were already paid all survive the bump. That
is a deliberate trade and not an oversight: a best can now sit below the new par
and read as unbeatable, which is worse-looking than clearing the record and far
better than taking away something somebody earned. See
[04 Economy](04-economy.md), and `40-progress.js` where the migration lives.

Bump `CONFIG.layout` whenever `32-order.js` is regenerated, and regenerate the
par table with it. All 120 pars are re-verified as reachable in exactly par, with
none solvable in fewer, by `tools/verify-pars.mjs`.

## Chapters

Levels are grouped into sections of ten with names and tints from `CONFIG`
(`The Cellar`, `The Apothecary`, and so on). Past the named list, sections are
called `Reserve N` rather than running out. Sections are purely presentational:
they change the map's labeling and tint, and nothing about the puzzle. How they
are laid out is [09 The map](09-map.md).

## Where the ceiling is

`maxColors` is 12 and the palette has exactly 12 entries. A thirteenth color
would need a palette entry that stays distinguishable from the other twelve on a
dark shelf, which is a real constraint and is enforced by a test in
[10 Visual system](10-visual-system.md).
