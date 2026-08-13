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
  /* One CanvasPattern per color, built once. Same reasoning as the pour game's
     fluid: a tile is a few strokes and rebuilding it every frame for every
     bubble is those strokes sixty times a second, for a thing that never
     changes. Off unless the page has asked for it. */
  const tiles = new Map();
  function hatch(i){
    if (!document.body.classList.contains('cb')) return null;
    if (tiles.has(i)) return tiles.get(i);
    const [kind, angle, gap] = C.PATTERNS[i] || C.PATTERNS[0];
    let pat = null;
    if (kind){
      const t = document.createElement('canvas');
      t.width = t.height = gap;
      const tc = t.getContext('2d');
      tc.strokeStyle = 'rgba(0,0,0,.34)';
      tc.lineWidth = 3;
      tc.translate(gap / 2, gap / 2);
      const r = (angle * Math.PI) / 180, dx = Math.cos(r), dy = Math.sin(r);
      for (const off of [-gap, 0, gap]){
        tc.beginPath();
        tc.moveTo(-dy * off - dx * gap * 2, dx * off - dy * gap * 2);
        tc.lineTo(-dy * off + dx * gap * 2, dx * off + dy * gap * 2);
        tc.stroke();
      }
      pat = tc.createPattern(t, 'repeat');
    }
    tiles.set(i, pat);
    return pat;
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
    const pat = hatch(C.PALETTE.indexOf(color));
    if (pat){
      ctx.save();
      ctx.clip();
      ctx.fillStyle = pat;
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.44, y - r * 0.04, r * 0.09, r * 0.4, -0.2, 0, Math.PI * 2);
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
