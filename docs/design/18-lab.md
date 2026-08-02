# 18 · The lab

A workbench at `/lab/` for looking at the games while changing them: live
parameters, level navigation, and the difficulty measurements that until now only
existed as offline tools.

## Why it is a frame and not a page

The lab opens each game's **real built page** in a same-origin iframe and reaches
into it through `contentWindow`. It does not mount the games itself.

That is the whole design. A workbench that re-hosts a game is a second place the
game can be set up, and the day the two disagree the workbench is testing
something nobody ships — quietly, and in the direction of everything looking
fine. Here there is nothing to disagree with: the thing in the frame is
`/measure/`, byte for byte, and turning a knob reaches through and moves the same
constant the game read when it booted.

It is also nearly free. The games are already built and already precached, so the
lab is a sidebar: about 30kb, and it works offline like every other page.

## Why not Storybook

The obvious answer to "a playground with knobs" is Storybook, and it was
considered and declined. It needs a bundler and several hundred packages, against
a project whose most defended constraint is that it has **no dependencies at all**
— see [13 Delivery](13-delivery.md). And the games are not components: there is
no story to write against `globalThis.CasksApp`, so Storybook would have been one
story per game that mounts the whole thing, supplying a sidebar and a knobs panel
and nothing else. Both of those are cheaper to write than to install here.

What Storybook could not have supplied at all is the half that matters: solving a
level and comparing it against the shipped table, or running the survival
harness while a cadence knob is under the finger. That is game-specific and it is
the reason the lab exists.

## What it does

**Parameters.** Each game declares which of its config keys are worth moving, with
a range and a sentence saying what the setting is for. The ranges are the point —
a raw number box on `ADVANCE_EVERY` invites 0 and a board that comes down every
shot, which teaches nothing except that the game can be broken.

Some knobs need more than an assignment. The bubble game derives its world from
its column count *once*, at the bottom of its config, so moving `COLS` has to put
the walls and the muzzle back or the board is dealt into a grid the walls no
longer match. The lab restates that arithmetic, and because two copies of one
calculation is exactly what this repo says will drift, a test compares the two.

**Levels.** Step or jump to any level. The readout shows par as the game reports
it *and* par as the search says when asked again. They should agree; the useful
case is when they do not.

That comes in two flavours and they are not the same thing:

| | means |
| --- | --- |
| `DISAGREE` | every knob is where the game shipped it, and the table and the search still disagree. A fault. |
| `table is stale (CAP_MAX moved)` | a generation knob has moved, so the committed table describes boards that are no longer being dealt. Expected. |

Collapsing those two would train somebody to ignore the one that matters.

**Difficulty.** Two shapes of measurement, because the games are graded two ways:

- **Par**, for the measure and the cellar door. Every level in the range is solved
  outright. Because par is exact this is not a sample, so a step that goes down is
  a real fault in the ordering rather than noise. The panel says the range, how
  many steps go down and where, and whether the shipped table still agrees.
- **Survival**, for the bubble game, which has no par and cannot have one. Whole
  runs are played with the same shot-chooser the hint button offers, three times
  over: the bot that always takes its shot, somebody who misjudges three shots in
  ten, and somebody aiming at any reachable cell at all. What is reported is how
  often each of them clears each bar, because pass rates are what the bars were
  set from — a bot's tenth percentile is not a person's. It finishes by saying
  whether the bars still separate playing from flailing, which is the claim
  `tools/bubble-survival.mjs` prints, now available while the knob is still moving.

The sweep is handed the game's own modules and does arithmetic on what they
return. It has no rules and no geometry of its own — the mistake
`bubble-survival.mjs` records having made and corrected is a harness with its own
copy of the deal, which measured a game nobody played.

The one thing it does have to write out is the run loop, because
`tools/bubble-run.mjs` — the module the survival tool and the difficulty test
share for exactly this reason — is a node module and this is a browser page. That
file exists because two run loops disagreed about whether a row comes down after
the final shot, a whole star's worth of difference on the runs it touches, so the
lab's copy is not left to be careful: `tests/lab.test.mjs` plays both over the
same seeds at three miss rates and requires the same answer, seed for seed.

## What it is not

Not a save file, not a route into the graded run, and not something the app links
to. It is a developer's page that happens to be built and shipped, the way
`tools/sound-lab/` is a developer's tool that happens to live in the repo.

Nothing in a game knows the lab exists. The dependency runs one way, and
`src/lab/js/pure/00-config.js` is the only file in the repo that names another game's
internals — which everywhere else is a lint error and should stay one.
