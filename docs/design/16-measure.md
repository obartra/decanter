# 16 · The Measure

A decanting puzzle at `/measure/`. Vessels of unequal, distinct capacity stand on
a shelf. The largest starts full of wine and the rest are empty. The only thing
you can do is pour one into another. Get any vessel to hold exactly the target.

It is a standalone page, exactly as `/bubble/` was when it was first added, and
it is deliberately not wired into the graded run: nothing in `src/js/` may name
anything in `src/measure/js/`, and a reference either way is a lint error.

## The rules

- A pour moves `min(amount[i], caps[j] - amount[j])` — **all of it, always**.
  There is no partial pour to choose, so a move is a pair of vessels and nothing
  else.
- **There is no tap and no drain.** Wine cannot be conjured and it is certainly
  not poured away, so the total is conserved and equals the largest capacity.
- The board is solved when **any** vessel holds the target exactly.

**One move is one move whatever it carries.** Emptying a full demijohn into a
carafe and trickling one unit into a thimble both cost one, exactly as a pour
does in [01 Puzzle](01-puzzle.md). That is what makes par a measure of thinking
rather than of tapping.

### The board cannot be lost

This falls out of the rules and it decides everything downstream, so it is worth
proving here rather than discovering later.

The total equals the largest capacity, because that vessel started full. So from
**any** position, pouring every other vessel into the largest one moves all of
each — the room left in the largest is exactly the sum of what is in the others —
and lands back on the opening position in at most `n − 1` pours. Every position
can therefore reach everything the opening one could. If the target was ever
reachable, it still is.

A sweep of the whole field agrees: over six thousand solvable boards, the
fraction of reachable positions from which the target cannot be reached is zero
on every single one. `MeasureSearch.survey` reports it and a test asserts it,
because a future rule change — a drain, or wine starting somewhere other than the
largest vessel — is exactly what would quietly break it.

So there is no failure to grade. A run cannot be lost, only made longer than it
needed to be, which is why the distance from the minimum is the whole story of
how it went.

## Why this is graded by exact par, where the bubble game is not

The bubble game's `45-score.js` says why it grades against a measured
distribution: *"the next bubble is dealt at random, so the board is not perfect
information, and the aim discretises to about thirty landing cells across a run
of thirty-odd shots. There is nothing to search."* That is a real claim about a
real thing.

**None of it applies here, and the next reader will assume it does**, because the
two games sit in one repository with the same shape of score module. So, plainly:

This board is **perfect information**. Nothing is dealt after the opening, nothing
is hidden, and the whole reachable state space is a few thousand positions. Total
volume is conserved, so a position is a way of splitting one number into three or
four bounded parts, and a plain breadth-first search walks all of it in about a
millisecond. The minimum is not estimated, sampled, or set at a percentile. It is
found, committed to `35-pars.js`, and a run is graded by its distance from it.

A distribution would be the wrong instrument entirely: it would grade the player
against other players' luck on a board where there is no luck.

The search needs none of [03 Par](03-par.md)'s machinery — no A\*, no admissible
heuristic, no bucket queue, and no argument about why the bound holds — for the
same reason. There is no heuristic to be right about.

## Where the inversion is

`src/js/pure/20-rules.js` `rate()` returns **full marks** when par is null or inexact.
`MeasureScore.stars()` returns **zero stars**. Exactly the other way round, and
on purpose:

| | pour game | the measure |
| --- | --- | --- |
| unknown par | 3 stars | **0 stars** |
| the page shows | `~par`, and the frontier is clamped | **`unrated`** |
| why | an estimate is an upper bound, and scoring one could *fail* a run for the search's shortcomings | par is exact or something is wrong, and three stars asserts a minimum nobody computed |
| what it costs | levels past the table would pay 3 stars forever, so progression is clamped | somebody sees "unrated", which is true |

The pour game's default is right *there*: its search can genuinely run out of
budget, an inexact par is an upper bound rather than a minimum, and given a
choice between two wrongs it takes the generous one — then clamps the graded game
to the length of its par table so the generous path is never reached in normal
play. See [03 Par](03-par.md).

Here there is **no economy**, so nothing is minted by being strict. A failed
search is not an ordinary event but a sign of a broken board. And most of all,
three stars means *this run matched the minimum*; awarding it when the minimum is
unknown is the program stating, as emphatically as it can, something it does not
know.

### Where "unknown" actually happens

Not past the end of the table, as it would be over there. A bench past the table
is still solved **exactly** in the browser, because the whole state space fits in
a millisecond, and an exhaustive answer is the minimum whoever computed it. So it
is graded normally. It is simply an unvetted bench: some are trivial. Measured
over the five hundred levels after the table, pars there run **1 to 15** with a
median of 3, where the table ends at 20.

Par is unknown in two cases, and the first is common:

