# Proposal · The explosion

Not shipped. This is an exploration of a tool that would exist in both games:
one that destroys part of the board rather than adding to it. It is written to
make the strongest case for the idea and then to name, honestly, what the idea
costs and where it does not work as stated.

Nothing in `docs/design/` describes this. That index owns what the game does;
this owns an argument about what it could do.

## What is proposed

A tool, unlocked late and priced dearly, that in the pour game **destroys one
bottle** — once per run, and the run is capped at two stars — and in the bubble
game **clears everything within one cell of where the shot lands**.

## The case for it

### The architecture already has the slot

The chapters file says, in its own words, that every grant in it is outside the
rules of the board, and that "the expensive kind of variety, a rule that changes
what a pour can do, is a separate decision with a much larger bill attached."
That reads as a wall around this proposal. It is not one, and the counterexample
is sitting in the same file.

The vessel changes the board. It puts a seventh bottle on a shelf that was dealt
six, and it plainly changes how few pours the board can be finished in. What the
chapter grants is not the extra bottle; it is *the ability to buy one*. The
purchase is what changes the board, and the purchase pays for it with the third
star.

So the pattern is already three-layered, and already written down:

- **A chapter grants access.** Free, permanent, outside the rules.
- **A purchase changes the board.** Priced in gold, at the moment of use.
- **A board-changing purchase costs the third star**, because par describes the
  bottles the level dealt and a changed board is not that puzzle any more.

The explosion is the vessel's mirror image and fits the same three layers
without inventing a fourth. The vessel gives you somewhere to put liquid; the
explosion takes away liquid you have nowhere to put. Both are rescues, both are
once per run, both are capped at two stars for the same reason and by the same
sentence already written in `20-rules.js`.

### The back half of the game hands over nothing

`CHAPTERS` has six entries. `CONFIG.sectionNames` has six names. `LAST_LEVEL` is
120 and `sectionSize` is 10, so the game has **twelve** chapters. Sections six
through eleven — levels 61 to 120, half the game — are called "Reserve 1"
through "Reserve 6", show no chapter card, and grant nothing. `perksFor` clamps
at index five, so the player who reaches level 61 has every tool they will ever
have, with fifty-nine boards left.

That is the exact failure the chapters file was written to prevent: "Handing
them over a chapter at a time gives it somewhere to go." It goes somewhere for
sixty levels and then stops.

The machinery for a seventh chapter needs no changes. `perksFor` clamps to
`CHAPTERS.length - 1`, so a seventh entry extends it. `sectionName` falls back to
"Reserve N" only past `sectionNames.length`, so a seventh name moves the fallback
along. `sectionTint` already wraps. Adding a chapter is adding two array entries
and a `case` — and the explosion is a better thing to put in it than another
discount.

The Furnace, for what it's worth. Section seven, level 61.

### It is the first tool designed for both games

The four bubble tools are the pour game's tools mapped across: undo is undo, hint
is hint, swap is a second undo, and picking a colour "is the extra bottle of this
game." The mapping is stated in three files and it holds, but every one of those
tools was designed for the pour game first and fitted afterwards.

A tool that destroys a region is native to a bubble shooter and native to a
water-sort. It is the first one that would arrive designed for both, which is
the difference between a game with a second mode and a game with two games in it.

## The bill

The expensive parts of this codebase are all bought at **deal** time. Par is
solved offline for 120 boards. The level order is derived from measured
difficulty against those pars. The bubble star thresholds are p10/p50/p90 of a
few hundred bot runs. A change to what a board *is* invalidates all of it and
means re-solving the game.

The explosion happens at **run** time, where the vessel already lives. So:

**Not paid.** No par recomputed. No level order regenerated. `CONFIG.layout`
untouched, so no save loses its cached pars. `npm run verify:pars` unaffected.
And on the bubble side — this is the good one — **the measured thresholds do not
need re-measuring**, because `bubble-survival.mjs` measures unaided play and an
aided run is capped at two stars before it can ever be graded against the third.
`BubbleScore.stars` already applies that cap after the cleared-pays-three rule,
and there is already a test for it. The blast is absorbed by machinery that
exists.

**Paid.** One rule in `20-rules.js` (below, and it is the real cost). A clause in
`01-puzzle.md`. A seventh chapter. A price and an invariant in `04-economy.md`. A
button in each game's tool row, a branch in each game's turn, and the panel
offer. Tests for all of it.

**Watch.** `dist/index.html` is 294,961 bytes against a 315,000 budget. This
feature ships into both games on that one page. At this repo's comment density
it is plausibly six to ten kilobytes, which is half the headroom left. It fits.
It is the last thing that fits comfortably.

## Where it does not work as stated

