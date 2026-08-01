# 01 · The puzzle

The laws of the game. What a pour is, when one is legal, and when a level is
over. Everything else in this codebase is downstream of these five rules, so they
are kept in one small module with no dependencies of any kind.

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

## Why the rules module is inert

`src/js/20-rules.js` touches no DOM, no timers, and no state. It exports pure
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
