# 09 · The map

Getting between levels. Geometry, the road, chapters, and what is open.

## Geometry lives on its own

`MapGeom` holds the layout maths and nothing else: node positions, canvas height,
the path through them, and how far ahead to show. No DOM, no state. That is what
lets it be tested directly, which matters because the failures here are geometric
and would otherwise only be visible by eye.

The tests assert the properties that actually matter rather than exact
coordinates: one node per level, climbing steadily, winding side to side without
leaving the column, nodes far enough apart to tap, narrow screens shrinking the
swing rather than overflowing, and the canvas being tall enough to contain every
node.

## What you can see

The frontier plus `CONFIG.lookahead` levels beyond it, so there is always a hint
of road ahead. Three further **ghost points** continue the path past that, purely
so the road and the trail have somewhere to fade out to rather than stopping at
the last node.

## The road

Strokes along a curve read as a ribbon, however many are stacked. A road reads as
a road because it is made of stones, so it is: courses laid across the path,
offset every other row, each stone turned to the local tangent with its own size,
tone, lit top edge and seam beneath. Moss creeps in from the verges and loose
pebbles sit on the surface.

The stones are placed by **walking the path itself** with `getPointAtLength`,
rather than by recomputing the curve. That is the same guarantee the shelf has in
[08 The room](08-room.md): the decoration is derived from the gameplay geometry,
so it cannot drift off the medallions.

It is drawn to a canvas **inside the scrolling map**, so it travels with the
nodes.

The far end fades along the path's own **length**, not at a fixed height. A height
cutoff sits off screen on a map that scrolls, which is why an earlier version
stopped dead wherever the ghost points ran out. The earth bed is erased with the
stones so it does not outlive what is laid on it.

## Nodes

A node per **stop**, and a stop is not the same thing as a level. The road used
to be the levels — the nth place was level n, and the whole map worked in level
numbers because the index and the level were one number wearing two hats. A
cellar door stands between the last board of one chapter and the first of the
next, so `MapGeom.stops` is the one list that says what is where, and everything
that puts something on the road reads it rather than doing the arithmetic again.
Two places working that out is how a medallion ends up under the wrong number.

Levels: cleared ones tinted by their chapter and showing their stars, the current
one a lit brass medallion with a slow beacon, locked ones dark. The current level
is scrolled into view on entry.

**A door is drawn as a gate, not as another stone.** Square where a medallion is
round, wider than it is tall, and carrying the name of the chapter behind it
instead of a number — a number there would read as a level and send somebody
looking for it. Four states: waiting (the chapter before it is finished, so it
glows), opened (stands aside, keeps the chapter's tint), far (seen a chapter
early in the lookahead, plainly not yet), and priced.

**A priced door is one board away, and the board is what is priced.** From the
last board of a chapter the only thing between the player and the gate is that
board, and a board can be paid past wherever it is met, so the offer stands on
the door, arming on the first tap and paying on the second, exactly as a locked
medallion does. The price is the same one the end-of-run panel's Move on takes,
asked of the app rather than worked out here. What it buys is the walk up to the
gate: the frontier moves one board and stops. The gate itself has no price and
cannot be given one, because a door that can be bought is a toll and the whole
argument for the door is that it is not one.

It is lit but it does not beacon. The beacon means "your turn", and while the
board below is still there, the turn is the board. The price sits above the gate
because the chapter's name is already under it.

What a tap does is the app's business, the same as picking a level, but the two
taps a door can take are told apart at the map rather than inferred later: a
payment worked out from which state the map happened to be drawing is how a
purse gets charged twice. See [17 The Cellar Door](17-casks.md).

**A node that cannot be paid for refuses the tap and shows the price.** Every
board dealt costs an attempt, and a purse too thin to cover one is a state the
economy plans for rather than an error: the daily draught is the way back, and
[04 Economy](04-economy.md) pins the draught at several attempts so it always
is. What the map must not do is keep the medallion lit and beaconing and then
quietly drop the tap, which is what it did — it looked playable and behaved
locked, and the only screen that said why was the end-of-run panel the player
had already left. So the node dims, stops pulsing, carries the fee the way a
buyable one carries its price, and the draught below it goes primary.