### Four units of a colour are a set

`isSolved` asks that every bottle be empty or hold four of one colour. Four is
not an incident of the deal, it is the win condition.

Destroy a bottle holding `[red, blue, red, green]` and two reds are gone from the
world. Red can never make four. **The board can never be solved again** — and
nothing says so. `lostBecause` knows two endings, `stuck` (no legal moves) and
`short` (the lower bound on the work left exceeds the pours left), and an
unwinnable-but-not-stuck board is neither. `minPours` still returns a number the
player is under. So the run does not end. It carries on, taking pours against a
board that cannot be finished, until the count runs out and it fails.

A tool that is bought to save a run and silently makes it impossible is the worst
version of the bug `15-diagnostics.md` exists to answer. This has to be fixed
before anything else about the feature is worth discussing.

Three ways out:

**Spill it.** A colour that lost units no longer needs four. `isSolved` gains an
optional set of spilled colours, and a bottle counts as done if it is empty, or
full, or uniform and spilled. That is one function and one optional argument that
defaults to today's behaviour. `minPours` is unaffected: `segments − colours` is
still a valid and still tight lower bound, because a spilled colour scattered
across two bottles still costs the pour that joins them. `canPour` and `isFull`
are untouched, so nothing about pouring changes. The solver never sees it, because
par belongs to the board as dealt and `SolverClient.solve` clones the tubes on the
way out. **This is the recommendation.** The blast destroys liquid, the game
stops asking for what it destroyed, and the player still has to tidy up what is
left — so the explosion buys pours rather than handing over the level.

**Purge instead.** Take the colour on top of the chosen bottle *off the whole
board* — all four units, wherever they are. Every remaining colour still has its
four, so `isSolved`, `isFull` and `minPours` need no changes at all. Zero rules
cost, and it is teachable in one line: pick a colour and it leaves the game. It is
a different feature from the one proposed and a stronger one, and it is the
version to take if the bill for spilling is judged too high.

**Restrict the target.** Only offer bottles whose destruction strands nothing.
There are almost never any, so the tool is a button that is usually dead. Rejected
on the grounds that dead taps are this project's named enemy.

### A rescue in the tool row arrives after the run is over

A run "ends the moment it is lost, rather than being played out for nothing."
`checkLost` sets `S.over` and never unsets it. So by the time the game has told
the player they need rescuing, the tool row is gone.

The vessel has this problem too. It is sold as the answer to "a board leaves you
nowhere to put anything", and *nowhere to put anything* is `stuck`, which ends the
run instantly. So the vessel must be bought before the situation it is for, on a
read of the board rather than on a verdict — which is a real skill and also a real
reason the button goes unpressed.

The explosion should not inherit that. It belongs on the **failure panel**:

> **Failed.** What is left needs more pours than the run had.
> [ Try again · 5 ]  [ Blow one up · 60 ]  [ Pay past · 10 ]

And it should only be offered where it works. That is checkable rather than
guessable: for each bottle, apply the explosion to a copy and ask `lostBecause`
again; offer the button only if some target brings the board back alive. A tool
that is offered exactly when it will help, and absent otherwise, is the shape
`45-panel.js` exists for — that file is pure, so all of it can simply be asserted
rather than reached by playing a level in a browser.

This is also the answer to `stuck` versus `short`. Blowing up a bottle always
reduces `minPours`, so it reliably answers `short`. It only sometimes answers
`stuck`. Checking rather than assuming means the panel never sells the wrong one.

### The price cannot be what "a lot of coins" sounds like

Work the numbers against the board this tool is bought for — one you are losing.

| | cost | you get |
| --- | --- | --- |
| Try again | 5 | the board again, three stars still live |
| Pay past | 10 | the next level opens, no stars, bonus preserved |
| Explode | ? | a 2★ clear, which pays 3 + 8 back |

The explosion's real competitor is not the vessel. It is **retry at five gold**,
and against retry the explosion loses every time the player thinks they might
still win. Its only genuine market is the board that has actually beaten them —
and for that board, paying past already exists at ten.

So the explosion sells one thing: two stars and a clear on a level that would
otherwise stay unbeaten. Priced at `X`, it costs `X − 10 − 11` more than skipping.
The economy cannot hold a large `X`. The purse opens at 86, income is 14 a good
level and 12 a day, and `04-economy.md` says outright that "above roughly 150 the
pressure disappears." A tool priced at 150 is priced above the number the whole
economy is tuned to keep you under; it becomes an item you can only afford by not
playing.

**"A lot of coins" in Decanter is 45.** The honest range for "dearer than the
vessel" is 60 to 80 — four to six good levels against the vessel's three — and it
buys a good invariant:

> An opening purse must afford the vessel or the explosion, but never both.

