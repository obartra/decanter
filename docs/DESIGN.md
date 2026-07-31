# Decanter, design notes

A water sorting puzzle. Bottles hold four units of coloured liquid, stacked.
Pour from one bottle to another until every bottle holds a single colour.
It runs entirely offline, installs to a home screen, and ships no network calls.

---

## 1. Why it looks the way it does

The reference was a mobile puzzle screenshot: glossy glass bottles on a deep
indigo field, flat bands of saturated liquid. The pieces worth keeping were the
glass treatment and the flat colour, so the visual work went into three things.

**Glass.** Each bottle layers a dark tint, an inset rim stroke, a wide specular
stripe down the left at about 5 to 12 percent width, a thinner one at 74 to 80
percent, a shoulder shine, and an outer blue bloom. The gloss layer sits above
the liquid so highlights read across colour boundaries, which is what makes the
bottle feel like a container rather than a coloured rectangle.

**Liquid.** Contiguous units of one colour render as a single band, not four
stacked blocks. Early versions drew one element per unit with a shading
gradient, which left visible seams inside what should be one body of liquid.
Only the topmost band gets a surface highlight.

**The pour.** This is the signature moment, so it carries the most detail:

- The bottle lifts, then tilts in a second motion. One combined move read as a
  slide rather than a lift and tip.
- It stops *beside* the target rather than over it, so the liquid arcs across.
- The stream is an SVG ribbon sampled along a quadratic Bézier, wide at the lip
  and narrowing as it falls. A falling stream narrows under gravity; an earlier
  version widened downward and looked wrong for reasons that were hard to name.
- The leading edge falls over about 190ms rather than appearing at full length.
- A bead of liquid sits on the lip so the stream visibly leaves the bottle
  instead of starting in mid air.
- At the end the tail detaches from the lip and falls away.
- The impact point ripples and tracks the rising surface, and droplets bounce up
  before falling back.

**Corking.** When a bottle fills, a cork plugs it. The plug lives inside the
`.glass` element, which has `overflow: hidden`, so it is genuinely clipped by
the bottle and slides down into the neck. Only the head shows above the rim.
An earlier version floated the whole cork above the bottle and read as a hat.
The seal also fires a light ring, a sheen sweep, a small jolt, and a confetti
burst in the bottle's own colour.

**Sound.** Synthesised with WebAudio, no audio files. The pour is broadband
noise through a highpass, a bandpass, and two peaking filters whose centre
frequencies rise as the receiving bottle fills. That rising resonance is the cue
an ear uses to identify a vessel filling, and adding it did more for realism
than any change to the visuals.

Type is Fraunces for display and Space Grotesk for the interface. Both ship as
latin-subset woff2.

---

## 2. Rules

- Capacity is 4 units per bottle.
- A pour moves the entire top run of one colour, unless the target runs out of
  room first, in which case it moves as much as fits.
- The target must be empty or have a matching colour on top.
- A bottle that is full of one colour is finished and locked.
- The level is solved when every bottle is empty or finished.

`src/js/20-rules.js` holds all of this and touches nothing else. No DOM, no
timers, no state. That is what makes it testable against an independent
implementation.

---

## 3. Par, and why it is trustworthy

Every level shows the minimum number of pours needed to solve it. Stars are
awarded against it: three at or under par, two up to one and a half times par,
one beyond.

The search is A\* over board states.

**Heuristic.** `h = (total contiguous colour segments) - (number of colours)`.

**Why it is admissible.** A pour moves one maximal run. The source loses that
segment only if the whole run moves; the target either merges with a matching
top or starts a new segment. Working the cases through, no single pour can
reduce the total segment count by more than one, and the solved state has
exactly one segment per colour. So the remaining distance is never less than
`h`.

That last step leans on a property of the generator, not of the rules: every
colour is dealt exactly `capacity` units, so every colour finishes in exactly
one bottle. A level that gave some colour two bottles' worth would end with more
segments than colours, `h` would overshoot at the goal, and par could come back
too high. Deal colours in whole bottles, or change `h` to subtract the number of
filled bottles the solved state needs rather than the number of colours.

**Why it is consistent.** Segment count never increases, and drops by at most
one per move, so `h(n) <= 1 + h(n')` for every successor. With a consistent
heuristic and a closed set, A\* returns a true minimum.

**Why not IDA\*.** The first implementation used IDA\* with a transposition
table. Pruning a node by returning a sentinel cost corrupts the next bound,
which can overshoot the optimum and report a number that is too high. A\* with a
bucket queue avoids the problem and profiled faster on real levels.

**Pruning.** Two reductions are applied, and both are state preserving:

1. Empty bottles are interchangeable, so only one is considered as a target.
2. Pouring a uniform bottle into an empty one produces the same multiset of
   bottles, so it is skipped.