The map asks the app what a board costs rather than working it out from
`CONFIG`. Prices are decided in one place, and a second copy on the map is how
the two drift. For the same reason the medallions are redrawn whenever gold
moves on this screen: it is the purse that decides which of them can be dealt.

## Going back to a level

A medallion for a level **already cleared** does not deal a board. It opens a
card, and the card is the only screen that can answer what is left in that
level.

The medallion cannot. It is fifty pixels of circle with room for a number and
three stars, and the three things worth knowing before going back do not fit on
it: which board this was, how well it went, and what another run would pay.

That last one is the reason the card exists rather than being a nicety in front
of a button. A level pays the **difference** between the rating it already has
and the one you earn, so a third star on a two-star board is worth three gold and
a perfect run on a board already at three stars is worth nothing at all. See
[04 Economy](04-economy.md). Nothing else in the game says so, and the only way
to find out was to replay the level and be handed a `+0`, by which point the
answer had cost a run. The card says it before the run instead, and says it in
the same figure the payout will use: `progress.wouldEarn` and `complete` are the
same arithmetic, pinned by a test that compares the quote against the purse.

Where there is nothing to offer, the card **makes no offer**: the winnings row
goes, and so does the line under it that would have named a third star. Three
stars is the best result in the game, and a nought in the winnings slot gives it
the shape of a refusal; announcing the absence in words is the same refusal at
greater length, and the star row has already said it. What is left is what you
did and the way back in.

**A level not yet cleared is still dealt on the tap.** It has no record to show,
and a card with a picture and three blanks under it is an extra tap in front of
a button that already worked.

### The still

The small board on the card is **dealt, not drawn**. Levels are deterministic, so
level 47 is the same board for everyone forever, and a still that is the real
board is what makes "which one was 47" answerable. Nobody remembers a level by
its number, they remember it by the two greens buried under the pink. It is the
same rule the road follows: decoration derived from the real thing cannot drift
off it, and a picture of a board the level does not deal would be believed.

The same drawing serves the shelf the blast offers when a run has been lost, in
[05 Playing](05-playing.md). It did not: that shelf drew its own bottles, with
every band taking an equal share of the glass however much was in it, so a bottle
holding one unit and a bottle holding four were the same picture on the one
screen whose only question is which bottle to destroy.

A bubble level shows the board its run opens on. That board is dealt from the
run's own random stream, which everything after it continues from, so a still
cannot borrow that stream without moving it; it is dealt from a fresh stream
seeded the same way, which produces the same board. The bubble game hands over
rows of colors rather than a board, because the coupling between the two games
is one object and this does not widen it.

## What is open

`unlocked` is a single number: the highest level that may be played. It advances
when a level is **cleared with at least one star**, and can also be bought
outright, which is an economy decision documented in
[04 Economy](04-economy.md).

A failed run does not advance it. That is the whole reason paying past a board
exists, since otherwise a level nobody can crack ends the game.

**But `unlocked` is not on its own the answer to "may I play this".** A chapter
is entered through the cellar door in front of it, so a level inside a chapter
whose door is shut is refused however far the frontier has run — and a medallion
in that state says which chapter is still behind its door rather than just
"locked", because that one the player can do something about right now, and what
they can do is one node further down the road. Paying past a board is refused
there too: a shut door is not a board you cannot beat, and a purse charged for
one would come away holding a level it still could not enter.

## Chapters

Sections of ten, named and tinted from `CONFIG`, with a label drawn across the map
at each boundary. The label is presentational; what a chapter IS is
[02 Levels](02-levels.md), and what it takes to get into one is
[17 The Cellar Door](17-casks.md).
