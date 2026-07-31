import { describe, it, assert, equal, loadPure, read } from './helpers.mjs';

const ctx = loadPure();
const { CONFIG } = ctx;
const css = ['01-base.css', '02-bottle.css', '03-game.css', '04-map.css']
  .map(f => read(`src/css/${f}`)).join('\n');
const app = read('src/js/90-app.js');

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

  it('keeps every liquid distinguishable from its neighbours', () => {
    /* two colours that read the same on a dark shelf make a level unsolvable by
       eye however sound the puzzle is */
    const rgb = h => [1,3,5].map(i => parseInt(h.slice(i, i + 2), 16));
    const seen = [];
    CONFIG.palette.forEach((hex, i) => {
      rgb(hex).length;
      seen.forEach(([j, other]) => {
        const d = Math.hypot(...rgb(hex).map((v, k) => v - rgb(other)[k]));
        assert(d > 40, `colours ${j} and ${i} are too close (${d.toFixed(0)})`);
      });
      seen.push([i, hex]);
    });
  });
});
