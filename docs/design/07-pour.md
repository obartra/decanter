# 07 · The pour

What happens on screen when a move is made, and the queue that sequences it. What
liquid looks like is [06 Bottles and liquid](06-bottles.md).

## The signature moment

The pour carries the most detail of anything here, because it is the thing the
player does hundreds of times.

- The bottle **lifts, then tilts** in a second motion. One combined move read as a
  slide rather than a lift and a tip.
- It stops **beside** the target rather than over it, so the liquid arcs across.
- The stream is an SVG ribbon sampled along a quadratic Bézier, **wide at the lip
  and narrowing as it falls**. A falling stream narrows under gravity; an earlier
  version widened downward and looked wrong for reasons that were hard to name.
- The leading edge **falls** over about 190ms rather than appearing at full length.
- A **bead** sits on the lip so the stream visibly leaves the bottle instead of
  starting in mid air.
- At the end the **tail detaches** from the lip and falls away.
- The impact point ripples and tracks the rising surface, and droplets bounce.

## Why the stream is drawn and not simulated

It was simulated, four times, and was wrong in a different way each time:
unclipped particles over the whole room, a corridor clip that cut through the row
above, a stream that was thrown rather than aimed, and finally a stream so dense
it welded into a solid rectangle.

They were all the same mistake. Liquid in flight belongs to no glass, so it needs
bespoke aim, clipping and culling, and this is not how games draw a pour anyway:
they draw a tapering path from spout to target. The ribbon does that and always
did.

So the sim puts nothing in the air. The stream is the ribbon; the liquid's level
falls in the source and rises in the target alongside it. The level only starts
moving once the bottle has finished tipping, rather than while it is still on its
way over.

## The queue

Logic resolves on tap and animation trails behind, so a player can keep pouring
without waiting. `drain()` walks the queue, awaiting each animation and then
catching the view up to the logic.

This loop owes the player two things, and both were learned the hard way:

**It must always let go of `running`.** Undo and Restart are disabled while a pour
is in flight, so a drain that dies halfway strands the level with no way out but a
reload. It is wrapped in `try/finally`, and a single failed animation is caught
per move rather than breaking the loop.

**It must always leave the view where the logic already is.** Even when an
animation is dropped, the move is still applied to the view and rendered, so a
lost frame cannot desynchronise the board from the game.

## Frame loops that a hidden tab cannot stall

`requestAnimationFrame` stops firing in a tab that is not rendering. Every frame
loop therefore runs through a helper that keeps a **timer as a floor**: timers
still fire when hidden, so the animation jumps to its end state instead of
hanging.

Without it, one tap followed by a screen lock parked the loop forever. `running`
was never released, the board froze with the counter ahead of it, Undo and Restart
stayed dead, and the only way out was a reload. On a phone that is a completely
ordinary sequence of events.

The same reasoning covers the liquid's own transfer, which is backstopped by a
timer for exactly the same reason.

## Reduced motion

Under `prefers-reduced-motion` every sleep in the sequence drops to a 60ms floor,
so the pour still reads but does not linger. The policy this follows, and why it
shortens rather than removes, is [10 Visual system](10-visual-system.md).
