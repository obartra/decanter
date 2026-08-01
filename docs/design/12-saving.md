# 12 · Saving

One key in `localStorage`, holding everything the game remembers. What the
numbers inside it mean is [04 Economy](04-economy.md).

## What is stored

`decanter.save.v1`, a single JSON object:

| | |
| --- | --- |
| `version` | the schema version, currently 1 and never yet needed |
| `unlocked` | the highest level that may be played |
| `stars` | best star count per level |
| `best` | fewest pours per level |
| `pars` | pars discovered at runtime, only ever exact ones |
| `claimed` | levels whose one-time first-clear bonus has been paid |
| `gold` | the purse |
| `dailyOn` | the local day the draught was last drawn |
| `sound` | the sound preference |

Nothing about the current level is stored. A level in progress is not resumable
by design: it is deterministic and cheap to re-deal, and persisting a half-played
board would mean persisting the move history, the undo count and the vessel state
to keep the economy honest.

## Storage is injected

`createProgress(storage)` takes its backend as an argument, defaulting to a probed
`localStorage` that falls back to an in-memory map when it throws. Sandboxed
previews and some privacy modes throw on the first write rather than on read, so
the probe writes and removes a key rather than trusting feature detection.

The injection is also what lets the whole economy be tested without a browser.

## Migration by merge

A save is loaded by merging it over a blank one: `Object.assign(blank(), parsed)`.
Any key added later is simply absent from an old save and picks up its default.

That is how gold arrived without a version bump or a migration step, and a test
loads a save written before gold existed and asserts it comes back with a full
starting purse and its progress intact.

## Surviving a bad save

Everything that could poison the game is checked on load rather than trusted:

- unparseable JSON falls back to a blank save
- a non-integer or negative `unlocked` resets to 1
- a missing, negative or non-finite `gold` resets to the starting purse
- a `claimed` that is not an object is replaced

The last two are not hypothetical paranoia: a corrupt `claimed` would otherwise
throw on the first level completion, and a `NaN` balance would silently make every
purchase fail with no explanation. A test writes deliberately broken saves and
asserts the game opens normally.

Writes are wrapped, so a full or unavailable quota loses the save rather than the
session.

## Spending is all or nothing

`spend()` refuses when the balance will not cover it and takes nothing. A partial
debit would leave someone paying for a rescue they did not get, which is the worst
possible failure in a game with a thin purse.
