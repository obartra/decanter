/* Drawing. Reads state, never changes it.

   The picture is a dim cellar floor with one lamp in it, and the lamp is the
   doorway. That is the whole lighting model and it decides everything else here:
   flagstones are brighter the nearer they are to the gap in the east wall, every
   cask throws its shadow away from it, and the gilt cask is the only object in
   the room that is not brown. Lighting the room from above instead would say
   there is a window, and a cellar with a window is a different room.

   Two things have to be legible at a glance and everything else is in service of
   them: WHICH CASK IS THE GILT ONE, and WHICH WAY EACH CASK CAN GO. The first is
   color — gold against oak, at the only saturation in the picture. The second
   is the staves, which run along a cask's length, so its axis is readable
   without counting cells or watching it fail to move.

   Text is drawn in world units under the transform, so it scales with the room
   and never needs a second coordinate system to live in. */
import { CasksConfig } from './pure/00-config.js';
import { CasksView } from './60-view.js';

export const CasksRender = (() => {
  const C = CasksConfig;
  const V = CasksView;

  /* The cellar's own colors, from src/casks/css/00-base.css, which took them
     from the pour game verbatim. Canvas cannot read a custom property without
     going through getComputedStyle on every frame, so the ones needed here are
     written out; if that block is ever retuned these are the ones to bring
     across. */
  const INK = '#EFE4D2';
  const INK_DIM = '#A2907A';

  /* Where the light is. The middle of the doorway, in world units, and the one
     number every shading decision below is relative to. */
  const lamp = () => ({ x: V.world.door.x + V.world.door.w, y: V.world.door.y + 0.5 });

  /* A repeatable value in [0, 1) from a pair of integers. Flagstones need to
     differ from each other or the floor reads as tiling rather than as stone,
     and they must differ the SAME WAY on every frame or the floor crawls. A
     hash rather than a stored table because the floor is thirty-six cells and
     keeping an array of noise for it would be storing something that is a pure
     function of where it is. */
  function grit(r, c){
    const n = Math.sin(r * 127.1 + c * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function shade(hex, amount){
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.max(0, Math.min(255, Math.round(v + (amount < 0 ? v : 255 - v) * amount)));
    return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
  }

  /* A rounded rectangle, as a path. Written out rather than using roundRect,
     which is recent enough that a phone two years old does not have it, and a
     game that draws nothing at all on such a phone is worse than one that spends
     six lines here. */
  function box(ctx, x, y, w, h, r){
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  /* The floor. One flagstone per cell, each a slightly different stone, each lit
     by how far it is from the doorway. Drawn cell by cell rather than as one
     fill with a gradient over it, because the joints have to fall on the cell
     boundaries: the grid is the thing the player is reasoning about, and a floor
     whose seams do not line up with it is a floor actively lying about the
     puzzle. */
  function floor(ctx){
    const w = V.world;
    const l = lamp();
    ctx.fillStyle = C.FLOOR;
    ctx.fillRect(w.wall, w.wall, C.W, C.H);

    for (let r = 0; r < C.H; r++){
      for (let c = 0; c < C.W; c++){
        const x = w.wall + c, y = w.wall + r;
        const d = Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y);
        /* Falls off with distance and never quite reaches nothing: a cell in the
           far corner still has to be readable, because there is a cask on it.
           The floor tone is the same one the page's own gradient settles to, so
           the room does not have a visible edge where the canvas ends. */
        const lit = 0.06 + 0.34 / (1 + d * d * 0.18);
        ctx.fillStyle = shade(C.FLOOR, lit * (0.72 + 0.28 * grit(r, c)));
        ctx.fillRect(x, y, 1, 1);
        /* The joint, on two sides only, so neighboring stones share one seam
           rather than drawing a double-width line between them. */
        ctx.strokeStyle = C.FLOOR_JOINT;
        ctx.lineWidth = 0.045;
        ctx.beginPath();
        ctx.moveTo(x, y + 1); ctx.lineTo(x, y); ctx.lineTo(x + 1, y);
        ctx.stroke();
      }
    }
  }

  /* The walls, and the gap in the east one.

     Drawn as four slabs rather than as a stroked rectangle with a hole, because
     the doorway needs a jamb: the two stubs above and below it are what make the
     gap read as a door rather than as a piece of missing wall. */
  function walls(ctx){
    const w = V.world;
    const d = w.door;
    ctx.fillStyle = C.WALL_FACE;
    ctx.fillRect(0, 0, w.w, w.wall);
    ctx.fillRect(0, w.h - w.wall, w.w, w.wall);
    ctx.fillRect(0, 0, w.wall, w.h);
    ctx.fillRect(d.x, 0, w.wall, d.y);
    ctx.fillRect(d.x, d.y + d.h, w.wall, w.h - d.y - d.h);

    /* The inside edge, catching what light there is. It stops at the doorway on
       the east side, which is the line that says the wall is open there. */
    ctx.strokeStyle = C.WALL_EDGE;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(w.wall, w.wall); ctx.lineTo(w.wall + C.W, w.wall);
    ctx.moveTo(w.wall, w.wall + C.H); ctx.lineTo(w.wall + C.W, w.wall + C.H);
    ctx.moveTo(w.wall, w.wall); ctx.lineTo(w.wall, w.wall + C.H);
    ctx.moveTo(d.x, w.wall); ctx.lineTo(d.x, d.y);
    ctx.moveTo(d.x, d.y + d.h); ctx.lineTo(d.x, w.wall + C.H);
    ctx.stroke();
  }

  /* The doorway: a warm gap in the east wall, and the light it throws back into
     the room.

     The spill is drawn over the flagstones and under the casks, so a cask
     standing in the doorway occludes it — which is the picture saying that the
     thing in the way is in the way. `heat` rises as the gilt cask approaches, so
     the room brightens as the board is solved and the reward for the last move
     is the room itself rather than a caption. */
  function door(ctx, heat, now){
    const d = V.world.door;
    /* a slow flicker, because the light beyond is a flame and a perfectly steady
       warm rectangle reads as a screen */
    const flicker = 0.94 + 0.06 * Math.sin(now / 420) * Math.sin(now / 173);
    const glow = (0.55 + 0.45 * heat) * flicker;

    const g = ctx.createLinearGradient(d.x, 0, d.x + d.w, 0);
    g.addColorStop(0, `rgba(224,177,92,${0.30 * glow})`);
    g.addColorStop(1, `rgba(255,232,186,${0.92 * glow})`);
    ctx.fillStyle = g;
    ctx.fillRect(d.x, d.y, d.w, d.h);

    const spill = ctx.createRadialGradient(d.x, d.y + d.h / 2, 0.2, d.x, d.y + d.h / 2, 5.5 + 2 * heat);
    spill.addColorStop(0, `rgba(255,226,170,${0.30 * glow})`);
    spill.addColorStop(0.45, `rgba(240,196,120,${0.09 * glow})`);
    spill.addColorStop(1, 'rgba(240,196,120,0)');
    ctx.fillStyle = spill;
    ctx.fillRect(V.world.wall, V.world.wall, C.W, C.H);
  }

  /* Where the cask in hand can go: the run, drawn as a channel on the floor.

     This is the affordance the whole input rests on. A cask may only be put on a
     cell it could have slid through, so the honest thing is to show that run
     rather than to refuse a move afterwards — a game that says no is a game the
     player has to guess at, and this one has an exact answer it can simply
     draw. Dashed, and behind the cask, because it is a possibility rather than
     an object. */
  function track(ctx, piece, run){
    const from = V.rectFor(piece, run.min);
    const to = V.rectFor(piece, run.max);
    const x = Math.min(from.x, to.x), y = Math.min(from.y, to.y);
    const width = (piece.horiz ? to.x - from.x : 0) + from.w;
    const height = piece.horiz ? from.h : to.y - from.y + from.h;
    /* A cask hemmed in on both sides has no run, and drawing a channel exactly
       its own size around it would say it can move when it cannot. */
    if (width <= from.w && height <= from.h) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(244,217,160,.34)';
    ctx.lineWidth = 0.06;
    ctx.setLineDash([0.28, 0.2]);
    box(ctx, x + 0.1, y + 0.1, width - 0.2, height - 0.2, 0.24);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(244,217,160,.055)';
    ctx.fill();
    ctx.restore();
  }

  /* One cask.

     The body is a gradient ACROSS the short axis, dark at both edges and lit
     just off center, which is what makes a rectangle read as a cylinder lying on
     its side. The staves run ALONG the length and the hoops cross it, so the
     axis a cask can move on is visible in the grain rather than only in its
     shape — which matters for the two-cell casks, where the rectangle is nearly
     square and its aspect says almost nothing.

     `lit` is the cask in hand, `gilt` is the one that has to reach the door, and
     `advice` is the one a hint named. */
  function cask(ctx, piece, p, { gilt = false, lit = false, advice = false } = {}){
    const rect = V.rectFor(piece, p);
    const m = 0.08;
    const x = rect.x + m, y = rect.y + m, w = rect.w - 2 * m, h = rect.h - 2 * m;
    const horiz = piece.horiz;
    const body = gilt ? C.GILT : C.OAK;
    const bodyLit = gilt ? C.GILT_LIT : C.OAK_LIT;

    /* The shadow, cast away from the doorway. One offset for the whole room
       rather than a per-cask direction: the light is far enough away and the
       casks are low enough that per-cask angles would be a computation nobody
       could see. */
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    box(ctx, x - 0.05, y + 0.12, w + 0.02, h + 0.02, 0.24);
    ctx.fill();

    /* the body */
    const g = horiz
      ? ctx.createLinearGradient(0, y, 0, y + h)
      : ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(body, -0.45));
    g.addColorStop(0.30, bodyLit);
    g.addColorStop(0.58, body);
    g.addColorStop(1, shade(body, -0.55));
    ctx.fillStyle = g;
    box(ctx, x, y, w, h, 0.24);
    ctx.fill();

    /* The staves, along the length. Three gaps rather than a stripe pattern: any
       more and at the size a phone draws a cell they close up into texture and
       stop pointing anywhere. */
    ctx.strokeStyle = gilt ? 'rgba(90,58,14,.45)' : C.STAVE;
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    for (const f of [0.3, 0.52, 0.74]){
      if (horiz){ ctx.moveTo(x + 0.14, y + h * f); ctx.lineTo(x + w - 0.14, y + h * f); }
      else { ctx.moveTo(x + w * f, y + 0.14); ctx.lineTo(x + w * f, y + h - 0.14); }
    }
    ctx.stroke();

    /* The hoops, crossing it. Two for a two-cell cask and three for a three-cell
       one, so the length is countable from the ironwork as well as from the
       cells — which is what a player is actually doing when they work out
       whether a cask will fit through a gap. */
    const hoops = piece.len > 2 ? [0.16, 0.5, 0.84] : [0.22, 0.78];
    const long = horiz ? w : h;
    const thick = 0.11;
    for (const f of hoops){
      const at = (horiz ? x : y) + long * f - thick / 2;
      const hg = horiz
        ? ctx.createLinearGradient(0, y, 0, y + h)
        : ctx.createLinearGradient(x, 0, x + w, 0);
      hg.addColorStop(0, shade(gilt ? C.GILT_LIT : C.HOOP, -0.55));
      hg.addColorStop(0.32, gilt ? C.GILT_LIT : C.HOOP);
      hg.addColorStop(1, shade(gilt ? C.GILT : C.HOOP, -0.65));
      ctx.fillStyle = hg;
      if (horiz) ctx.fillRect(at, y + 0.02, thick, h - 0.04);
      else ctx.fillRect(x + 0.02, at, w - 0.04, thick);
    }

    /* The rim of light along the top edge, and the outline. Gold on the gilt
       cask and the faintest ink on the rest: the one cask that matters is the
       only one with an edge bright enough to find from across the room. */
    ctx.strokeStyle = gilt ? 'rgba(255,240,208,.85)' : 'rgba(220,196,160,.18)';
    ctx.lineWidth = gilt ? 0.045 : 0.03;
    box(ctx, x, y, w, h, 0.24);
    ctx.stroke();

    if (lit || advice){
      ctx.strokeStyle = advice ? 'rgba(244,217,160,.9)' : 'rgba(255,247,232,.55)';
      ctx.lineWidth = 0.06;
      box(ctx, x - 0.04, y - 0.04, w + 0.08, h + 0.08, 0.27);
      ctx.stroke();
    }
  }

  /* How to play, said once on a floor nobody has touched yet, low down where the
     board is emptiest. It leaves on the first move and stays away: it is an
     explanation, not a status. Called `rule` rather than `hint` because in this
     game a hint is a specific and expensive thing — it names the next optimal
     move and caps the run at two stars — and two functions a keystroke apart,
     one free and one costly, is an invitation to call the wrong one. */
  function rule(ctx, text){
    const w = V.world;
    /* a quarter cell of air at each end, so the sentence never runs into a wall */
    const room = w.w - 0.5;
    const face = s => `${s}px "Alegreya Sans", ui-sans-serif, sans-serif`;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.62;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    /* Fitted rather than set at one size. The floor is six cells wide and this
       sentence is not, so at a fixed size it runs off both ends — and a canvas
       clips instead of scrolling, so it does not read as overflow. It reads as
       the first and last words never having been written, which is worse,
       because nothing on the page reports it: the document is not overflowing,
       so no layout test can see it and the console stays clean.

       Shrink first, then break. A line that is merely small still reads; a line
       that is cut does not. */
    let size = 0.4;
    ctx.font = face(size);
    while (size > 0.26 && ctx.measureText(text).width > room){
      size -= 0.02;
      ctx.font = face(size);
    }

    const lines = [];
    if (ctx.measureText(text).width > room){
      let line = '';
      for (const word of text.split(' ')){
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > room){ lines.push(line); line = word; }
        else line = next;
      }
      if (line) lines.push(line);
    } else {
      lines.push(text);
    }

    /* centerd on where the single line used to sit, so two lines grow into the
       space either side of it rather than pushing down off the floor */
    const step = size * 1.3;
    const top = w.h - w.wall / 2 - (lines.length - 1) * step / 2;
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], w.w / 2, top + i * step);
    ctx.globalAlpha = 1;
  }

  /* What the gilt cask is aimed at, said in words the first time somebody sees
     the room, over the door itself. Dimmer than the rule below, because it names
     a thing that is already lit and the light is the real label. */
  function doorLabel(ctx, text){
    const d = V.world.door;
    ctx.fillStyle = INK_DIM;
    ctx.font = '0.34px "Cinzel", Georgia, serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, d.x - 0.25, d.y - 0.55);
  }

  return { floor, walls, door, track, cask, rule, doorLabel, box };
})();
