/* Drawing. Reads state, never changes it.

   Bubbles are drawn a little over half a diameter so neighbors overlap
   slightly. A bubble drawn at exactly half leaves a hairline between touching
   cells, and the eye reads that hairline as a gap a shot could pass through,
   which the physics will not allow. Better for the art to promise slightly less
   than the rules deliver than slightly more. */
import { BubbleConfig } from './pure/00-config.js';
import { BubbleGrid } from './pure/20-grid.js';

export const BubbleRender = (() => {
  const C = BubbleConfig;
  const G = BubbleGrid;

  /* The rim of the glass and the body behind it, in the other game's terms: its
     bottles are a warm cream line (--glass-line) over a dark warm well, and a
     sphere built the same way reads as the same material without either file
     knowing about the other. */
  const GLASS_RIM = 'rgba(246,234,212,.42)';
  const GLASS_BODY = 'rgba(20,14,8,.55)';

  /* A glass sphere with liquid in it, rather than a colored ball.

     The difference is that the color is not the surface. The glass is drawn
     first and dark, the liquid sits inside it and stops short of the rim, and
     the two highlights on top belong to the glass rather than to the liquid: one
     long band down the left and one specular where the light actually lands.
     That is the same three-part construction the bottles use, and it is what
     stops a pale liquid reading as a flat disc. */
  /* The hatch, drawn on the bubble rather than tiled under it.

     The pour game tiles a pattern across a band fifty pixels wide and it reads.
     A bubble is half that and round, and the same tile came out as a smear: at
     three pixels of stroke on an eight pixel tile, most of a bubble is ink and
     none of it is a direction. What reads at this size is a few bold marks
     placed on the disc itself, so that is what this draws.

     Same table as the bands, so a red bubble and a red liquid are marked the
     same way; only the drawing differs, because the surfaces do. */
  function hatchDisc(ctx, x, y, r, i){
    const spec = C.PATTERNS[i];
    if (!spec || !spec[0]) return;
    const [kind, angle] = spec;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    /* Light, where the bands use dark. The liquids in the pour game are pale to
       mid and a dark hatch reads on all twelve; a bubble is a lit sphere shaded
       to a deep edge, so the same dark hatch disappears into it. What separates
       a mark from a bubble here is that the mark is brighter than the glass.

       And one mark, not a field of them. Two chords across a disc this size stop
       being stripes and become a wash: the bubble goes pale and the direction,
       which is the only thing worth reading, goes with it. */
    ctx.strokeStyle = 'rgba(255,255,255,.72)';
    /* A fraction of the bubble and nothing else. This carried a `Math.max(1.4,
       ...)` floor, which reads as "never thinner than 1.4 pixels" and is not:
       this canvas is drawn in board units and scaled up, so the floor was 1.4
       UNITS, wider than the bubble it was marking. Every attempt to tune the
       hatch moved a number the floor was already overriding, which is why it
       painted the whole disc whatever it was set to. */
    ctx.lineWidth = r * 0.17;
    ctx.lineCap = 'butt';
    if (kind === 3){
      /* dots read better as one plain spot than as a field of small ones */
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const angles = kind === 2 ? [angle, angle + 90] : [angle];
      /* three chords across the disc, which is as many as stays legible */
      for (const a of angles){
        const rad = (a * Math.PI) / 180;
        const dx = Math.cos(rad), dy = Math.sin(rad);
        for (const off of [0]){
          ctx.beginPath();
          ctx.moveTo(x - dy * off - dx * r, y + dx * off - dy * r);
          ctx.lineTo(x - dy * off + dx * r, y + dx * off + dy * r);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function bubble(ctx, x, y, color, r = C.DRAW_R, alpha = 1){
    ctx.globalAlpha = alpha;

    ctx.fillStyle = GLASS_BODY;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    /* the liquid, lit from the upper left and deepening to the far side */
    const lr = r * 0.85;
    const g = ctx.createRadialGradient(x - lr * 0.34, y - lr * 0.4, lr * 0.06, x, y, lr);
    g.addColorStop(0, shade(color, 0.5));
    g.addColorStop(0.42, color);
    g.addColorStop(1, shade(color, -0.5));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, lr, 0, Math.PI * 2);
    ctx.fill();

    /* The index is looked up rather than passed, because the color arrives as a
       hex at five call sites and threading an index through all of them to read
       a six entry array is more change than the lookup costs. */
    if (document.body.classList.contains('cb')) hatchDisc(ctx, x, y, lr, C.PALETTE.indexOf(color));

    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.44, y - r * 0.04, r * 0.08, r * 0.26, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,232,.55)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.29, y - r * 0.45, r * 0.23, r * 0.12, -0.5, 0, Math.PI * 2);
    ctx.fill();

    /* the rim, so a sphere against a sphere of a near color still reads as two */
    ctx.lineWidth = r * 0.08;
    ctx.strokeStyle = GLASS_RIM;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.96, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  function shade(hex, amount){
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c : 255 - c) * amount)));
    return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
  }

  function board(ctx, b){
    for (const [j, c] of G.occupied(b)){
      const p = G.centerOf(b, j, c);
      bubble(ctx, p.x, p.y, C.PALETTE[b.rows[j][c] % C.PALETTE.length]);
    }
  }

  /* The path, as far as the guide is allowed to show it. Dots rather than a
     line, and stopping short, because a guide that draws the whole path to the
     landing cell turns aiming into reading a readout. It fades along its length
     so the end of it does not look like a promise. */
  function guide(ctx, points, color, phase){
    let drawn = 0, bounces = 0;
    for (let i = 1; i < points.length && drawn < C.GUIDE_LEN; i++){
      const a = points[i - 1], b2 = points[i];
      const len = Math.hypot(b2.x - a.x, b2.y - a.y);
      if (len < 1e-6) continue;
      const ux = (b2.x - a.x) / len, uy = (b2.y - a.y) / len;
      /* Bounded by the guide's length as well as by the segment's. A segment can
         be far longer than the guide is allowed to draw, and without the second
         bound the taper runs past the end of its own scale and asks for a
         negative radius, which throws and takes the frame loop with it. */
      for (let s = (phase % C.GUIDE_DOT_GAP); s < len && drawn + s < C.GUIDE_LEN; s += C.GUIDE_DOT_GAP){
        const t = Math.max(0, Math.min(1, (drawn + s) / C.GUIDE_LEN));
        ctx.globalAlpha = 0.9 - 0.65 * t;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(a.x + ux * s, a.y + uy * s, C.GUIDE_DOT_R * (1 - 0.8 * t), 0, Math.PI * 2);
        ctx.fill();
      }
      drawn += len;
      if (++bounces > C.GUIDE_BOUNCES_DRAWN) break;
    }
    ctx.globalAlpha = 1;
  }

  function walls(ctx){
    ctx.strokeStyle = 'rgba(246,234,212,.12)';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(0.02, 0); ctx.lineTo(0.02, C.WORLD_H);
    ctx.moveTo(C.WORLD_W - 0.02, 0); ctx.lineTo(C.WORLD_W - 0.02, C.WORLD_H);
    ctx.moveTo(0, 0.02); ctx.lineTo(C.WORLD_W, 0.02);
    ctx.stroke();

    /* the line the board must not reach, drawn where it actually is */
    const y = 0.5 + C.ROW_H * C.DEATH_ROW;
    ctx.strokeStyle = 'rgba(226,84,111,.42)';
    ctx.lineWidth = 0.03;
    ctx.setLineDash([0.22, 0.18]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(C.WORLD_W, y); ctx.stroke();
    ctx.setLineDash([]);
  }

  /* Where the hint says to put it. A ring on the empty cell rather than a line
     from the muzzle, because the answer the player wants is "there", and drawing
     the path as well would hand over the aim too and leave nothing to do. */
  function target(ctx, board, cell, now){
    if (!cell) return;
    const p = G.centerOf(board, cell.j, cell.c);
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    ctx.strokeStyle = `rgba(244,217,160,${0.35 + 0.4 * pulse})`;
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.arc(p.x, p.y, C.DRAW_R * (0.82 + 0.16 * pulse), 0, Math.PI * 2);
    ctx.stroke();
  }

  function muzzle(ctx, aim){
    const m = C.MUZZLE;
    ctx.strokeStyle = 'rgba(224,177,92,.3)';
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 0.78, 0, Math.PI * 2);
    ctx.stroke();
    if (!aim) return;
    ctx.strokeStyle = 'rgba(244,217,160,.5)';
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x + aim.x * 0.95, m.y + aim.y * 0.95);
    ctx.stroke();
  }

  /* What marks a bomb, drawn over the dark bubble that carries it.

     A separate primitive rather than a seventh palette entry, and that is the
     whole point of it: everything else in here turns a color index into a css
     color, and a bomb is not a color. Giving it one would put a value into
     the palette that the board, the deal and the falling debris could all
     reach, and any of them drawing it would mean a bubble nobody can match.

     A ring and a lit spark that runs round it, so the thing in hand reads as
     armed rather than as a bubble that came out badly. Time comes in from the
     caller, because nothing in this file is allowed its own clock. */
  function fuse(ctx, x, y, now){
    const r = C.DRAW_R * 0.58;
    ctx.strokeStyle = 'rgba(255,196,120,.85)';
    ctx.lineWidth = 0.055;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    const a = (now / 420) % (Math.PI * 2);
    ctx.fillStyle = '#FFD79A';
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 0.075, 0, Math.PI * 2);
    ctx.fill();
  }

  return { bubble, board, guide, walls, muzzle, target, fuse };
})();