86 − 45 = 41, which is under 60. That is a real decision on a real board rather
than a number that sounds expensive, and it is the same kind of pressure the
vessel's own invariant already pins.

If the intent really is a large number, then the tool has to be **once per save**
rather than once per run: the one bomb you carry across 120 levels, for the board
that finally beats you. That is a good item and a worse feature. It needs a field
in the save and a migration clause in `12-saving.md`, and it invites the oldest
failure in consumables — the player who hoards it, never spends it, and finishes
the game having experienced nothing.

Once per run. `S.vesselUsed` already gates the vessel's button; `S.blownUp`
alongside it costs nothing and touches no save.

## The bubble side

"Everything in a +1 radius" on this lattice is the landing cell and its six
neighbours: seven cells. `BubbleGrid.neighbours` already returns them and already
gets the parity right, which is the bug of the genre and is already solved.

The turn is then exactly `resolveTurn`'s shape — remove the blast cells, run
`detach`, remove what came loose — and the animator takes the two lists and never
reads the grid, so the existing fall works unchanged. The blast cells go in
`matched`, kicked outward from the hit, which is precisely what a bomb should look
like. What was cut free goes in `cut` and lets go.

It must not go *through* `resolveTurn`. The warning at the top of `30-rules.js`
is about exactly this: two flood fills that look similar and must never be merged
into one function with a flag. A blast has no colour, so `matchFrom` cannot seed
it. Give it its own path.

Seven cells out of the fifty to ninety a live board carries is a large hole, and
on a hex lattice a hole that size nearly always cuts something loose above it, so
the real yield is more like ten to twenty-five bubbles. That is several shots of
survival, which is exactly why `aided` is the right lever and why it costs
nothing to pull.

What the wiring actually costs, named rather than waved at:

- **A bomb is not a colour.** `st.loaded` is a palette index. A sentinel distinct
  from `G.EMPTY` has to be understood by `paintHud`, the renderer's loaded-bubble
  draw, and `deal()`, which must never produce one.
- **Swap must refuse it.** Swapping the bomb into `next` and firing it is fine;
  swapping it away where `next` is re-dealt would delete a paid-for bomb.
- **Hint has nothing to say.** `Adv.bestShot` and `hasClearingShot` assume a
  colour. The button is disabled while a bomb is loaded.
- **Undo restores it.** `remember()` already snapshots `loaded`, so undo hands the
  bomb back and the gold is not refunded — which matches the pour game's "a
  restart is not an undo" exactly.
- **It does not rescue a packed board.** Landing is geometric, not colour-based,
  so a board that eats every shot eats the bomb too, and `canPlay()` still ends
  the run. Worth saying so it is not sold as a fix for that ending.
- **Clearing the board with it still caps at two.** `stars()` applies the aid cap
  after `cleared ? 3`, and there is already a test asserting exactly that.

## What I would build

1. `Rules.isSolved(tubes, spilled)`, and the clause in `01-puzzle.md`.
2. `Rules.rate(moves, par, exact, eased)` — one rename. Both `S.vesselUsed` and
   `S.blownUp` feed it, and the comment already there explains the reason in
   terms that cover both. The bubble game already calls this idea `aided`; the
   two games should use the one word.
3. `CONFIG.economy.blast`, in the 60–80 band, with the vessel-or-blast invariant
   as a test.
4. A seventh chapter and a seventh section name. Two array entries and a `case`.
5. The pour game: a tool-row button gated on `perks.blast`, a tap-to-choose-a-
   bottle mode, and the panel offer with the only-where-it-works check.
6. The bubble game: a fifth tool, a bomb sentinel, `blastFrom(board, j, c)`, and
   `st.aided = true`.
7. Tests: the spill rule, the price invariant, the panel offer on both endings,
   the blast cell list on both parities, and the aid cap on a cleared bomb run.

## What I would cut

**"One per game" read as once per save.** It buys a bigger number and costs a
save field, a migration, and a player who never presses it.

**The explosion as a purchase without a chapter.** Every tool in this game arrives
through a chapter and then costs gold. A tool that appears in the shop with no
chapter behind it is the first one that does not, and the reason to want it —
that the back half hands over nothing — is the reason to put it in a chapter
rather than beside one.

## Open questions

- Did "one per game" mean one per run or one per save? The whole price argument
  turns on it.
- Spill or purge? Spill is the proposal as written and costs one rule. Purge
  costs nothing and is a better feature that is not the one you asked for.
- Should the explosion cap at two stars on a **bubble** level, where it stacks
  with the existing colour-pick cap? Both set the same flag, so two aids cost the
  same as one. That is either a mercy or a loophole and it should be a decision
  rather than a consequence.
