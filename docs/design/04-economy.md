# 04 · Economy

What a run is worth, what everything costs, and the invariants that stop the
whole thing running backwards. Every number here lives in `CONFIG.economy` or
`CONFIG.stars`; none of them are written down twice.

## Stars

Pours **over** par, and they run out fast.

| Pours | |
| --- | --- |
| par | ★★★ |
| par + 1 | ★★☆ |
| par + 2 | ★☆☆ |
| par + 3 or worse | **failed** |

Par is the provable minimum (see [03 Par](03-par.md)), not a friendly target, so
there is no slack for exploring. Level 1 is par 12, which means 15 pours fails
it. That is deliberate and it is the single most aggressive number in the game;
if it needs softening, `CONFIG.stars` is the only place to change.

Two things can lower the ceiling:

- **An eased board caps the run at two stars.** Par describes the bottles the
  level dealt. Change the shelf — a seventh bottle on it, or one taken off it by
  a blast — and the board is easier than the number being scored against, so the
  third star would be measuring a different puzzle. One flag, not one per tool:
  the reason is the same either way and a run is capped once however many were
  bought. The bubble game has called this `aided` since it shipped and means
  exactly the same thing by it.
- **An inexact par is not scored at all**, and with a failing bracket in play
  that guard matters more than it used to. Why an estimate can never be scored is
  [03 Par](03-par.md).

## Failing

Sorting the bottles is not the same as clearing the level. A failed run **banks
nothing**: no gold, no best, no first-clear bonus, and the next level stays shut.

It **takes nothing away** either. An earlier clear keeps its stars, its best and
its unlock, and the one-time first-clear bonus is left unclaimed so that coming
back and actually beating the level still pays what it always would have.

A run also **ends the moment it is lost**, rather than being played out for
nothing. How that is detected and what it looks like is [05 Playing](05-playing.md).

## Gold

Deliberately thin, because the tension is the point.

| In | | Out | |
| --- | --- | --- | --- |
| 3★ | 6 | Any attempt | 5 |
| 2★ | 3 | Pay past a board | 10 |
| 1★ | 1 | Extra vessel | 45 |
| 0★ | nothing | A blast | 65 |
| First clear | 8, once ever | Undo | 3 free per level, then 8 |
| Daily draught | 12 per day | Restart | an attempt |
| | | Replay a cleared level | free |

The purse opens at **86**: one vessel away from broke. Above roughly 150 the
pressure disappears, which is the number to watch when retuning.

**Every board dealt costs the same**, whether it is a new level or another go at
one just lost. That is what gives failing a price; without it, flailing is free
and there is no reason not to. A good first clear nets 9, so playing well always
pays.

**A level already cleared replays for nothing.** The fee exists to give a failed
run a price, and a board you have beaten has no run to lose: chasing the third
star is the part worth encouraging, not taxing.

**Paying past a board** costs twice an attempt and covers dealing the next one,
so moving on is one decision rather than two charges. It buys exactly one thing:
the next level opens. Being beaten by a board is not the same as being stuck on
one, and without this a level nobody can crack is a wall with a meter on it.

**The first-clear bonus is paid once ever**, and **a replay pays only the
difference** between the rating the level already has and the one just earned.
Together those are what stop a free board being an income: five perfect replays
of a three-star level pay nothing at all, not 5 × 14 and not 5 × 6.

That is also the least guessable rule in here, so it is **quoted before the run
rather than discovered after it**. Tapping a cleared level opens a card saying
what a perfect run would pay, which was learnable only by replaying the level and
being handed a `+0`.

Where the answer is nothing, **the offer is simply not made**. A `+0` in the slot
where the winnings go dresses the best result in the game up as a refusal, and it
would do it on exactly the levels the player did best on. Saying so in words
instead is the same sentence at greater length, so the card says neither and
shows what you did.

The card and the payout are the same arithmetic, `wouldEarn` and `complete`, so
an offer of six cannot be followed by a payment of three; a test compares the
quote against the purse from every state a level can be in. The card itself is
[09 The map](09-map.md).

**A vessel costs about three well-played new levels**, so the only rescue worth
buying has to be funded on boards you have not solved yet.

## The blast, and why it is not priced like a big number

A blast destroys a bottle. It is the dearest thing in the game and deliberately
not by much, because the instinct to make it cost a fortune is wrong and the
numbers say why.

It is bought on a board that is beating you, so its competition is not the
vessel. It is **another go at 5**, and **paying past the board at 10**. Against
those, what it sells is a two star clear on a level that would otherwise stay
unbeaten — worth 3 in star gold and the 8 that has been waiting there since the
level was first dealt. So priced at `X` it costs `X − 18` more than simply
walking away from the board.

The purse opens at 86, a good level pays 14, and this document already says the
pressure disappears above roughly 150. A tool priced up there is priced above the
figure the whole economy is tuned to keep you under, and becomes an item nobody
can afford by playing. **Dear, here, means 65.** Four and a half good levels
against the vessel's three.

That number buys one thing worth more than the number itself:

> **An opening purse affords the vessel or the blast, and never both.**

86 − 45 is 41, which is under 65; 86 − 65 is 21, which is under 45. Which rescue
you can carry into a board is a decision rather than a shopping list, and that is
the tension the vessel's own price was chosen for.

**One per run**, gated the way the vessel is. A blast held across a whole save
would be worth a bigger number and would be a worse feature: it needs a field in
the save file, and it invites the oldest failure in consumables, the player who
saves it for something special and finishes the game never having pressed it.

**The game refuses a blast that could only hurt.** An empty bottle spills nothing
and costs a slot. A finished bottle undoes work already done. And a blast can
strand a board outright — take away the last thing anything could pour into and
there are no legal moves left. All three are refused in `Rules.blastTargets`,
which asks the question on a copy using the same function that ends runs, so a
target is offered only when it leaves the run alive. Sixty five gold for an
outcome worse than not pressing it is not a price, it is a trap.

