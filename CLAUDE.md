# Decanter

A water sorting puzzle that ships as static files and runs entirely offline,
plus three smaller games on pages of their own.

- What is where: [README.md](README.md).
- Why it is the way it is: [docs/DESIGN.md](docs/DESIGN.md), one document per
  decision domain.

Neither is copied out below. Anything written down twice drifts, and this would
be the third place for it to drift in. What is here is the short list of things
that are not apparent from reading the code, and the way a change is expected to
land.

## Checks

```bash
npm run check      # lint, build, unit tests, size budget, dead code
npm run check:all  # the above, plus par verification and the browser suite
```

`check:all` covers everything CI gates on, so run it before pushing rather than
after. What each layer is for, and what none of them can tell you, is
[docs/design/14b-ci.md](docs/design/14b-ci.md).

The browser suite builds and serves on one port and never reuses a server. A
worktree is a second checkout of this repo, so two runs at once collide over it.
Give one of them a port of its own: `PW_PORT=8125 npm run test:e2e`.

It runs four browsers at once rather than Playwright's default of half the cores,
because each one drives a game that animates through a software renderer and
costs about a whole core. Two suites at the default ask for more machine than
there is, and what that looks like is not a slow run but a broken one: every
failure is a timeout, on whichever specs were unlucky, moving each time.
`PW_WORKERS=8` when the machine is yours alone.

Specs ask for reduced motion, which the game implements and which takes a pour
from 1537ms to 597ms. The exceptions are named where they are made: two tests in
`tests/e2e/play.spec.js`, where the timing is the subject, and one in
`tests/e2e/economy.spec.js`, which counts confetti that reduced motion is right
not to throw. `npm run verify:test-budget` fails if one spec grows past a
quarter of the suite.

## What is easy to get wrong

**The globals are a debug surface, not how the code talks to itself.** The
sources are ES modules and esbuild bundles them, so a module reaches another one
by importing it. Each game's `main.js` then ends in a single
`Object.assign(globalThis, { … })` naming everything on its page, and that exists
for one reader: the browser specs, which drive the page through those names.
Adding a module means importing it where it is used, and adding it to that block
only if a spec needs to reach it. `eslint.config.js` reads the block rather than
repeating it, so nothing has to be declared twice.

**The number on the front of a file still orders it.** Filenames carry the load
order across the whole build, whichever folder a file sits in, which is why they
are numbered and why the numbers are not contiguous.

**A `pure` folder means no DOM.** Every game has one, and a test rejects any
module in it that names `document`, `window`, `requestAnimationFrame`,
`addEventListener`, `navigator` or `caches`. Anything reaching for those belongs
in the folder above.

**Tree shaking stops at the module's object.** esbuild drops what nothing
imports and no further, so a module that is imported at all ships every key it
hands back, and a class left in a stylesheet or an id left in the markup ships
regardless. `npm run verify:dead` is what catches those, and it has no allowlist
on purpose.

**Some sources are generated.** A generated file says so in its first line and
names the command that writes it, `src/js/pure/35-pars.js` and `npm run pars`
for instance. There are several, spread across the games, so read the first line
before editing anything under a `pure` folder. Rerun the command; never edit one
by hand.

**Nothing ships as a dependency.** esbuild, eslint and playwright are dev only,
and a test fails any built page carrying an external `src` or `href`. Something
fetched at runtime is a design decision, not a convenience.

**Spelling is American, in identifiers as well as prose.** `color`, `center`,
`gray`, `normalize`, `analyze`, `canceled`. A test scans every source and every
document for the British forms and names the file, the line and the word to write
instead. Two exceptions, both deliberate: `draught` is the game's economy term, a
drink drawn from a cask rather than a spelling of `draft`, and Alegreya is a
typeface.

## Opening a pull request

When asked to open a pull request, do all of this by default. None of it needs to
be asked for.

1. **Rebase onto the latest main.** `git fetch origin && git rebase origin/main`.
   Main moves under a long branch, and both the review and the checks should run
   against what will actually merge.
2. **Read around the diff, not just the diff.** The branch has to sit well in the
   code it is landing in and in the design note that owns the domain it touches.
3. **Put things where they belong.** A file that has ended up in the wrong
   folder, a module doing two jobs, a name that no longer describes what it
   holds: fix it in this branch rather than noting it.
4. **Deduplicate.** Two independent implementations are a deliberate test
   strategy here (see [14 Testing](docs/design/14-testing.md)); two copies of the
   same logic in shipped code are drift waiting to happen. Fold them together, or
   name the boundary and keep the detail on one side of it.
5. **Review it with fresh eyes.** Skeptically, looking for what the author
   missed. A finding needs a failure scenario and a fix that would work if it
   were pasted in as written.
6. **Apply every high confidence finding, in scope or out.** Do not file them for
   later. A high confidence problem outside the branch's subject still gets fixed
   here, and the description says so. Low confidence ones are dropped rather than
   hedged into the description.
7. **Turn what the review caught into a check.** An edge case it raised becomes a
   test before merge, and a convention anybody could break becomes a lint rule,
   an assertion or a CI step. A thing fixed by hand comes back.
8. **Green before push.** `npm run check:all`, then `gh pr create`.
