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