Duplicate targets with identical contents are also collapsed. `tests/solver.test.mjs`
checks that none of this changes the answer, by comparing against a brute force
breadth-first search that applies no pruning at all.

**Where par actually comes from.** Not from the browser. `tools/pars.mjs` solves
every level offline with a budget no page load could afford and writes
`src/js/35-pars.js`, which is committed. Levels are deterministic, so par is a
fixed property of a level and there is nothing to rediscover on each visit. A
slow phone and a fast laptop show the same number, and the search never competes
with the animation for a frame.

**The fallback, for levels past the table.** 400,000 expansions or 8 seconds in
a Web Worker, so a long solve never blocks a pour. When Workers are unavailable,
some sandboxed embeds and privacy modes, the solve runs inline against a much
tighter 60,000 and 1.2 seconds.

That tighter budget is not hypothetical. Before the table existed, four of the
first sixty levels ran out of it and fell back to `anySolution()`, whose answer
is whatever depth a depth-first search stumbles into first. Level 38 reported 59
pours against a true minimum of 41. An estimate is shown with a `~` and is never
cached as fact, and it no longer decides stars either: `rate()` takes an `exact`
flag and treats an inexact par as no par at all, because a run that beats an
upper bound has not been shown to match the minimum.

---

## 3a. The economy

Stars are pours against par: par or one over is three, up to four over is two,
solving it at all is one. There is no zero-star finish.

Gold is deliberately thin, because the tension is the point. A good first run
pays 14, a replay of the same level pays 6, a sloppy replay pays 1.

| In | | Out | |
| --- | --- | --- | --- |
| 3★ | 6 | Extra vessel | 45 |
| 2★ | 3 | Undo | 3 free per level, then 8 |
| 1★ | 1 | Restart | free, time is the cost |
| First clear | 8, once | | |
| Daily draught | 12 | | |

The purse opens at 86: one vessel away from broke. Above roughly 150 the
pressure disappears, which is the number to watch when retuning.

Two rules do the real work. The first-clear bonus is paid once ever, so a
cleared level pays stars only and cannot be farmed. And a vessel costs about
three well-played new levels, so the only rescue worth buying has to be funded
on boards you have not solved yet. A player who three-stars everything affords a
vessel roughly every third level; a player scraping one star almost never can,
which pushes them to restart and learn the board instead of buying past it.

**Why a bought vessel caps the run at two stars.** Par is the exact minimum for
the bottles the level deals. Put a seventh on the shelf and the board is strictly
easier than the number being scored against, so a third star would be measuring a
different puzzle. Capping is also what keeps par honest without re-solving the
altered board at runtime, which would drag back the estimate path that
`35-pars.js` exists to remove. Restarting keeps a vessel already paid for, so a
restart cannot launder the purchase back into a clean run.

---

## 3b. The liquid

The contents of every bottle are drawn onto one canvas behind the glass. It is a
mask, not a simulation, which is how liquid in a container is normally done: the
shape of the glass is the clip, and the surface is a horizontal line in world
space. A tipping bottle turns its clip and leaves the line alone, so the liquid
stays level while the glass rotates without that having to be arranged.

For an upright bottle the fill line is arithmetic. For a tipped one the glass is
a rotated quad and the line is still horizontal, so the level is whichever height
leaves the right *area* underneath it, found by bisection: a dozen polygon clips
per band, exact rather than approximated.

Everything follows from the clip. Liquid is only ever drawn through a glass, so
liquid outside a glass is not a state this code can represent.

**What this replaced.** The first attempt ported a particle fluid from the design
study: position-based dynamics, density relaxation, metaballs. It was adapted
from a looping demo that poured one fixed bottle into one fixed neighbour
forever, and it produced, in order, liquid that stayed behind when its bottle
moved, hard-edged slabs where a square clip met a rounded glass, droplets sprayed
across the room, and a rectangle of colour hanging in mid-air. Every one of those
was liquid in flight: liquid that belongs to no container needs its own aim, its
own clip and its own culling, and getting any of the three wrong puts it
somewhere it should never be.

The pour itself is drawn by the scripted ribbon in `70-board.js`, a tapering arc
from lip to target, which is how games draw a pour. The sim animates one number
per bottle: the level.

---

## 4. Levels

Levels are deterministic in their number. `hashSeed(n)` avalanches the level
number, seeds a mulberry32 stream, and the generator draws from that. Level 12
is the same puzzle on every device, forever, which is what makes stars and best
scores on the map mean anything.

Shape:

| | |
| --- | --- |
| colours | `min(4 + floor((level - 1) / 2), 12)` |
| empty bottles | 2 when the colour count is even, 3 when odd |
| bottles | colours + empties, **always even** |

The parity rule is not cosmetic. An even total always factors into two full
rows, so the grid never leaves an orphan bottle dangling in the last row.
The layout pass tries one to four rows, keeps only row counts that divide the
bottle count exactly, and picks whichever yields the largest bottles for the
space available.

