# 17 · The Cellar Door

A sliding-block puzzle at `/casks/`. A six-by-six cellar floor is crowded with
casks. Each one is two or three cells long, lies flat, and slides only along its
own length. One is gilt, lies on the exit row, and has to reach the door in the
east wall.

It is a standalone page, exactly as `/bubble/` and `/measure/` were when they
were first added, and it is deliberately not wired into the graded run: nothing
in `src/js/` may name anything in `src/casks/js/`, and a reference either way is
a lint error.

## The rules

- A cask is pinned to one axis. A horizontal one has a row and slides along it; a
  vertical one has a column and slides along that.
- It slides **any distance**, stopped by another cask or by a wall. It cannot
  turn, and it cannot pass through anything.
- The board is open when the gilt cask's far end reaches the east wall.

**One move is one move whatever it carries.** A four-cell shove and a one-cell
nudge both cost exactly one, exactly as a pour does in
[01 Puzzle](01-puzzle.md). That is what makes par a measure of thinking rather
than of clicking: if distance counted, a board would be graded on how neatly the
player happened to break one shove into two, and a line of fifteen decisions
would score worse than the same line taken in twenty timid steps.

A move is therefore `{cask, to}` and carries no distance at all, which is the
cheapest possible way of making it impossible to charge for one.

### The board cannot be lost

Sliding is reversible: the cells a cask passed over are exactly the ones it now
covers or has just vacated, so nothing can have moved in behind it. Every move
can be taken back as a move, so from any reachable position the opening position
is reachable again. If the door could ever be opened, it still can.

So there is no failure to grade. A run cannot be lost, only made longer than it
needed to be, which is why the distance from the minimum is the whole story of
how it went — and why the panel here has no losing tint, unlike the bubble
game's.

## Generating backwards, which is the whole trick

That same reversibility is what makes this game affordable to generate, and it is
worth setting out plainly because the obvious approach is much worse.

**The move graph is undirected.** So one multi-source breadth-first sweep outward
from every state in which the gilt cask is already at the door gives the exact
distance to the door for *every* state in a layout's reachable component, in one
search. Two things fall out of that:

- Par for any start in that layout is a lookup rather than a search.
- The state **furthest** from the door is provably the hardest start that layout
  can offer. Not the hardest found — the hardest there is.

Generation is therefore one sweep per layout, and it returns the best board that
layout contains rather than the first acceptable one.

### What was tried first

**Rejection sampling.** Deal a board, solve it, keep it if par clears a bar,
otherwise deal another. About three seconds a board and a ceiling of **par 19**,
because it can only ever return the first acceptable board, and the field it is
sampling from is mostly trivial to begin with. Abandoned.

**The backward sweep, done naively.** Correct, and the right idea, but it
re-derived the geometry on every visit: once to walk the component and again to
sweep it, rebuilding the occupancy grid and every cask's run each time.
`CasksSearch.component` now keeps the neighbour lists it built while walking and
the sweep reuses them, and states are keyed with `String.fromCharCode` rather
than a joined string. The same field went from unmeasurable to a few minutes.

### What the measurement found

**Random layouts are mostly trivial.** Median par is three to six. So the field
is drawn deliberately rather than uniformly.

**Dense floors are where the interesting boards live**, and they are cheaper to
measure as well — less room to move means a smaller reachable component — so the
field is weighted toward ten to thirteen casks. `tools/casks-field.mjs` draws
from a spread of densities and two shares of three-cell casks, because a floor of
short casks is a different room from one with long obstructions in it.

**A second horizontal cask on the exit row is never dealt.** It can wall the gilt
cask in from the far side, which does not make a board hard, it makes it
unsolvable. `CasksRules.wellFormed` says so where a test can read it.

**The component cap is what the run costs.** At 40,000 states about half the
draws tripped it anyway, at roughly 47ms a layout; at 24,000 rather more do, at
roughly 33ms. Dropping a layout early is far cheaper than measuring it, so the
lower cap is paid for twice over, and what it gives up is the open floors — which
are the ones with nothing in them. Layouts above the cap are not measured badly,
they are dropped: the sweep only ever answers about a component it walked in
full.

## The boards are a shipped table, not a seed

This is the structural difference from [16 The Measure](16-measure.md), and the
reason is **cost, not principle**.

Over there a level is `[vessels, seed]` and `MeasureLevels.fromSeed` turns it
back into a bench: any seed at all produces a real board, so the generator is a
shuffle and the level table only records which seeds were worth playing. Here a
random scattering of casks is overwhelmingly likely to be trivial, and finding
out costs a sweep of the layout's entire reachable component — thousands of
states on a crowded floor, tens of thousands on an open one. Dealing from a seed
in the page would mean either handing out whatever the seed produced, which is
usually nothing, or running that sweep on every deal, which is a visible stall on
the device least able to afford it and would still only report that the board was
not worth dealing.

