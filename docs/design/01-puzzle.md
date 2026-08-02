# 01 · The puzzle

The laws of the game. What a pour is, when one is legal, and when a level is
over. Everything else in this codebase is downstream of these five rules, so they are
kept in one small module that reads nothing but `CONFIG`.

## The rules

- A bottle holds **four units**, stacked bottom to top. The capacity is
  `CONFIG.capacity` and nothing assumes the number four directly.
- A pour moves the **entire top run of one colour**, unless the target runs out of
  room first, in which case it moves as much as fits.
- The target must be **empty, or have the same colour on top**.
- A bottle **full of one colour is finished** and can no longer be poured from.
- The level is **solved when every bottle is empty or finished**.

That is the whole game. The rest of this document is about why the module holding
them looks the way it does.

## The one thing that can move a rule

A **blast** destroys a bottle mid-run — the glass and what was in it. It is a
purchase rather than a pour and it is documented in
[04 Economy](04-economy.md), but it reaches into the law above, so the law is
written here.

Four units of a colour is the win condition, not an accident of the deal. Destroy
part of a stack and the rest of that colour is stranded: it can never make four
again, so the board can never be solved. Nothing would say so, either — an
unwinnable board is neither **stuck** (there are still legal pours) nor **short**
(the lower bound on the work left is still a number the player is under) — so the
run would carry on against a puzzle that cannot be finished until the count ran
out. A tool bought to rescue a run must not be able to end one in silence.

So the requirement moves with the liquid:

- A colour a blast took units from is **spilled**.
- A spilled colour is finished when it is **gathered**, rather than when it
  reaches four.

The gathering still has to happen. Two units of a spilled red sitting in two
bottles is not a solved board, and saying that out loud is the whole of the
change, because it is the clause that four units used to imply for free.

The rule underneath was always **every bottle holds one colour, and no colour is
in two bottles**. Without spilling those two clauses collapse into "four of a
colour in one bottle", since every deal makes exactly four of each and four
cannot fill two bottles. `isSolved` keeps that collapsed form as its fast path,
unchanged, and it is what the generator, the solver and every board nobody has
blasted still run through. Spilling is the only thing that breaks the collapse
and the only thing that pays for the longer check.

**Par never sees any of this.** A blast happens during a run; par describes the
board that was dealt. That is why this can be a rule change without being a
re-solve, and it is the same reason the vessel has always been allowed to add a
bottle.

## Why the rules module is inert

`src/js/pure/20-rules.js` touches no DOM, no timers, and no state. It reads two pieces
of configuration, the capacity and the star brackets, and otherwise exports pure
functions over an array of arrays. That is not tidiness for its own sake: it is
what makes the rules **testable against an independent implementation**.

`tests/baseline.mjs` contains a second, deliberately naive implementation of the
same rules plus an exhaustive breadth-first search. It shares no code with the
real one. The suite walks thousands of random positions and asserts the two agree
on the legal moves available, move for move.

This matters more than it looks. Two other parts of the system are judged against
the rules: the solver decides the minimum number of pours, and the star brackets
decide what a run was worth. If the rules the solver searches are not exactly the
rules the game plays, par is a number about a different game. That failure would
be invisible in ordinary play and would surface as "the game says 12 is possible
but it isn't", which is close to impossible to debug from the outside.

## A pour is one move, whatever it carries

Pouring three units and pouring one unit both count as one pour. This is what
makes par meaningful as a measure of thinking rather than of clicking, and it is
why the scoring in [04 Economy](04-economy.md) can be as tight as it is.

## What is deliberately not here

- **Whether a board is solvable.** The generator needs that question answered and
  owns it, see [02 Levels](02-levels.md).
- **How few pours a board needs.** That is a search, and it lives in
  [03 Par and the solver](03-par.md).
- **What a run is worth.** `rate()` lives alongside the rules for convenience,
  but its brackets are an economy decision and are documented in
  [04 Economy](04-economy.md).
