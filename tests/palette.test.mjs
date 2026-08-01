import { describe, it, assert, equal, loadPure, read } from './helpers.mjs';

const ctx = loadPure();
const { CONFIG } = ctx;
const css = ['01-base.css', '02-bottle.css', '03-game.css', '04-map.css']
  .map(f => read(`src/css/${f}`)).join('\n');
const app = read('src/js/90-app.js');

/* CIEDE2000, the standard measure of how different two colours look. Written
   out here rather than pulled in, because the palette is the one thing in the
   project that has to be judged by eye and a test that guesses at that is worse
   than no test. */
const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function lab(hex){
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = (0.2126 * r + 0.7152 * g + 0.0722 * b);
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function de2000(h1, h2){
  const [L1, a1, b1] = lab(h1), [L2, a2, b2] = lab(h2);
  const avgL = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2), avgCp = (C1p + C2p) / 2;
  const h1p = (Math.atan2(b1, a1p) * 180 / Math.PI + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) * 180 / Math.PI + 360) % 360;
  let dhp = h2p - h1p;
  if (Math.abs(dhp) > 180) dhp -= Math.sign(dhp) * 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);
  let avghp = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + 360) / 2 : (h1p + h2p) / 2;
  if (C1p * C2p === 0) avghp = h1p + h2p;
  const T = 1 - 0.17 * Math.cos((avghp - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * avghp * Math.PI / 180)
    + 0.32 * Math.cos((3 * avghp + 6) * Math.PI / 180) - 0.20 * Math.cos((4 * avghp - 63) * Math.PI / 180);
  const SL = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const SC = 1 + 0.045 * avgCp, SH = 1 + 0.015 * avgCp * T;
  const RT = -2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)))
    * Math.sin(60 * Math.exp(-Math.pow((avghp - 275) / 25, 2)) * Math.PI / 180);
  return Math.sqrt(Math.pow(dLp / SL, 2) + Math.pow(dCp / SC, 2) + Math.pow(dHp / SH, 2)
    + RT * (dCp / SC) * (dHp / SH));
}
function closestPair(list){
  let worst = { de: Infinity, i: 0, j: 0 };
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++){
      const de = de2000(list[i], list[j]);
      if (de < worst.de) worst = { de, i, j };
    }
  return worst;
}

describe('liquid palette', () => {
  it('covers every colour a level can deal', () => {
    assert(CONFIG.palette.length >= CONFIG.maxColors,
      `palette has ${CONFIG.palette.length} entries for ${CONFIG.maxColors} colours`);
    for (const hex of CONFIG.palette){
      assert(/^#[0-9A-Fa-f]{6}$/.test(hex), `${hex} is not a six-digit hex colour`);
    }
  });

  it('is the only place a liquid colour is written down', () => {
    /* The bands read var(--cN) while the pour and the particle sim read
       CONFIG.palette. When both were spelled out, retuning one left the other
       behind and the sim poured the old colours into the new bottles. The vars
       are published from the palette at boot, so the stylesheets must not
       define them. */
    const defined = [...css.matchAll(/--c(\d+)\s*:/g)].map(m => m[0]);
    equal(defined, [], `stylesheets should not define liquid colours: ${defined.join(', ')}`);
    assert(/setProperty\(`--c\$\{i\}`/.test(app) || /setProperty\('--c'/.test(app),
      'nothing publishes the palette to CSS custom properties');
  });

  it('keeps every liquid distinguishable from every other', () => {
    /* Two liquids that read the same on a dark shelf make a level unsolvable by
       eye however sound the puzzle is. Distance in RGB does not answer that
       question: it treats a step in green as it treats a step in blue, and the
       eye does not. This measures CIEDE2000, where roughly 24 is a comfortable
       gap and the low teens is where two colours start being mistaken for each
       other. The palette this replaced had two pairs near 12. */
    const MIN = 22;
    const worst = closestPair(CONFIG.palette);
    assert(worst.de >= MIN,
      `${CONFIG.palette[worst.i]} and ${CONFIG.palette[worst.j]} are ${worst.de.toFixed(1)} apart, under ${MIN}`);
  });

  it('measures colour the way an eye does, not the way a byte does', () => {
    /* The check above is only worth having if it can tell these apart, and a
       plain RGB distance cannot. Both pairs below are the same step in RGB, and
       they do not look remotely the same amount apart, which is the whole reason
       the old threshold let two greens through at a distance it was happy with. */
    const green = de2000('#00FF00', '#20FF20');
    const blue = de2000('#0000FF', '#2020FF');
    const ratio = Math.max(green, blue) / Math.min(green, blue);
    assert(ratio > 2,
      `an identical RGB step should not read the same everywhere, but green was ` +
      `${green.toFixed(1)} and blue ${blue.toFixed(1)}`);
  });
});
