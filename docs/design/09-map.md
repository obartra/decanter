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

A node per level: cleared ones tinted by their chapter and showing their stars,
the current one a lit brass medallion with a slow beacon, locked ones dark. The
current level is scrolled into view on entry.

## What is open

`unlocked` is a single number: the highest level that may be played. It advances
when a level is **cleared with at least one star**, and can also be bought
outright, which is an economy decision documented in
[04 Economy](04-economy.md).

A failed run does not advance it. That is the whole reason paying past a board
exists, since otherwise a level nobody can crack ends the game.

## Chapters

Sections of ten, named and tinted from `CONFIG`, with a label drawn across the map
at each boundary. They are presentational only; what they are is
[02 Levels](02-levels.md).