- **The target cannot be reached at all.** This used to be about one bench in
  eight past the table, because `fromSeed` picks a target from every amount below
  the largest capacity and a good many of those cannot be poured to. Those benches
  were dealt and then announced as unplayable the moment they appeared, which is a
  strange thing to hand somebody who pressed Next. `make()` now walks the seed
  until the bench is solvable — the search is exhaustive and costs under a
  millisecond — so it is **0 of the 500** benches after the table, and reaching
  this state at all means sixty seeds in a row failed. The run scores nothing and the page
  says *"No sequence of pours puts N in any of these vessels."* This is the
  concrete reason the inversion matters: with the pour game's default copied
  across, a bench that **cannot be finished by anybody** would pay three stars.
- **The search tripwire fires**, which means something is wrong rather than that
  a board was hard. The page reads `unrated` where par would be and scores
  nothing.

The board is still dealt and still playable in both cases, because unlike over
there an ungraded bench here costs nothing, and taking it away would be taking
away a puzzle for the sake of a scoreboard that does not exist.

## Stars, and what a tool costs

Par earns three, one over earns two, two over earns one, three or more earns
nothing — the same brackets as [04 Economy](04-economy.md), because both games
are graded against an exact minimum and one over par should not be worth
different things in two rooms of the same cellar.

**Undo and hint both cap the run at two stars**, which is where this parts company
with the bubble game. There, undo and hint are free because taking an optimal
move is what earns stars anyway and neither changes what the board deals. Here
the board is perfect information with a known minimum, so an unlimited free undo
is not an aid, it is a solver: walk the tree, take back what did not work, hand
yourself the optimal line. The hint is worse, because it simply names it. The
pour game charges gold for both; this page has no purse, so a run that used one
pays in the only currency it has.

The board is **not locked** when the count of scoring pours runs out. Over there a
run past par + 2 ends because a board dealt costs gold and failing has to have a
price. Here nothing was paid, undo is right there, and locking a perfect
information puzzle at the moment somebody is about to work it out would be taking
the board away for no reason. It counts down, reaches nothing, and play carries
on unrated.

## Generating the levels

`tools/measure-field.mjs` measures the field and writes **both** committed tables,
`32-order.js` and `35-pars.js`, in one pass from one measurement. The pour game
splits this across `tools/order.mjs` and `tools/pars.mjs` because difficulty there
costs minutes and par costs milliseconds; here a whole board costs about a
millisecond and par falls out of the same sweep. Splitting it would mean writing
two tables from two measurements, which is precisely how that game's par table
and ordering once came to disagree about what a level even was.

A level is `[vessels, seed]`, which `MeasureLevels.fromSeed` turns back into
capacities and a target. A level is a pure function of its number, so par is a
fixed property and there is nothing to rediscover on each visit.

### What the measurement found

**Never two vessels.** In the earlier variant that had a tap and a drain,
two-vessel boards scored a `choice` of exactly zero right across the field: every
step of every optimal line had one move that kept par reachable, so a par of
fourteen was fourteen turns of a handle rather than fourteen decisions. In the
pour-only variant that actually ships it is worse — it collapses. A two-vessel
bench has **at most two reachable positions**: tip the large one into the small
one, and tip it back. There is nowhere else for the wine to be. Measured over
every two-vessel bench up to capacity 24, the longest par in existence is **one**.

**More vessels is easier, not harder.** Every extra vessel is another route to the
target, so par *falls* as the count rises. The count is not a difficulty knob and
is not used as one; the board does not grow with the level number the way the
pour game's does, because growing it would be a difficulty curve pointing
downhill. Difficulty comes from the capacities.

**The ceiling was the problem, not the mechanic.** Measured to a capacity of 16,
three-vessel boards averaged a `choice` of 0.04 and four-vessel boards 0.21, and
par topped out at 12. Long lines need a large vessel against small ones and 16
leaves no room for the ratio. Re-measured to 24, the field reaches par 20.

**Selected on par *and* choice, never par alone.** `choice` is the fraction of
steps along one optimal line at which more than one distinct next position keeps
par reachable. Sorting the field by par and taking a spread produces a curve full
of two-pour boards with one line through them. Boards are grouped by par, sorted
within a par by `tight` (the average share of the options at a step that are
correct, so a low `tight` is a narrow line), and the level numbers are handed out
along the sorted pars — so the curve is non-decreasing **by construction** rather
than by luck.

**Three vessels was offered and declined.** The generator may deal three or four
and the measurement chose four every time: only 42 of the 5,523 qualifying boards
had three vessels, which is the two-vessel finding one notch weaker. Three is
left in the field rather than removed, so that the choice keeps being made by
measurement.

### The curve

Forty levels, par **3 → 20**, across 15 distinct values, with **0 of 39 steps
going down**:

```
3 3 3 4 4 4 5 5 5 6 6 6 7 7 7 8 8 8 9 9 9 10 10 10
11 11 11 12 12 12 13 13 14 14 15 15 16 16 16 20
```