So `tools/casks-field.mjs` writes **both** committed tables in one pass from one
measurement: `32-boards.js` is the floor of every level, four characters per cask,
and `35-pars.js` is its exact minimum. **Par is never recomputed in the page.** A
slow phone and a fast laptop show the same number, and the number they show is
the one the levels were actually chosen against.

`25-search.js` is still in the bundle, because the hint needs it — but a hint is
asked for, where a deal is not.

Past the end of the table there is no board, and `CasksLevels.make` returns
`null` rather than improvising one. The measure can hand over an unmeasured bench
because dealing one is free and most of them are at least playable; anything
invented here would be a layout nobody swept, very likely worth three moves and
possibly with no way out at all. The last floor says so and offers the first one
again.

## Why this is graded by exact par, where the bubble game is not

The bubble game's `45-score.js` says why it grades against a measured
distribution: *"the next bubble is dealt at random, so the board is not perfect
information, and the aim discretises to about thirty landing cells across a run
of thirty-odd shots. There is nothing to search."* That is a real claim about a
real thing.

**None of it applies here, and the next reader will assume it does**, because the
three games sit in one repository with the same shape of score module. So,
plainly:

A cellar floor is **perfect information**. Every cask is on the board at the
deal, nothing is dealt afterwards, nothing is hidden, and there is no randomness
anywhere in play — the same level is the same board for everybody, forever. The
whole reachable state space is a few thousand positions and `25-search.js` walks
all of it. The minimum is not estimated, sampled or set at a percentile: it is
found by an exhaustive sweep, committed beside the board it belongs to, and a run
is graded by its distance from it. A distribution would be the wrong instrument
entirely — it would grade the player against other players' luck on a board where
there is no luck.

The search needs none of [03 Par](03-par.md)'s machinery — no A\*, no admissible
heuristic, no bucket queue, and no argument about why the bound holds — for the
same reason. There is no heuristic to be right about.

## Where the inversion is

`src/js/20-rules.js` `rate()` returns **full marks** when par is null or inexact.
`CasksScore.stars()` returns **zero stars**. Exactly the other way round, and on
purpose:

| | pour game | the cellar door |
| --- | --- | --- |
| unknown par | 3 stars | **0 stars** |
| the page shows | `~par`, and the frontier is clamped | **`unrated`** |
| why | an estimate is an upper bound, and scoring one could *fail* a run for the search's shortcomings | boards and pars ship out of one measurement, so a missing par means the two tables have come apart |
| what it costs | levels past the table would pay 3 stars forever, so progression is clamped | somebody sees "unrated", which is true |

The pour game's default is right *there*: its search can genuinely run out of
budget, an inexact par is an upper bound rather than a minimum, and given a
choice between two wrongs it takes the generous one — then clamps the graded game
to the length of its par table so the generous path is never reached in normal
play. See [03 Par](03-par.md).

Here there is **no economy**, so nothing is minted by being strict. Par is not an
estimate that might be a little high; it is a lookup in a table written by a
sweep that visited every reachable position. And most of all, three stars means
*this run matched the minimum*; awarding it when the minimum is unknown is the
program stating, as emphatically as it can, something it does not know.

### Where "unknown" actually happens

Not past the end of the table, as it would be over in the pour game, and not on
an unvetted board, as it is in the measure. There is no board here without a par:
the two tables are written by one tool in one pass from one measurement.

So an unrated floor means those two tables have **come apart** — a regenerated
`32-boards.js` committed without its `35-pars.js`, most likely. That is a broken
checkout rather than an ordinary event, which is exactly why full marks would be
the wrong default: it would turn a broken pair of tables into a game that pays
three stars on every level and looks entirely healthy while doing it. The board
is still dealt and still playable, because an ungraded floor here costs nothing
and taking it away would be taking away a puzzle for the sake of a scoreboard
that does not exist.

## Stars, and what a tool costs

Par earns three, one over earns two, two over earns one, three or more earns
nothing — the same brackets as [04 Economy](04-economy.md) and the measure,
because all three games are graded against an exact minimum and one move over par
should not be worth different things in three rooms of the same cellar.

**Undo and hint both cap the run at two stars**, exactly as in the measure and
unlike the bubble game. On a perfect information board with a known minimum, an
unlimited free undo is not an aid, it is a solver: shove things about, take back
whatever did not work, hand yourself the optimal line. The hint is worse, because
it simply names the next move of it.

The board is **not locked** when the count of scoring moves runs out, for the
reason the measure gives: nothing was paid, undo is right there, and locking a
perfect information puzzle at the moment somebody is working it out would be
taking the board away for no reason.

## The curve

Measured over 20,000 layouts, 8,479 distinct boards survived, spanning **par 1 to
42**. Sixty levels are drawn from them, across 33 distinct values, with **0 of 59
steps going down**:

```
1 1 2 2 3 3 4 4 5 5 6 6 7 7 8 8 9 9 10 10 11 11 12 12 13 13 14 14 15 15
16 16 17 17 18 18 19 19 20 20 21 21 22 22 23 23 24 24 25 25 26 26 27 27
28 30 31 32 33 42
```

The tail is thin because the field is: there are three boards at par 25 and one
at 42. That is why the last five levels are one board each rather than two, and
why the jump from 33 to 42 is left in — it is the hardest floor the measurement
found, and holding it back to keep the steps even would be holding back the best
board in the cellar to flatter the shape of a graph.

Level numbers are handed out along the sorted pars, so the curve is
non-decreasing **by construction** rather than by luck. Within a par the
narrowest line comes first — `tight` is the average share of the moves at a step
that are correct, so a low `tight` is a board where most of what you could do is
wrong — with `choice` breaking the tie and the number of casks breaking that.
That last key exists for the short boards: at par one there are dozens tied on
the first two, and without it level one was a floor of fourteen casks
demonstrating a single slide.

Par one is kept deliberately. A board whose answer is "push the gilt cask to the
door" is not a puzzle, but it is the one board that teaches the control, and
there is nowhere better than level one to put it.

A test re-solves every level from the shipped table, walks each published line to
check it really opens the door, checks that par minus one move does not, and
asserts the curve never falls.

## Drawing it

The room has **one lamp in it, and the lamp is the doorway**. That is the whole
lighting model and it decides everything else: flagstones are brighter the nearer
they are to the gap in the east wall, every cask throws its shadow away from it,
and the light spilling back into the room brightens as the gilt cask approaches,
so the reward for the last move is the room itself rather than a caption.
Lighting from above instead would say there is a window, and a cellar with a
window is a different room.

Two things have to be legible at a glance and everything else serves them:

- **Which cask is the gilt one.** Colour — the same two golds the wordmark and
  the stars use. It is the only object in the room that is not brown, which is
  why it needs no label.
- **Which way each cask can go.** The staves run *along* a cask's length and the
  hoops cross it, so its axis is readable from the grain rather than only from
  its shape. That matters for the two-cell casks, where the rectangle is nearly
  square and its aspect says almost nothing. The hoop count also gives the length
  away: two hoops on a two-cell cask, three on a three-cell one.

The floor is drawn cell by cell rather than as one fill under a gradient, because
the joints have to fall on the cell boundaries. The grid is what the player is
reasoning about, and a floor whose seams did not line up with it would be
actively lying about the puzzle.

The world is square plus its walls and never stretches to fill the screen. On a
tall phone there is air above and below, which is correct: oblong flagstones
would make a cask's length ambiguous at a glance.

There is exactly one world-to-pixel transform, in `60-view.js`, which also owns
where each cask sits and which flagstone a point is on — because the renderer
draws a cask where that says it is and the input decides what was grabbed from
the same numbers. A hit test with its own idea of where a cask is gives the worst
bug a game played by touching things can have: the one where the touch works,
just not on the thing under your finger.

### The input, and why it is not two taps

The measure takes two taps and refuses a drag, and gives good reasons: a drag has
to be tracked, can be cancelled halfway, and fights the browser's own gestures on
a phone. Every one of those is still true here, and this game takes the drag
anyway.

A pour is an abstract relation between two vessels and the hand never touches the
wine. A cask is an object being shoved across a floor, and **the move is the
gesture**. Refusing the drag would mean the one thing a player can do to a
physical object in front of them is the one thing the interface does not accept.

So both: press and push, and it goes as far as you push it; or tap it and tap
where it should end up, for the same move without the dexterity. Both go through
one `play()`, so there is one turn and not two.

A cask **can never be put on a cell it could not have slid through**. That is one
function, `CasksRules.runOf`, which walks outward one cell at a time and stops at
the first obstruction — a version that merely tested whether the destination
cells were empty would let a cask jump the thing in front of it into the space
beyond. The drag is clamped to that run, the tap-then-tap destination is checked
against it, and the run is *drawn* on the floor while a cask is in hand, because
a game with an exact answer should show it rather than refuse a move afterwards.

The drag is allowed to be drawn a fraction of a cell past the stop and spring
back. A cask that freezes solid under a moving finger reads as the game having
lost the touch; the state never goes there.

## Layout

| Path | |
| --- | --- |
| `src/casks/js/` | modules, concatenated in filename order. Under 50 is pure logic, 50 and above is browser code |
| `src/casks/css/00-base.css` | the one stylesheet; every class is prefixed `csk` |
| `src/casks/js/32-boards.js` | generated, committed: the floor of every level |
| `src/casks/js/35-pars.js` | generated, committed: the exact minimum, and where the cellar ends |
| `tools/casks-field.mjs` | measures the field offline and writes both of the above |
| `tests/casks.test.mjs` | the rules, the sweep against a hand-worked par, every shipped board, and the scorer |
