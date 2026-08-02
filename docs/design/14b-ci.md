# 14b · What CI enforces

[14 Testing](14-testing.md) is about how the tests are written. This is about
which of them have to pass before a change can land, and why those.

## The gate

`.github/workflows/ci.yml` runs on **every push and every pull request**, not
only on `main`. It used to run only on a push to `main`, which meant the checks
ran after the decision they were supposed to inform.

Two jobs, because they fail for different reasons and take very different
amounts of time. A typo should not wait behind a browser download.

| job | what it runs | roughly |
| --- | --- | --- |
| `checks` | lint, dist freshness and size, unit tests, par reachability | seconds |
| `e2e` | the browser suite, two viewports | a minute |

`.github/workflows/pages.yml` runs `npm run check` again before publishing.
Redundant on purpose: it is the last thing between a merge and players.

## The layers, and what each one is for

**Lint** (`npm run lint`). The game ships as plain scripts sharing one global
scope, so the config declares what each file publishes and what it expects to
find; a linter that assumes modules calls all of that undefined. It found two
pieces of genuinely dead code the first time it ran.

**Unit** (`npm test`). 139 tests, no dependencies, covering everything decidable
from numbers: rules, solver, levels, par, ordering, economy, progress, the
end-of-run panel. This is the bulk of the game and the cheapest place to catch
things.

**Size budget** (`npm run verify:budget`). Builds the page and fails if it has
outgrown its budget. Everything is inlined so the whole game is a single download
that works offline, which is the point of it — and which also makes it very easy
not to notice that download growing, since nothing about adding a module tells
you the page just got forty kilobytes heavier.

This used to also check that a committed `dist/` matched the sources. `dist/` is
no longer committed: the deploy has always rebuilt from source, so the copy in
git was never what shipped, `npm run serve` rebuilds before serving so it was not
what anyone was looking at either, and nobody reads a generated bundle in review.
What it did reliably do was conflict on every branch that touched a source file.

**Par reachability** (`npm run verify:pars`). Replays all 120 levels against the
independent rules in `baseline.mjs` and fails if any cannot be finished in
exactly the par the game advertises. Par is what the whole scoring rests on.

**End to end** (`npm run test:e2e`). The layer the unit tests cannot reach.

## Why the browser suite exists

Every bug in this list shipped, and none of them was visible to a test that
imports a module:

- A `hidden` attribute overridden by a `display` rule, so a clean run offered
  Retry and Move On alongside Next Level.
- A row of bottles overflowing the canvas their contents are drawn on, so the
  glass rendered and the liquid was sliced off at both edges.
- A resize dropped while a pour was in the air, leaving the glass and the liquid
  permanently apart.
- A run scored as a three star clear six pours into a board with a par of
  thirty nine.

They are all obvious in a browser and invisible without one. So the suite plays
levels for real: it asks the page's own solver for a line, plays it pour by pour
waiting for each animation to land, and then reads the panel the game itself
produced.

It runs against `dist/`, not the sources. The build is what ships, and a bug the
build introduces is the one thing this cannot afford to miss.

Two viewports, one engine. A phone shape and a desktop shape catch the layout
problems; the iPhone preset would pull in WebKit, which is a second browser to
install for a suite whose subject is layout and game state rather than engine
differences. Worth adding when there is a reason to suspect Safari specifically.

## What is still not covered

Worth stating plainly rather than implying the gate is complete.

- **How the pour looks.** The suite can prove a pour completes, that the liquid
  ends up in the right bottle and that the layers are stacked in the right order.
  It cannot say whether the stream reads as liquid. That needs eyes.
- **Real Safari and real phones.** Chromium at a phone-shaped viewport is not an
  iPhone. The service worker and the animation timing are the likeliest places
  for that to matter.
- **Whether the difficulty curve feels right.** It is measured, ordered and
  asserted monotone. Whether level 40 feels harder than level 20 to a person is
  not something a test answers.