A test re-solves every level from the generator and fails if the committed table
disagrees, walks each published line to check it really finishes the board, and
asserts the curve never falls.

## The canonical key, and the one thing not to copy

`amount.join(',')`, **in vessel order, not sorted**.

The pour game sorts before comparing (`Rules.keyOf`, and `keyOf` in
`src/worker/solver.js`) because its bottles are interchangeable: two bottles
holding the same stack are one position, so sorting collapses states that really
are one and the search gets smaller for free.

Here the vessels are **not** interchangeable, because their capacities differ. On
a bench of `[8, 5, 3]`, holding `[0, 3, 0]` and holding `[0, 0, 3]` are different
positions with different futures — from the first you can pour into the three,
from the second you cannot. Sorting would call them the same, the search would
skip one having seen the other, and **par would come back shorter than the
truth**: a number nobody can achieve, published as a minimum, on a board that
looks entirely normal.

This is the single most likely thing for the next reader to bring across by
reflex, so it is written down in `20-rules.js` as well as here, and a test asserts
that the two positions above are told apart.

### Distinct outcomes, and a reduction that turned out to be an identity

Difficulty in this repository is stated in **distinct outcomes, not legal moves** —
see [02 Levels](02-levels.md) for what counting legal moves cost the pour game.
`MeasureRules.outcomes` applies the reduction, and here it never collapses
anything and cannot: a pour changes exactly the two vessels it names, so two
different ordered pairs always disagree somewhere. Checked as well as argued, over
nine thousand positions reached by real play, the count never once differed.

The reason is the unsorted key. The other game's reduction bites precisely
*because* its key is sorted. It is kept anyway, because it is the definition the
difficulty numbers are stated in, and because it is the function that would have
to do the collapsing the day this game grows an operation reaching one position
two ways — a tap, a drain, a half-pour.

## Drawing it

The picture is **one horizontal line**.

Every vessel stands on the same shelf and **one unit of wine is one unit tall in
all of them**, so the target is a single straight rule across a bench of wildly
different glass and every vessel's distance from it can be read at a glance
without arithmetic. Draw each vessel normalised to its own capacity instead and
that line fragments into four unrelated marks, and the puzzle stops being visible.

The consequence is deliberate: **vessels are all the same width** and differ only
in height. If they differed in width, equal heights would not be equal volumes and
the line would be a lie. A three-unit vessel really does look like a stub beside a
twenty-four unit one, and it should.

Graduations are etched one per unit with a heavier mark every fifth, coming in
from the left wall only — a full-width rule at every unit turns a tall vessel into
a ladder and hides the wine behind it. The target line is dashed until some vessel
actually holds it, because a solid gold rule through glass reads as something *in*
the glass, and the target is a level rather than a substance.

There is exactly one world-to-pixel transform, in `60-view.js`, which also owns
where each vessel stands — because the renderer draws a vessel where that says it
is and the input decides what was tapped from the same numbers. A hit test with
its own idea of where the glass is gives the worst possible bug in a game played
entirely by tapping: the one where the tap works, just not on the thing under
your finger.

A board's world is only as tall as its own largest vessel. Within a board the unit
is constant, which is the invariant that matters; across boards it is not, and
holding it constant would draw a bench of eights as a third of a screen of
nothing.

### The pour

The board reaches its final state the instant a pour is applied, before anything
is animated, and the animation is handed the position it started from. A slow
frame or a backgrounded tab therefore cannot leave the glass and the state
disagreeing — which in a game played by reading levels off glass is not a
cosmetic bug but a lie about the puzzle.

The source **rises** off the shelf rather than tilting. Tilting was tried: a
tilted vessel has to keep its liquid surface horizontal, which means clipping a
rotated glass against an unrotated plane, and at the size a phone draws a
four-unit vessel it read as a rendering fault rather than as a pour. Lifting it
and running a stream out of it says the same thing, keeps every surface level, and
leaves the graduations readable throughout — which matters, because they are what
the player is watching.

Two taps make a pour, one to take a vessel in hand and one to say where it goes.
Not a drag: a drag has to be tracked, can be cancelled halfway, fights the
browser's own gestures on a phone, and hides the vessel in hand between the two
decisions.

## Layout

| Path | |
| --- | --- |
| `src/measure/js/` | modules, concatenated in filename order. Under 50 is pure logic, 50 and above is browser code |
| `src/measure/css/00-base.css` | the one stylesheet; every class is prefixed `msr` |
| `src/measure/js/pure/32-order.js` | generated, committed: `level: [vessels, seed]` |
| `src/measure/js/pure/35-pars.js` | generated, committed: the exact minimum, and where the table ends |
| `tools/measure-field.mjs` | measures the field offline and writes both of the above |
| `tests/measure.test.mjs` | the rules, the search against a hand-worked par, the deal, and the scorer |
