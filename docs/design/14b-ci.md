# 14b · What CI enforces

[14 Testing](14-testing.md) is about how the tests are written. This is about
which of them have to pass before a change can land, and why those.

## The gate

`.github/workflows/ci.yml` runs on **every push and every pull request**, not
only on `main`. It used to run only on a push to `main`, which meant the checks
ran after the decision they were supposed to inform.

Split by what a failure means and by what it costs to find out. A typo should
not wait behind a browser download, and the browser suite should not wait behind
a minute and a half of replaying levels, so all three run at once.

| job | what it runs | roughly |
| --- | --- | --- |
| `checks` | lint, size budget, unit tests, dead code | under a minute |
| `pars` | every par replayed against the independent rules | a minute and a half |
| `e2e` | the browser suite, two viewports, in eight shards | about two minutes a shard |
| `e2e-budget` | merges the eight reports and checks how the suite spends its time | seconds |

Two of those report under names of their own, and `main` requires two names, so
each group ends in a gate job that carries the required one: `lint, unit tests,
invariants` over the first two and `end to end` over the shards. A gate runs even
when what it needs failed, because a required check that is skipped rather than
failed leaves a pull request that can neither merge nor go red.

`.github/workflows/pages.yml` runs `npm run check` again before publishing.
Redundant on purpose: it is the last thing between a merge and players.

## The layers, and what each one is for

**Lint** (`npm run lint`). Every source file is an ES module, so the config says
so once and the linter resolves imports on its own; the one thing it is still
told about is `Sound`, which is written by the deferred half of the sound and
read by the rest, across a boundary no import crosses. It found two pieces of
genuinely dead code the first time it ran, and again during the move to modules:
`no-undef` is what found a module using `Rules` without importing it, which the
old configuration could not have seen.

**Unit** (`npm test`). No dependencies, covering everything decidable from
numbers: rules, solver, levels, par, ordering, economy, progress, the end-of-run
panel, and the repo's own invariants. This is the bulk of the game and the
cheapest place to catch things. There is no count here on purpose: the one that
used to be here said 139, and the README's said 203, and neither had been true
for a long time.

**Dead code** (`npm run verify:dead`). Seven kinds in the output, six of them
ways of being unused:

| kind | what it is |
| --- | --- |
| `global` | a module no other file imports or names |
| `member` | a key on a module's object that no other file names |
| `helper` | a top-level function its own module never calls |
| `config` | a tunable nothing reads |
| `style` | a selector or custom property nothing uses |
| `page` | an element id nothing reaches for |
| `missing` | an id a script reaches for and no page has |

The last runs the other way round. `missing` finds something reached and never
written where everything above it finds something written and never reached, and
it is the worse failure: a silent null every time that line runs.

The bundler tree-shakes what nothing imports, which does not make any of this
redundant: the shaking stops at the module's object. A module that is imported at
all ships every key it hands back, so `member` is measuring something no bundler
looks at, and `global` still matters because an unimported module is a file
someone will read and maintain.

`global` has one rule worth stating, because without it the kind would be
decorative. Every entry point ends in a single `Object.assign(globalThis, { … })`
naming every module on its page, so that the browser suite can reach them. That
block is a debug surface, not a use, and is excluded from the count on the same
footing as the module's own file — otherwise it would answer "does anything name
this?" with yes for every module there will ever be.

There used to be an eighth kind, `scope`, for a name a module left in the page's
own top level. It was about collision rather than deadness, and it mattered
because the build concatenated every file into one `<script>`: two modules
declaring one name either overwrote each other in silence, if they were
functions, or failed to parse, which on a page that is one script is a blank
screen. Modules have their own scope now and there is nothing left for it to
find, so it was removed rather than left to pass while examining nothing.

There were briefly two tools asking this from opposite ends, one scanning the
sources and one the build. They are one now, and it carries every check either
had. A tool nobody runs is worse than none: the second one sat in `npm run check`
and in no CI step at all, so nothing it found could fail a pull request.

An uncalled function is not an error. It does not throw, it does not slow
anything down, and it reads exactly like code that works, which is why it
survives review and why it needs a machine. It is the reason `unlock2` sat in the
audio module for months making a sound nobody could hear.

**There is no allowlist**, and that is the interesting decision. There was one,
covering two exports, forty-odd class names and two ids, all written defensively
before anyone knew whether they were needed — and emptying it one entry at a time
changed nothing. What it would have done is forgive the first genuinely dead
`.armed` rule for ever, which is the opposite of the job. Something reached in a
way a textual scan cannot see goes back in with the evidence that it is real.

Test-only members are the one thing reported without failing. A member the suite
reaches for directly is often exactly right, and a check demanding those be
deleted would be asking for a worse suite — but the other half of the time it is
a hole poked in a module for one assertion the public path could have made.

Everything here is string matching, with no parser, so it errs toward silence —
a name built at runtime looks used. A detector that cries wolf gets switched off,
and one that is switched off finds nothing.

**Size budget** (`npm run verify:budget`). Builds and fails if what matters has
outgrown its budget. Four numbers rather than one, because the page stopped
being the download when the code moved into hashed bundles: the shells, which
every load revalidates forever; the critical path, which a first paint waits for
on a cold cache; each game on its own; and the whole build. See
[13 Delivery](13-delivery.md).

This used to also check that a committed `dist/` matched the sources. `dist/` is
no longer committed: the deploy has always rebuilt from source, so the copy in
git was never what shipped, `npm run serve` rebuilds before serving so it was not
what anyone was looking at either, and nobody reads a generated bundle in review.
What it did reliably do was conflict on every branch that touched a source file.

**Par reachability** (`npm run verify:pars`). Replays all 120 levels against the
independent rules in `baseline.mjs` and fails if any cannot be finished in
exactly the par the game advertises. Par is what the whole scoring rests on.

**End to end** (`npm run test:e2e`). The layer the unit tests cannot reach.

Split across four runners rather than given more cores on one. A runner has four
of them and every worker drives a game that animates through a software
renderer, so two workers is already most of the machine; asking one runner for
more is how the suite starts failing on teardown timeouts that read as flaky
specs and move around between runs. The fixed cost of a shard is about thirty
seconds, nearly all of it the browser download, which is what makes four worth
it and what stops more from being.

The table above said this job took a minute for a long time. It took sixteen.
That is the sort of number nobody rechecks, and the reason it had grown was not
that any one spec was slow but that the whole suite ran at the animation speed a
player sees. It asks for reduced motion now, which the game implements and which
takes a pour from 1537ms to 597ms; the three tests where the animation is the
subject say so where they opt out.

**The time budget** (`npm run verify:test-budget`). Reads the report the suite
already wrote, so it never runs anything twice, and fails if one spec grows past
a quarter of the suite or one test past a twentieth of it.

Shares rather than seconds, which is the whole design decision. A cap in seconds
is a statement about the machine that ran the suite: this runner and a developer's
laptop are not the same, and a cap generous enough not to fail on the slower one
catches nothing on the faster. A share is the same number on both. It cannot see
the whole suite getting slower together, so it prints the seconds without judging
them, which is what the sixteen minutes above would have needed.

It runs in a job of its own because it cannot run on a shard: a quarter of the
suite divided up is a different set of numbers, and a spec that lands entirely
in one shard reads as a far larger share of it than it is of the whole.

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
