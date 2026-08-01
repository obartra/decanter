# 02 · Levels

What you get dealt, and why level 12 is the same puzzle for everyone forever.

## Deterministic in the level number

`hashSeed(n)` avalanches the level number and seeds a mulberry32 stream, and the
generator draws only from that. There is no stored level data and no wall clock
anywhere in the path.

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

Colours climb by one every two levels from 4 until they cap at 12, so difficulty
rises for the first 17 levels and then plateaus. The empty count is chosen to
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