Generation shuffles a pool of colours, deals them out, then rejects any board
that starts with a finished bottle or fails a depth-first solvability probe.
Rejected candidates keep drawing from the same seeded stream, so the result
stays deterministic.

---

## 5. The map

Progress is a winding vertical path, level 1 at the bottom.

- Node positions come from `MapGeom.nodes`: `x = centre + sin(i * 0.72) * amplitude`,
  `y = bottom + i * spacing`. The amplitude is clamped against the viewport so
  the path never leaves the column on a narrow phone.
- The path is a Catmull-Rom spline through the node centres converted to cubic
  Béziers, stroked with a dashed line under a gradient that fades to nothing at
  the top.
- Visible levels are everything cleared, the frontier, and `CONFIG.lookahead`
  beyond it. Three further ghost points continue the path into the fade, so the
  route ahead is suggested without being revealed.
- Chapters group ten levels, each with a name and a tint. Names run out after
  six, then continue as "Reserve 1", "Reserve 2", and so on.
- Cleared nodes are filled in the chapter tint and carry their star row. The
  frontier node pulses. Locked nodes are dim and disabled.

Any cleared level can be replayed. Replaying can raise a star rating or a best
score but never lowers either, and never rolls the frontier back.

`MapGeom` is deliberately separated from `MapView` so the geometry can be tested
without a browser.

---

## 6. Input and the move queue

Logic and animation are decoupled. A tap resolves against the logical board
immediately: the move is applied, the counter ticks, and the animation is pushed
onto a queue. A separate runner plays the queue one move at a time against a
*view* copy of the board that trails behind.

The practical effect is that a player can keep tapping through a sequence of
pours without waiting for each bottle to finish tipping. Undo and restart stay
disabled until the queue drains, since the two states are out of step until then.

---

## 7. Offline

- Everything is inlined into one `index.html` at build time: styles, all script
  modules in order, and the solver worker source in a `type="text/js-worker"`
  script tag that becomes a Blob worker at runtime.
- Fonts ship as local woff2. Nothing is fetched from a CDN.
- The service worker precaches a list generated from what actually landed in
  `dist/`, so the list can never drift from reality. Its cache name is a hash of
  the built HTML, so a changed build invalidates the old cache automatically.
- Navigation requests fall back to the cached page, which is what makes a cold
  offline launch work.
- Saved progress degrades gracefully: `localStorage` if it works, an in-memory
  map if it throws, which it does inside some sandboxed embeds.
- A second build output, `decanter-standalone.html`, inlines the fonts as base64
  so a single file can be opened straight off disk. It cannot install, since
  service workers need HTTPS or localhost, but it plays identically.

---

## 8. Layout of the repo

```
src/css/        stylesheets, concatenated in filename order
src/js/         modules, concatenated in filename order, numbered by dependency
src/worker/     the solver, loaded as a Web Worker
src/index.html  template with slots the build fills
assets/         fonts and icons
tools/build.mjs the whole build, no bundler
tools/make-icons.py  generates the icon set
tests/          51 tests, no dependencies
dist/           build output, committed so it can be deployed directly
```

Module numbering encodes load order. Anything under 50 is pure logic with no
browser API in it, which is exactly the set the tests load into a sandbox.

---

## 9. What is tested

| Area | What it checks |
| --- | --- |
| rules | pour amounts, colour matching, locked bottles, liquid conservation, star brackets, and agreement with an independent implementation across 2500 states |
| solver | move generation parity, that pruning never changes the answer, optimality against brute force on ~90 boards, that the heuristic never overestimates, and exact answers at real level sizes |
| levels | determinism, uniqueness, even bottle counts, correct liquid counts, solvability of levels 1 to 40, difficulty curve, chapter naming |
| rng | purity, range, and that adjacent seeds diverge |
| progress | unlocking, score improvement only, frontier stability, corrupted saves, hostile storage |
| map geometry | monotonic climb, staying inside the column on narrow screens, tap spacing, canvas height, lookahead, path validity |
| build | every file present, no external requests, no unfilled slots, bundle parses, embedded solver still correct, valid manifest, precache list matches disk, cache name changes with content |

Run with `npm test`. The build tests read `dist/`, so run `npm run check` to
build and test together.

---

## 10. Known gaps

- Difficulty stops climbing at level 17, where the colour count hits the palette
  cap of 12. Beyond that, levels vary but do not get harder. Capacity, bottle
  count, or a move limit could take over.
- No hint system, and no undo across a queued pour.
- Par is computed on demand and cached per level. A precomputed table shipped
  with the app would remove the brief `…` on first play of a level.
- Chapters are cosmetic. They gate nothing.
- No portrait/landscape variants beyond the responsive grid.
