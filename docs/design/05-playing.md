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
- **A blast** takes one away, glass and contents together.

Two details about the vessel are load-bearing:

- **Restarting keeps a vessel already paid for.** Otherwise buy-then-restart
  would launder the purchase back into a three-star run. Leaving the level and
  coming back deals a clean board and costs the gold again.
- **Buying one clears the undo history.** The shelf changed shape, so the
  snapshots behind it no longer describe this board, and undoing into one would
  quietly take the vessel back.

### The blast

The vessel's opposite in both directions at once: one more place to put liquid
against one less, and work rearranged against work removed. That is what keeps
the two from being the same purchase at two prices.

Pressing it arms a **choice**, and the only bottles it will arm are the ones the
rules allow — not empty, not finished, and not one whose removal would end the
run. Everything else is left alone and cannot be picked, so the tool has no
target that can only make things worse. Pressing it again puts it down. The gold
is taken when a bottle is chosen, never when the tool is armed.

Both of the vessel's load-bearing details apply unchanged, for the same reasons:
a blast survives a restart, and it clears the undo history.

What it costs the run is the third star, exactly as a vessel does and through the
same flag.

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

The failed panel offers **another go** at the attempt price, **paying past the
board** for twice that, and — when it would work — **a blast**.

The blast is on this panel because of when a run ends. A run stops the moment it
is lost, and `S.over` is never unset, so a rescue that lives only in the tool row
can be pressed only *before* the game has said you need it. The vessel has always
had that problem: it is sold as the answer to a board with nowhere left to put
anything, and nowhere left to put anything is exactly the ending that stops the
run. Buying on a read of the board rather than on a verdict is a real skill, and
it is also a real reason a button goes unpressed.

So the blast is offered where it is wanted, and only where it helps. That is
checkable rather than guessable: apply it to a copy for every bottle on the shelf
and ask the same function that ended the run whether the board comes back alive.
If no bottle does, the button is not there. This matters most for the three
endings, which are not equally rescuable — a blast always lowers the work left,
so it reliably answers **short**; it sometimes opens a move, so it sometimes
answers **stuck**; and it can do nothing at all about **over**, where the pours
are simply spent. Checking rather than assuming is what stops the panel selling
the wrong one.

Taking it resumes the run in place. Nothing is re-dealt and no attempt is
charged, because a failed run banked nothing and there is nothing to undo — the
board simply becomes winnable again, two pours shorter on work and one bottle
lighter, capped at two stars.

If nothing on the panel can be afforded it says so and points at the daily
draught.
