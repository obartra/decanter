# 06 · Bottles and liquid

How a bottle and its contents are drawn, standing still and while being tipped.
What happens during a move is [07 The pour](07-pour.md).

## The split: glass is DOM, liquid is canvas

Each bottle is a DOM button carrying its collar, glass, sheen, gloss and, when
finished, a cork. The **liquid** is drawn to a single canvas sitting behind all of
them, as the board's first child.

That order is the point: the glass and its highlights sit **over** the liquid, so
reflections read across color boundaries and the bottle feels like a container
rather than a colored rectangle.

The DOM still contains the color bands, rendered transparent whenever the canvas
renderer is active. They are the **fallback**: if a canvas context cannot be had,
the board is never marked as simulated, the bands stay visible, and they are the
liquid. Geometry is measured from the glass element, not from them.

## The liquid is a mask, not a simulation

The shape of the glass is the clip, and the surface is a **horizontal line in
world space**. A tipping bottle turns its clip and leaves the line alone, so the
liquid stays level while the glass rotates around it, without that having to be
arranged.

This is the standard way liquid in a container is done, and everything follows
from the clip: liquid is only ever drawn **through** a glass, so liquid outside a
glass has no representation. It is not a case that is handled, it is a case that
cannot be written down. A test fails if the notion of homeless liquid ever comes
back.

For an upright bottle the fill line is arithmetic. For a tipped one the glass is a
rotated quad and the line is still horizontal, so the level is whichever height
leaves the right **area** underneath it, found by bisection: a dozen polygon clips
per band, exact rather than approximated.

## Following the glass

Any transform on a bottle moves its glass, and all of them must move the liquid:
pouring tips it, selecting lifts it 20px, sealing bounces it. The renderer reads
the computed transform of **every** bottle each frame.

An earlier version watched only the bottle that was pouring, which left a slab of
liquid standing below a lifted bottle and showing above the rim of a bouncing one.
Geometry is measured from **offsets**, not bounding rects, because offsets are
layout values and ignore transforms: measuring the transformed rect baked the lift
into the rest position and then applied it again.

The clip is the glass **outline**, rounded corners included. A square clip let
liquid fill the corners the glass curves away from, which read as a hard-edged
block above the shoulder and below the base. The corners are 30% of the bottle's
width, so this was not subtle.

## What it replaced

The first attempt ported a particle fluid: position-based dynamics, density
relaxation, metaballs, adapted from a demo that poured one fixed bottle into one
fixed neighbor forever. It produced, in order: liquid that stayed behind when its
bottle moved, hard-edged slabs where a square clip met a rounded glass, droplets
sprayed across the room, and a rectangle of color hanging in mid air.

Every one of those was **liquid in flight**. Liquid that belongs to no container
needs its own aim, its own clip and its own culling, and getting any of the three
wrong puts it somewhere it should never be. The mask does not create that state at
all, which is why 560 lines became 294 and the entire class of defect went with
them.

## Sealing

When a bottle fills, a cork plugs it. The plug lives inside the `.glass` element,
which has `overflow: hidden`, so it is genuinely clipped by the bottle and slides
down into the neck with only the head showing above the rim. An earlier version
floated the whole cork above the bottle and read as a hat.

The seal also fires a light ring, a sheen sweep, a small jolt and a confetti burst
in the bottle's own color.
