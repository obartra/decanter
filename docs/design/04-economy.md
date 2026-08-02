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

- **A bought vessel caps the run at two stars.** Par describes the bottles the
  level dealt. Put a seventh on the shelf and the board is easier than the number
  being scored against, so the third star would be measuring a different puzzle.
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
| 0★ | nothing | Undo | 3 free per level, then 8 |
| First clear | 8, once ever | Restart | an attempt |
| Daily draught | 12 per day | | |

The purse opens at **86**: one vessel away from broke. Above roughly 150 the
pressure disappears, which is the number to watch when retuning.

**Every board dealt costs the same**, whether it is a new level or another go at
one just lost. That is what gives failing a price; without it, flailing is free
and there is no reason not to. A good first clear still nets 9 and a three-star
replay nets 1, so playing well always pays.

**Paying past a board** costs twice an attempt and covers dealing the next one,
so moving on is one decision rather than two charges. It buys exactly one thing:
the next level opens. Being beaten by a board is not the same as being stuck on
one, and without this a level nobody can crack is a wall with a meter on it.

**The first-clear bonus is paid once ever.** This is what stops a cleared level
being farmed: replaying pays stars only. Five perfect replays pay 5 × 6, not
5 × 14.

**A vessel costs about three well-played new levels**, so the only rescue worth
buying has to be funded on boards you have not solved yet.

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
string, `CONFIG.beta`, tops the purse up so a player who has run dry in the
middle of telling us about something else does not have to wait out a day. It
guards nothing — the save is localStorage on the player's own device — so it is
written down in plain sight rather than dressed up as a lock. It is counted in
the save, because a purse nobody earned is a debugging trap otherwise, and it
comes out with the beta.

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

## Where this is applied

The rules here are enforced in two places and nowhere else: `rate()` decides
stars, and `40-progress.js` moves gold and unlocks. Prices are read from
`CONFIG` at the point of sale, never copied. The screens that display them are
described in [05 Playing](05-playing.md).
