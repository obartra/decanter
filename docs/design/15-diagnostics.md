# 15 · Diagnostics

Answering "it did nothing when I tapped it".

## Why

A player reported that a level did nothing when he tapped it. Nothing about that
was answerable. Which build was he on, what did his save say, how much gold did
he have, had the game refused something and why — all of it existed, none of it
was reachable, and the only way to make progress was to guess at states and try
to reproduce them one at a time.

Two of the guesses turned out to be real bugs. That is the point: the guessing
was the expensive part, not the fixing.

## Nothing is sent anywhere

The game runs fully offline and a test asserts the built page makes no network
requests. That is not negotiable for a diagnostic, so none of this reports
anything: it reads state that already exists, formats it, and puts it on the
screen for the player to read out or copy. There is no endpoint, no identifier
and no background collection.

## What is worth keeping

**Refusals.** An action the game declined: a fee it could not take, a pour the
rules would not allow, a purchase with nothing behind it. Every refusal is a tap
that does nothing, and a tap that does nothing is exactly what gets reported. The
deny sound is the only thing that marks one, and a player with sound off does not
get even that.

They are recorded with the reason rather than the fact, because "level 15 did
nothing" and "level 15 cost 5 and the purse held 4" are different bug reports.
Every refusal in the app goes through one `deny(what, why)` so none can be added
later that does not.

**Faults.** An exception thrown inside a click handler is the quietest failure
the game has: the handler stops, the screen stays as it was, and what the player
sees is a dead button. Nothing tries to recover from one — the state is already
whatever the half-run handler left — but it leaves a mark instead of none.

**Endings.** How runs on a level finished, counted per level and per reason.
Unlike the two above, this is not about something going wrong. It is about the
game being hard in a particular place, and it is here because this is the only
channel the game has for telling anybody anything.

The game already worked this out and threw it away. `Rules.lostBecause` names why
every run ended and one of its answers is `stuck`: no legal pour left, the player
having painted themselves into a corner. That is the exact thing
[02 Levels](02-levels.md) now selects boards against, and the ceiling it selects
against is a judgement about how much frustration a player will take. These
counts are what turn that judgement into a measurement.

Record all four reasons, not just `stuck`. A genuinely dead board reports
`stuck`, but a player who made the run unwinnable while legal pours remain
reports `short` or `over` instead, and those come from the same mistake. Counting
only the first would undercount the problem and would not line up with what the
model measures.

They are cleared when `CONFIG.layout` changes, for the same reason the cached par
is and a sharper one: they are read against the measured difficulty of a
particular board, and after a regeneration that board is gone. Carrying them over
would answer the question with runs played on a puzzle that no longer exists.

`tools/endings.mjs` folds one or more pasted reports back against
`docs/difficulty.json`. It reports the correlation between the modeled brick
rate and what players actually hit, and ignores levels with fewer than five runs,
because a level lost once out of once is a 100% loss rate that means nothing.

## Where it lives

`Trace` holds a ring of the last 64 entries. A ring rather than a log because
what matters is the run-up to the thing that went wrong, and a buffer that grows
without bound on a device that is never reloaded is its own bug.

The **counts** are also written to the save, because a stuck player reloads and
everything the ring held goes with the page. Counts by kind and the last fault
message only: a save belongs to the player and is not a place to grow a diary.

## Getting at it

Press and hold the gold count for a moment, on either screen.

Deliberately not a button. It costs no room in a footer that is already full, it
cannot be hit by accident, and it is one sentence to say to someone who is stuck.
Support instructions do not need to be discoverable, they need to be sayable.

The report gives the build id, the viewport, the save, which tools the chapters
have handed over, the run in front of the player, the counts, the levels that
have lost runs and how, and the log. It
copies to the clipboard, and falls back to selecting itself when the clipboard is
refused, because someone can always copy a selection by hand.

## What this does not do

It measures one thing about how the game is played and only one: how runs on a
level ended. That line used to say it measured nothing of the sort, and the
reason given was that anything of the kind needs somewhere to send data. The
ending counts are the case where that turned out not to be true. They are read
off a value the game already had, kept in the player's own save, shown only when
the player opens the panel, and they travel by the player choosing to paste them.
No endpoint appeared and none is wanted.

What is still not here is everything that would need one: how long a run takes,
where a player stopped coming back, anything at all about a player who never
sends a report. Those need collection rather than a paste, which means an
endpoint, an identifier and a reason to be allowed one. None of the three exists,
and the offline promise above is worth more than the numbers would be.
