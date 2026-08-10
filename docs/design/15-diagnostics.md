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

## Asking, rather than waiting to be told

The panel above is opened by holding the gold count. Nobody discovers that by
accident, and going looking for it is a strange thing to do while losing, so
everything here depended on a player already knowing it existed and choosing to
use it. That is a thin channel for the one thing the game most wants to hear.

So the game watches the signal it already has. When a level has taken **five
losses, counting a dead end as two**, the end-of-run panel offers a line under
the buttons: *This one is giving you trouble. Send a report.* Tapping it opens
the same card, which already knows how to copy itself.

**Why a dead end counts double.** Both are failures and both are in the same
tally, but running out of legal pours is the kind no amount of care avoids, and
it is the kind the board selection is measured against in
[02 Levels](02-levels.md). Three of those is as much of a signal as five ordinary
losses.

**Why five.** The fee makes a board expensive before it makes it interesting: an
attempt costs 5 gold against 14 for a good clear, so five failures is most of a
level's earnings spent on one board. Below that a player is playing. At that
point they are stuck.

**Once.** It is marked as asked when the card opens, not when anything is sent,
because the game cannot tell those apart and it does not matter: the offer was
made and the player decided. An offer that returns every time is not an offer.
The mark is cleared by a `layout` bump along with the counts, so somebody stuck
on the old level 19 is asked again if the new one beats them too.

**It still sends nothing.** This changes when the card is put in front of a
player, not what the card does. There is no endpoint, and adding one was
considered and dropped: the collection SDKs cost more than the whole critical
path budget, and the honest version of them costs a consent dialog, an
identifier and the guarantee above, to learn something a player will tell you
directly when asked at the right moment.

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
