/* Drawing. Reads state, never changes it.

   Bubbles are drawn a little over half a diameter so neighbours overlap
   slightly. A bubble drawn at exactly half leaves a hairline between touching
   cells, and the eye reads that hairline as a gap a shot could pass through,
   which the physics will not allow. Better for the art to promise slightly less
   than the rules deliver than slightly more. */
const BubbleRender = (() => {
  const C = BubbleConfig;
  const G = BubbleGrid;

  function bubble(ctx, x, y, colour, r = C.DRAW_R, alpha = 1){
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x - r * 0.32, y - r * 0.38, r * 0.05, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.22, colour);
    g.addColorStop(1, shade(colour, -0.34));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    /* a rim, so a bubble against a bubble of a near colour still reads as two */
    ctx.lineWidth = r * 0.09;
    ctx.strokeStyle = shade(colour, -0.5);
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
      const p = G.centreOf(b, j, c);
      bubble(ctx, p.x, p.y, C.PALETTE[b.rows[j][c] % C.PALETTE.length]);
    }
  }

  /* The path, as far as the guide is allowed to show it. Dots rather than a
     line, and stopping short, because a guide that draws the whole path to the
     landing cell turns aiming into reading a readout. It fades along its length
     so the end of it does not look like a promise. */
  function guide(ctx, points, colour, phase){
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
        ctx.fillStyle = colour;
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
    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(0.02, 0); ctx.lineTo(0.02, C.WORLD_H);
    ctx.moveTo(C.WORLD_W - 0.02, 0); ctx.lineTo(C.WORLD_W - 0.02, C.WORLD_H);
    ctx.moveTo(0, 0.02); ctx.lineTo(C.WORLD_W, 0.02);
    ctx.stroke();

    /* the line the board must not reach, drawn where it actually is */
    const y = 0.5 + C.ROW_H * C.DEATH_ROW;
    ctx.strokeStyle = 'rgba(223,74,99,.35)';
    ctx.lineWidth = 0.03;
    ctx.setLineDash([0.22, 0.18]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(C.WORLD_W, y); ctx.stroke();
    ctx.setLineDash([]);
  }

  function muzzle(ctx, aim){
    const m = C.MUZZLE;
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 0.78, 0, Math.PI * 2);
    ctx.stroke();
    if (!aim) return;
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x + aim.x * 0.95, m.y + aim.y * 0.95);
    ctx.stroke();
  }

  return { bubble, board, guide, walls, muzzle, shade };
})();
globalThis.BubbleRender = BubbleRender;
