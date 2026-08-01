# 05 · Playing a level

A session end to end: getting in, pouring, the things you can spend on, what the
screen tells you, and how it ends. The numbers referred to here are owned by
[04 Economy](04-economy.md); the animation is owned by [07 The pour](07-pour.md).

## Getting in

Entering a level is an **attempt** and is paid for. Every board dealt costs the
same, whether it comes from the map, from Next level, or from a restart.

Charging happens in `attempt()` rather than inside `start()`, deliberately:
`start()` is also used for internal re-deals, and those must stay free. Only a
deliberate act of playing a board is billed. The map disables Play when the fee
cannot be covered, rather than letting someone press a button that will refuse.

## Input, and why the queue does not block it

Logic resolves **on tap**. The animation trails behind in a queue, so a player who
knows the next three pours can make them without waiting for bottles to finish
tipping.

That means the logical board and the drawn board are out of step by design, and
two rules keep that from becoming a bug: the queue always catches the view up to
the logic even if an animation fails, and Undo and Restart are disabled while
anything is in flight. See [07 The pour](07-pour.md) for the machinery.

Tapping an empty or finished bottle nudges it and refuses. Tapping the selected
bottle again puts it down.

## What you can spend on

- **Undo** rolls back one pour, restoring both the board and the move count, so
  an undone pour never happened. Three are free per level, then they cost.
- **Restart** re-deals the same level, and costs an attempt.
- **A vessel** adds an empty bottle to the shelf.

Two details about the vessel are load-bearing:

- **Restarting keeps a vessel already paid for.** Otherwise buy-then-restart
  would launder the purchase back into a three-star run. Leaving the level and
  coming back deals a clean board and costs the gold again.
- **Buying one clears the undo history.** The shelf changed shape, so the
  snapshots behind it no longer describe this board, and undoing into one would
  quietly take the vessel back.

## The HUD

Two chips: the level, and the stars.

You open on ★★★ and spend them. Underneath is what the current tier can still
absorb: `3 to spare`, then `next pour costs a star`, then the chip warms, then it
goes out.

Counting pours up tells you what you have done. Counting down to the next star
tells you what the next one will **cost**, which is the thing worth knowing while
there is still a choice to make. The number shown is exactly what `rate()` will
award at the end, because pours only ever go up: whatever the stars read now is
the best still available.

There is deliberately **no pour counter and no bottles-remaining counter**. The
countdown makes the first redundant and the board itself shows the second. The
raw pour count appears once, on the end panel.

## How it ends

**Solved**, and the run is rated and paid.

**Lost**, meaning no star is reachable however it finishes. The board stops taking
pours immediately and the run is over. Playing out a level that has already
failed is busywork.

That decision is made **the moment the pour lands**, not when the animation queue
happens to empty. Pouring quickly keeps the queue full, and an earlier version
that checked after draining let a run carry on to nineteen pours when it had lost
at fifteen. The lockout is immediate; the panel waits for the board to stop
moving so the last pour is seen to land.

## The end panel

A win fades in. A failure does not: the room goes red, the panel arrives with a
knock, the stars are dark, and there is no confetti and no win sound. Losing
should be felt rather than read.

The failed panel offers exactly two things, because they are the only two that
help: **another go** at the attempt price, or **paying past the board** for twice
that, which opens the next level and deals it. If neither can be afforded it says
so and points at the daily draught.
