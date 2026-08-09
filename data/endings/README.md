# Player reports

What players send back, one file per report. Whatever is in here is what
`npm run endings` reads and what the weekly job measures the game against.

## Getting one

Ask the player to hold the gold count for a moment, tap **Copy**, and send you
what it puts on their clipboard. Save it here as `<who>-<date>.txt`. The whole
dump is fine; the tool reads the `levels lost` section and ignores the rest.

## Why files rather than a database

The game sends nothing anywhere, so a report arrives because somebody chose to
send it. Files in the repository make that visible: what the difficulty was
judged against is in the history next to the judgement, and a claim about players
can be checked by reading the reports it came from.

If collection is ever built, it writes here too. The consumer does not change.

## What is in one

Build id, viewport, the save as a line, which tools the chapters have handed
over, the run in front of the player, the counts, the levels that have lost runs,
and the last few dozen things that happened. No name, no identifier, nothing the
player did not choose to send.
