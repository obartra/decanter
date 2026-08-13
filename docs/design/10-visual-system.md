# 10 · Visual system

Color and type, and the single sources that keep them consistent. What is done
with them is [06 Bottles](06-bottles.md), [08 The room](08-room.md) and
[09 The map](09-map.md).

## The liquid palette has one home

`CONFIG.palette` is the only place a liquid color is written down. The
`--c0`…`--c11` custom properties the stylesheets use are **published from it at
boot**.

This is not tidiness. When the palette lived in two places, retuning one left the
other behind: the stylesheets moved to jewel tones and the pour kept arcing the
old bright red into the new crimson bottles. It was invisible until a renderer
that read the JavaScript side drew next to elements that read the CSS side.

A test fails if a stylesheet defines a liquid color again.

## Twelve colors that stay apart

`maxColors` is 12, and from level 17 onward every level deals all of them at once. A test asserts
every pair of palette entries is far enough apart in RGB to be told apart.

It earns its place: it caught `#5B8FD6` and `#6E7FD6`, two blues 25 apart, which
would have been dealt together on every level from 17 onward. A puzzle whose
pieces cannot be distinguished is unsolvable however sound the logic is.

The same test is the constraint on ever adding a thirteenth color.

## And a second channel, for the players that is not enough for

The test above measures CIEDE2000 distance, which is how far apart two colors
look **to normal vision**. It says nothing about roughly one man in twelve.

No rearrangement fixes that. There are not twelve hues that stay distinct once
an axis of vision is gone, so a palette solved harder is still a palette, and
the answer has to be something other than color. It is texture.

`src/js/pure/07-patterns.js` holds the set, one entry per color id, off unless
the player asks for it. Four stripe orientations at two spacings, the two
crosshatches, dots, and one deliberately plain: a board where every liquid is
hatched is busier to read than one where eleven are, and something has to be the
bare one.

**Orientation first, spacing second, kind a distant third.** That is the order
things are tellable apart in at the size these are drawn — a band is about fifty
pixels across and a bubble smaller — and it is why the set is mostly stripes at
different angles rather than twelve clever textures.

**One table, two renderers.** The bands are DOM and take a CSS
`background-image`; the fluid is a canvas and takes geometry it strokes into a
repeating tile. Both come from the same entry, so a pattern cannot mean one
thing in the markup and another on the canvas. That matters more than it sounds:
the fluid is the *primary* path, since `Fluid.supported()` decides it and
`.board.simulated .fill` hides the bands, so the DOM version is the fallback and
would be the one nobody noticed was wrong.

**The other game too.** Its six colors are this palette's first six, so its six
hatches are these first six. Copied rather than imported, because the two games
share no module, and pinned by `tests/patterns.test.mjs` for the same reason the
palette copy is pinned — a red bubble and a red liquid marked differently is a
mark that has stopped meaning anything.

The ink is translucent black. The palette runs from a near white to a deep
green, so a light hatch disappears on the pale ones; black at this alpha reads
on all twelve without changing what color anything looks like.

Casks and measure have nothing here on purpose. Casks tells one gilt cask from
oak ones, which is a one-of-many lightness difference rather than a twelve-way
discrimination, and measure has a single wine.

## The rest of the color

Warm and dark, keyed to the drawn room: cream ink, dimmed ink for labels, gold and
lit gold for anything of value, and a glass line that has to stay bright enough
for an **empty** bottle to read against a nearly black backdrop. That last one is
a real constraint rather than a preference, and it moved when the room got darker.

Failure has its own register, used nowhere else: the room goes red and the panel
border and label go with it, so the state is legible before a word is read.

## Type

**Cinzel** for display and **Alegreya Sans** for interface, both shipped as
latin-subset woff2 and self-hosted. There are no network calls, so webfont
services are not an option even if they were wanted.

Cinzel is inscriptional Roman capitals, so it wants **letterspacing and
uppercase**; it is used tightened nowhere. It carries the wordmark, the numbers in
chips, the chapter names and the panel headings. Everything else is Alegreya Sans.

Font weight went **down** when these replaced the previous pair, 89KB to 60KB, so
the change cost nothing to ship.

## Motion

`prefers-reduced-motion` is honored by shortening durations to a floor rather
than removing animation, so sequences still read. Drawing is unaffected: a
rendered liquid level is not motion.