## Running dry

A purse too thin to deal a board is a state this economy plans for rather than
an error: failing costs the fee and pays nothing, so anyone can be ground down,
and the draught is the floor that gets them back. That only works if the screen
says so, which for a while it did not — the frontier medallion stayed lit and
swallowed the tap, and the draught said "drawn" without saying it was coming
back. Both of those are the wrong half of the sentence to show someone who has
nothing left.

So: a board that cannot be paid for refuses the tap and shows its price, the
draught shows how long until the local midnight brings it back, and it is the
primary button whenever it is ready and nothing else can be pressed. See
[09 The map](09-map.md).

**Gold from outside the economy** exists for the beta only: a word in the query
string, `CONFIG.beta`, fills the purse so a player who has run dry in the
middle of telling us about something else does not have to wait out a day. It
guards nothing — the save is localStorage on the player's own device — so it is
written down in plain sight rather than dressed up as a lock. It is counted in
the save, because a purse nobody earned is a debugging trap otherwise, and it
comes out with the beta.

There is **a word per beta player**, and what it shouts back is the only thing
that differs between them: `CONFIG.beta.words` is that list, of the word to put
in the link and the two lines to say. `?jabarimoneeey` shouts JABARI MODE,
`?gavinmode` shouts GAVIN MODE, `?perlamarona` shouts PER LA MARONA, and all
three do everything else identically, including the sandbox below.

**Two lines, not a name and a suffix.** `Mode` used to be written into the
module, which held for exactly as long as every word was somebody's name. It is
the second line of the entry now, defaulting to `Mode` so the two that want it
still read as one word each. A word is free to shout something that is not a
name and not a mode.

Adding a player is a line of config, which is the point of holding this as data:
the alternative is a second copy of a celebration that is three seconds of very
specific animation, kept in step with the first for as long as the beta lasts.
Nothing else about the word is per player, and nothing should become so. The
words are read in the order they are written, so a link carrying two of them
shouts the first.

It **fills the purse to `economy.purseCap`** rather than paying a sum into it,
and that is what lets the word stay in the address bar. Adding stacked a second
payment on every reload, so the word had to be deleted from the URL to stop it —
which made it a link that worked once, quietly, which is not what a link is for.
Filling to a figure can be done any number of times and lands in the same place,
so the link keeps working and every load sets it off again.

`purseCap` is a **ceiling on every rise in the purse**, not just the figure the
word hands over. Without that, a player who filled the purse and kept clearing
levels walked straight past the number they were given, which is both the joke
wearing off and an eighth digit the header has no room for. Nothing earned in the
game gets near it — a good clear pays 14 — so it is a ceiling no one playing can
feel.

The amount is absurd on purpose: it is not a top-up that has to be balanced
against anything, it is the end of the economy for one save.

And it goes off rather than sliding in — a strobe, three shockwaves, three bangs,
and **JABARI MODE**, or whoever's word it was, shaking across the screen in
rainbow over a neon **+9,999,999**. The name is written into the markup on the
way up rather than sitting in it, because one block of markup serves every word.
This is the one thing in the build that is not trying to be tasteful, and it is
written that way deliberately: none of it should be borrowed for anything else
the game does. It lives in `src/js/86-jabari.js` so that
sentence is structural rather than a remark — it was a hundred lines in the
middle of the app, between the wiring and the fault handler. It is handed the
purse and one callback and knows nothing else, so it comes out with the beta by
deleting one file and one call. There is nothing to dismiss and nothing to
press, and it ignores pointers throughout, so it cannot eat a tap that was on its
way somewhere else. It takes itself away after three seconds. A cheat that
silently changed a number would be its own small version of the bug this all
started with.

The strobe is the one part that can actually hurt somebody, so `reduce` gets the
words and the number without any of the flashing.

**The bang ignores the sound setting**, which is the one place in the game
anything does. Somebody who typed a secret word into a URL has asked for it, and
a bang nobody hears is not a bang. It was reported silent for exactly this: the
player who found it plays muted, so the explosion was being swallowed by their
own preference.

**The message never waits for anything.** It is on the screen the moment the
link opens, every time, whatever the state behind it — muted, already full,
audio blocked. That is the thing the word is for.

The bang is the only part that can wait, and only because it has to. A page
nobody has touched is not allowed to make a sound — the context stays suspended
until then — and opening a pasted link is not a touch, which is precisely how
this arrives. So the noise goes off on the first touch instead. An earlier pass
made the whole celebration wait for that touch, which bought the sound at the
price of the picture.

**The wait ends with the picture.** A bang belongs to something on the screen,
so once the message has taken itself away the noise stands down with it: a tap
from then on is a tap on the map, and an explosion out of nowhere is not a
celebration.

## The invariants

Four numbers could quietly break the game, so they are pinned by tests rather
than by judgement:

- **An attempt must cost less than a clear pays**, or playing well loses money
  and the economy runs backwards.
- **A daily draught must buy several attempts**, or one bad day ends the game for
  someone with no way back.
- **Another go must stay cheaper than paying past a board**, or paying is simply
  the better play and the puzzle is decoration.
- **A vessel must cost around three good levels**, or the pressure it exists to
  create disappears.
- **A blast must be dearer than a vessel, affordable on an opening purse, and
  never affordable alongside one**, or the choice between the two rescues stops
  being a choice.

## Where this is applied

The rules here are enforced in two places and nowhere else: `rate()` decides
stars, and `40-progress.js` moves gold and unlocks. Prices are read from
`CONFIG` at the point of sale, never copied. The screens that display them are
described in [05 Playing](05-playing.md).
