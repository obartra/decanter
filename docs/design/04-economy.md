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
