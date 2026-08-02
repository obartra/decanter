import { describe, it, assert, equal, loadPure } from './helpers.mjs';
/* MapGeom is the only part of the map with no DOM in it, and now it can simply
   be imported. It used to be lifted out by slicing the file's source at
   `const MapView` and running the front half through `new Function`, because
   under concatenation there was no other way to take one of a file's two exports
   without the browser half coming along. The module only touches the document
   inside its functions, so importing it here runs nothing. */
import { MapGeom } from '../src/js/80-map.js';

const { CONFIG } = loadPure();

describe('map geometry', () => {
  it('never looks ahead past the graded range', () => {
    /* the lookahead shows what is coming; past the table nothing is */
    equal(MapGeom.visibleCount(118, 5, 120), 120, 'the lookahead must stop at the last level');
    equal(MapGeom.visibleCount(120, 5, 120), 120);
    equal(MapGeom.visibleCount(10, 5, 120), 15, 'and must be untouched well inside the range');
  });
  const W = 380;
  it('places one node per level, climbing steadily', () => {
    const pts = MapGeom.nodes(12, W, {});
    equal(pts.length, 12);
    for (let i = 1; i < pts.length; i++){
      assert(pts[i].y > pts[i - 1].y, `level ${i + 1} is not above level ${i}`);
      equal(pts[i].level, i + 1);
    }
  });
  it('winds from side to side without leaving the column', () => {
    const pts = MapGeom.nodes(40, W, {});
    const margin = 52;
    for (const p of pts){
      assert(p.x >= margin - 1 && p.x <= W - margin + 1, `node ${p.level} at x=${p.x} escapes the column`);
    }
    const left = pts.filter(p => p.x < W / 2).length;
    const right = pts.filter(p => p.x > W / 2).length;
    assert(left > 8 && right > 8, 'the path should swing both ways');
  });
  it('keeps nodes far enough apart to tap', () => {
    const pts = MapGeom.nodes(30, W, {});
    for (let i = 1; i < pts.length; i++){
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      assert(d > 56, `nodes ${i} and ${i + 1} are only ${d.toFixed(0)}px apart`);
    }
  });
  it('narrow screens shrink the swing rather than overflow', () => {
    for (const w of [280, 320, 520]){
      const pts = MapGeom.nodes(20, w, {});
      for (const p of pts) assert(p.x > 0 && p.x < w, `x=${p.x} outside a ${w}px screen`);
    }
  });
  it('canvas height covers every node', () => {
    const opts = { spacing: 96 };
    const pts = MapGeom.nodes(25, W, opts);
    const h = MapGeom.height(25, opts);
    assert(h > pts[pts.length - 1].y, 'the last node would be clipped');
  });
  it('shows the frontier plus a short glimpse ahead', () => {
    equal(MapGeom.visibleCount(1), 1 + CONFIG.lookahead, 'a new player sees a little of what is next');
    equal(MapGeom.visibleCount(20), 20 + CONFIG.lookahead);
    assert(CONFIG.lookahead > 0 && CONFIG.lookahead <= 4, 'the glimpse should stay small');
  });
  it('draws a continuous path through the nodes', () => {
    const pts = MapGeom.nodes(6, W, {});
    const d = MapGeom.pathThrough(pts, 800);
    assert(d.startsWith('M'), 'path must start with a move');
    equal((d.match(/C/g) || []).length, 5, 'one curve per gap');
    assert(!/NaN/.test(d), 'path contains NaN');
  });
});
