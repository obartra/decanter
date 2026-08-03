# 08 · The room

The backdrop is drawn at runtime, not shipped as an image. This document covers
the cellar behind the board and the moss behind the map. The road on the map is
[09 The map](09-map.md), because it derives from the map's own geometry.

## Why it is drawn

The backdrops used to be painted images. They were a fixed size, so their shelf
line landed wherever the viewport happened to put it, and the bottles stood **in
front of** a shelf rather than on one. Nothing could fix that from the outside: an
image cannot know where the grid put the bottles.

So the board reports where every row of bottles ended up, and the shelving is
built underneath. The alignment is exact at any size by construction rather than
approximately right at one, and a two-row phone layout gets two planks, which a
single image never could.

The images also cost 9.3MB of source and 420KB shipped. The drawn room costs
nothing, and the whole app is now smaller than the art used to be.

## Color

Sampled from the reference art before it was deleted, so the drawn room inherits
the painted one's palette: near black at the top through warm browns to a glow at
the base, candlelight at `#D59738`, and the moss from `#151A0B` to `#868552`.

## What it is made of

A vertical gradient, boards on the back wall to stop it reading as a gradient, a
candle pooling off to one side, jars and demijohns silhouetted further back, then
per row: brackets, a plank with a bevelled front edge so the wood has thickness,
grain, drips, cobwebs in the corners, and dust in the light. Below the lowest
plank is cabinet rather than more room.

Everything is seeded, so it is the same room on every visit, and it is redrawn
only when the size or the shelf positions change.

## Depth

The bottles being played were reading as part of the background, because they
were: the clutter behind them showed straight through translucent glass, so
everything sat on one plane. Two things fix it, and both need geometry from the
board.

- **The room steps back behind each row.** A darker pocket sits directly behind
  the playable bottles so nothing competes through the glass.
- **Every bottle gets a contact shadow** where it meets the plank. This is the cue
  that does the real work: a bottle with a shadow under it is standing on
  something.

For the second one the board reports the **footprint of every bottle**, not just
the height of the row.

## Following the window

The backdrop listens for `resize` and `orientationchange`, and refuses to cache a
zero-sized draw.

That guard exists because of a real failure: it drew once at whatever size the
page happened to be during boot, which on a first paint can be nothing at all, and
then never again. The whole reason for drawing the room instead of loading one is
that it fits the viewport it is in, so a room that does not follow the window is
worse than the image it replaced.
