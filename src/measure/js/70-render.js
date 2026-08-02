/* Drawing. Reads state, never changes it.

   The picture this file exists to make is one horizontal line. Every vessel
   stands on the same shelf and one unit of wine is one unit tall in all of them,
   so the target is a single straight rule across a bench of wildly different
   glass, and every vessel's distance from it can be read off at a glance without
   arithmetic. Everything else here — the etched graduations, the shelf, the
   highlights on the glass — is in service of making that line legible against
   real glass rather than against a bar chart.

   Text is drawn in world units under the transform, so the numbers scale with
   the bench and never need a second coordinate system to live in. */
const MeasureRender = (() => {
  const C = MeasureConfig;
  const V = MeasureView;

  /* The cellar's own colours, from src/measure/css/00-base.css, which took them
     from the pour game verbatim. Canvas cannot read a custom property without
     going through getComputedStyle on every frame, so the four that are needed
     here are written out; if that block is ever retuned these are the four to
     bring across. */
  const INK = '#EFE4D2';
  const INK_DIM = '#A2907A';
  const GOLD = '#E0B15C';
  const GOLD_LIT = '#F4D9A0';
  const GLASS_LINE = 'rgba(246,234,212,.42)';

  function shade(hex, amount){
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c : 255 - c) * amount)));
    return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
  }

  /* The bench. A slab under the glass with the light landing on its front edge,
     so the vessels are standing on something rather than floating in a gradient.
     Drawn first and behind everything, and it is the only thing in the picture
     that is not glass. */
  function shelf(ctx){
    const w = V.world;
    const g = ctx.createLinearGradient(0, w.floor, 0, w.floor + C.SHELF);
    g.addColorStop(0, 'rgba(90,64,38,.95)');
    g.addColorStop(0.18, 'rgba(56,38,22,.95)');
    g.addColorStop(1, 'rgba(16,11,6,.95)');
    ctx.fillStyle = g;
    ctx.fillRect(-1, w.floor, w.w + 2, C.SHELF + 1);

    ctx.strokeStyle = 'rgba(244,217,160,.30)';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(-1, w.floor);
    ctx.lineTo(w.w + 1, w.floor);
    ctx.stroke();
  }

  /* One vessel, empty of everything but light: the body, the rim, and the two
     highlights that make it read as a cylinder rather than as a slot.

     The base is squared off rather than rounded, because these are laboratory
     glass standing on a shelf and a rounded base reads as a bottle, which is the
     other game's object. */
  function glass(ctx, box){
    ctx.fillStyle = 'rgba(20,14,8,.45)';
    ctx.fillRect(box.x, box.rim, box.w, box.base - box.rim);

    ctx.lineWidth = C.GLASS;
    ctx.strokeStyle = GLASS_LINE;
    ctx.beginPath();
    ctx.moveTo(box.x + C.GLASS / 2, box.rim);
    ctx.lineTo(box.x + C.GLASS / 2, box.base - C.GLASS / 2);
    ctx.lineTo(box.x + box.w - C.GLASS / 2, box.base - C.GLASS / 2);
    ctx.lineTo(box.x + box.w - C.GLASS / 2, box.rim);
    ctx.stroke();

    /* the rim, a shade brighter than the walls, so a full vessel is visibly at
       its brim rather than merely near the top of something */
    ctx.strokeStyle = 'rgba(255,247,232,.62)';
    ctx.lineWidth = C.GLASS * 0.8;
    ctx.beginPath();
    ctx.moveTo(box.x, box.rim);
    ctx.lineTo(box.x + box.w, box.rim);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,.09)';
    ctx.fillRect(box.x + box.w * 0.16, box.rim + 0.2, box.w * 0.07, (box.base - box.rim) - 0.5);
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    ctx.fillRect(box.x + box.w * 0.78, box.rim + 0.35, box.w * 0.04, (box.base - box.rim) - 0.8);
  }

  /* The graduations, etched on the glass, one per unit with a heavier one every
     fifth.

     They are the reason a player can answer "how much is in there" without
     counting pixels, and they are why the whole layout is worth the constraint
     it imposes. Ticks come in from the left wall only, with a short answering
     nub on the right for the major ones, because a full-width rule at every unit
     turns a twenty-four unit vessel into a ladder and hides the wine behind it. */
  function graduations(ctx, box){
    for (let u = 1; u < box.cap; u++){
      const y = V.yFor(u);
      const major = u % C.GRADUATION_MAJOR === 0;
      ctx.strokeStyle = major ? 'rgba(246,234,212,.42)' : 'rgba(246,234,212,.17)';
      ctx.lineWidth = major ? 0.055 : 0.035;
      ctx.beginPath();
      ctx.moveTo(box.x + C.GLASS, y);
      ctx.lineTo(box.x + C.GLASS + (major ? box.w * 0.34 : box.w * 0.17), y);
      if (major){
        ctx.moveTo(box.x + box.w - C.GLASS, y);
        ctx.lineTo(box.x + box.w - C.GLASS - box.w * 0.14, y);
      }
      ctx.stroke();
    }
  }

  /* The wine. Lit from the upper left and deepening away from the light, with a
     brighter meniscus where the surface catches it — the same three-part
     construction the other game's bottles use, so the two rooms are lit the
     same way without either file knowing about the other. */
  function wine(ctx, box, amount){
    if (amount <= 0) return;
    const top = V.yFor(amount);
    const x = box.x + C.GLASS;
    const w = box.w - C.GLASS * 2;
    const bottom = box.base - C.GLASS;

    const g = ctx.createLinearGradient(x, top, x + w, bottom);
    g.addColorStop(0, C.WINE_LIT);
    g.addColorStop(0.45, C.WINE);
    g.addColorStop(1, shade(C.WINE, -0.45));
    ctx.fillStyle = g;
    ctx.fillRect(x, top, w, bottom - top);

    ctx.fillStyle = 'rgba(255,214,214,.30)';
    ctx.fillRect(x, top, w, 0.11);
  }

  /* The one line the whole game is about, all the way across the bench and
     through every vessel, so it can be compared against all of them at once.

     Dashed rather than solid: a solid gold rule through a vessel reads as
     something in the vessel, and the target is a level rather than a substance.
     It turns solid and bright the moment some vessel is actually holding it,
     which is the game being won and does not need a second announcement. */
  function targetLine(ctx, target, hit){
    const w = V.world;
    const y = V.yFor(target);
    ctx.strokeStyle = hit ? GOLD_LIT : 'rgba(224,177,92,.62)';
    ctx.lineWidth = hit ? 0.09 : 0.06;
    if (!hit) ctx.setLineDash([0.5, 0.34]);
    ctx.beginPath();
    ctx.moveTo(0.1, y);
    ctx.lineTo(w.w - 0.1, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = hit ? GOLD_LIT : GOLD;
    ctx.font = `700 1.15px "Cinzel", Georgia, serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(target), 0.15, y - 0.22);
  }

  /* What each vessel holds, under it on the shelf, and what it could hold, above
     its rim.

     Both are drawn because they answer different questions and a player needs
     both constantly: the amount is what you have, the capacity is what will fit,
     and the whole game is arithmetic between the two. Reading them off the
     graduations is possible and is exactly the tedium the numbers remove. */
  function labels(ctx, box, amount, lit){
    ctx.textAlign = 'center';
    const mid = box.x + box.w / 2;

    ctx.fillStyle = lit ? GOLD_LIT : (amount > 0 ? GOLD : 'rgba(162,144,122,.75)');
    ctx.font = `700 1.25px "Cinzel", Georgia, serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(String(amount), mid, box.base + 0.42);

    ctx.fillStyle = INK_DIM;
    ctx.font = `0.82px "Alegreya Sans", ui-sans-serif, sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${box.cap}`, mid, box.rim - 0.34);
  }

  /* The vessel in hand. A ring of light at its feet rather than an outline round
     the glass, because an outline competes with the rim and the graduations and
     this has to be readable while the glass behind it is still the thing being
     read. */
  function selection(ctx, box, now){
    const pulse = 0.5 + 0.5 * Math.sin(now / 300);
    const g = ctx.createRadialGradient(box.x + box.w / 2, box.base, 0.2,
                                       box.x + box.w / 2, box.base, box.w * 0.95);
    g.addColorStop(0, `rgba(244,217,160,${0.30 + 0.16 * pulse})`);
    g.addColorStop(1, 'rgba(244,217,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(box.x - box.w, box.base - box.w, box.w * 3, box.w * 2);
  }

  /* The stream, from the lip of the vessel being emptied to the mouth of the one
     being filled. A tapered ribbon rather than a line, narrowing as it falls,
     which is what a stream of liquid actually does and is the cheapest way to
     make this read as pouring rather than as a wire between two objects. */
  function stream(ctx, from, to, t){
    if (t <= 0 || t >= 1) return;
    const x0 = from.x + from.w / 2 + (to.x > from.x ? from.w * 0.42 : -from.w * 0.42);
    const y0 = from.rim - C.LIFT + 0.1;
    const x1 = to.x + to.w / 2;
    const y1 = to.rim;
    /* fades in and out rather than snapping, so the last frame of a pour is not
       a ribbon vanishing mid-air */
    ctx.globalAlpha = Math.min(1, Math.sin(t * Math.PI) * 2.2);
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, C.WINE_LIT);
    g.addColorStop(1, C.WINE);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - 0.16, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2, y0 + (y1 - y0) * 0.28, x1 - 0.07, y1);
    ctx.lineTo(x1 + 0.07, y1);
    ctx.quadraticCurveTo((x0 + x1) / 2, y0 + (y1 - y0) * 0.34, x0 + 0.16, y0);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* One vessel, whole: glass, wine, etching, numbers. `lift` is how far off the
     shelf it currently is, which is nonzero only while it is pouring. */
  function vessel(ctx, box, amount, { lift = 0, lit = false } = {}){
    ctx.save();
    ctx.translate(0, -lift);
    glass(ctx, box);
    wine(ctx, box, amount);
    graduations(ctx, box);
    ctx.restore();
    labels(ctx, box, amount, lit);
  }

  /* Said once, on a bench nobody has poured from yet, in the empty air above the
     short vessels where there is nothing to cover. */
  function hint(ctx, text){
    const w = V.world;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.55;
    ctx.font = `0.95px "Alegreya Sans", ui-sans-serif, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(text, w.w / 2, 0.4);
    ctx.globalAlpha = 1;
  }

  return { shelf, glass, wine, graduations, targetLine, labels, selection,
           stream, vessel, hint, shade };
})();
globalThis.MeasureRender = MeasureRender;
