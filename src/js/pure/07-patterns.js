/* Telling the liquids apart without relying on their color.

   The palette was solved for CIEDE2000 distance, which is a measure of how far
   apart two colors look to normal vision. It says nothing about the roughly one
   man in twelve who does not have it. The worst pair in the shipped twelve is
   25.9 apart on paper and can be the same color to a deuteranope, and no
   rearrangement of twelve hues fixes that: there are not twelve hues that stay
   distinct once a whole axis is gone.

   So the second channel is texture, and this is the one place the textures are
   written down. Both the bands, which are DOM, and the fluid, which is a canvas,
   read from here, and so does the other game. A pattern drawn two ways from one
   spec cannot drift; two tables of gradients would.

   WHAT MAKES A PATTERN TELLABLE at the size these are drawn is orientation
   first, spacing second, and kind a distant third. A band is about fifty pixels
   across and a bubble smaller, so the set is four orientations at two spacings,
   plus the two crosshatches and dots, which reads as twelve genuinely different
   surfaces rather than twelve variations on one.

   Index is the color id, so pattern 0 belongs to palette 0 and the other game's
   six are the first six of these for the same reason its palette is the first
   six of that one. Color 0 is deliberately bare: something has to be the plain
   one, and a board where every liquid is hatched is harder to read than one
   where eleven are.

   `[kind, angle, gap]`, where kind is 0 none, 1 stripes, 2 crosshatch, 3 dots. */
const PATTERNS = Object.freeze([
  [0, 0, 0],
  [1, 45, 8], [1, 135, 8], [1, 90, 8], [1, 0, 8],
  [1, 45, 16], [1, 135, 16], [1, 90, 16], [1, 0, 16],
  [2, 45, 10], [2, 0, 10],
  [3, 0, 9]
].map(Object.freeze));

/* Dark rather than light, and translucent rather than opaque. The liquids run
   from a near white to a deep green, so a light hatch vanishes on the pale ones
   and a dark one on nothing: black at this alpha reads on all twelve without
   changing which color anything looks like. */
const INK = 'rgba(0,0,0,.34)';
const THICK = 3;

/* One pattern as a CSS background-image, for the DOM bands.

   Returned as a string rather than applied, because this file may not touch the
   document: see the pure folder rule in CLAUDE.md. */
export function cssFor(color){
  const [kind, angle, gap] = PATTERNS[color] || PATTERNS[0];
  if (!kind) return 'none';
  const stripe = a => `repeating-linear-gradient(${a}deg,${INK} 0 ${THICK}px,transparent ${THICK}px ${gap}px)`;
  if (kind === 1) return stripe(angle);
  if (kind === 2) return `${stripe(angle)},${stripe(angle + 90)}`;
  return `radial-gradient(${INK} 1.6px,transparent 1.7px) 0 0/${gap}px ${gap}px`;
}

/* The same pattern as marks on a tile, for the canvases.

   Geometry rather than drawing, for the same reason: what comes back is the
   tile's size and the lines to stroke inside it, and whichever renderer asked
   does the stroking. Dots come back as a circle instead, because a dot drawn as
   a very short line is a square. */
export function tileFor(color){
  const [kind, angle, gap] = PATTERNS[color] || PATTERNS[0];
  if (!kind) return null;
  if (kind === 3) return { size: gap, ink: INK, dot: 1.6 };
  const angles = kind === 2 ? [angle, angle + 90] : [angle];
  /* Drawn across a square of the gap's size and repeated, so a line has to leave
     the tile where the next copy picks it up. Two passes offset by the tile
     carry the diagonals over the corners, which a single line through the middle
     does not: it leaves a gap at every seam. */
  const lines = [];
  for (const a of angles){
    const r = (a * Math.PI) / 180;
    const dx = Math.cos(r), dy = Math.sin(r);
    for (const off of [-gap, 0, gap]){
      lines.push({ x1: -dy * off - dx * gap * 2, y1: dx * off - dy * gap * 2,
                   x2: -dy * off + dx * gap * 2, y2: dx * off + dy * gap * 2 });
    }
  }
  return { size: gap, ink: INK, width: THICK, lines };
}
