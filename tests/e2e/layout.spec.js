/* The parts that only exist once a page has been laid out. */
import { test, expect } from '@playwright/test';
import { start, openLevel, settle } from './helpers.js';

/* sizes chosen for the ways they have actually broken: a tall phone, a phone on
   its side, a short desktop window, and one small enough that the bottles have
   to give up size to fit at all */
const SIZES = [
  { w: 375, h: 812, note: 'phone' },
  { w: 812, h: 375, note: 'phone on its side' },
  { w: 1280, h: 500, note: 'short desktop' },
  { w: 380, h: 300, note: 'barely anything' },
  { w: 1440, h: 900, note: 'roomy desktop' }
];

for (const { w, h, note } of SIZES) {
  test(`the board fits at ${w}x${h}, ${note}`, async ({ page }) => {
    await start(page, { unlocked: 20, gold: 900 });
    await page.setViewportSize({ width: w, height: h });
    await openLevel(page, 20);
    await settle(page);

    const fit = await page.evaluate(() => {
      const root = document.getElementById('board');
      const bs = [...root.querySelectorAll('.bottle')];
      const b = root.getBoundingClientRect();
      return {
        left: Math.min(...bs.map(e => e.getBoundingClientRect().left)) - b.left,
        right: b.right - Math.max(...bs.map(e => e.getBoundingClientRect().right)),
        top: Math.min(...bs.map(e => e.getBoundingClientRect().top)) - b.top,
        bottom: b.bottom - Math.max(...bs.map(e => e.getBoundingClientRect().bottom))
      };
    });
    /* Anything outside the board is outside the canvas its liquid is drawn on,
       so a bottle that overflows keeps its glass and loses its contents. */
    expect(fit.left, 'bottles overflow the left of the board').toBeGreaterThanOrEqual(-0.5);
    expect(fit.right, 'bottles overflow the right of the board').toBeGreaterThanOrEqual(-0.5);
    expect(fit.top, 'bottles overflow the top of the board').toBeGreaterThanOrEqual(-0.5);
    expect(fit.bottom, 'bottles overflow the bottom of the board').toBeGreaterThanOrEqual(-0.5);
  });

  test(`nothing scrolls at ${w}x${h}, ${note}`, async ({ page }) => {
    await start(page, { unlocked: 20, gold: 900 });
    await page.setViewportSize({ width: w, height: h });
    /* the map first, which is the one view with something to scroll */
    const onMap = await page.evaluate(() => {
      const de = document.documentElement;
      return { over: de.scrollWidth - de.clientWidth, down: de.scrollHeight - de.clientHeight };
    });
    expect(onMap.over, 'the document scrolls sideways on the map').toBeLessThanOrEqual(0);
    expect(onMap.down, 'the document scrolls down on the map').toBeLessThanOrEqual(0);

    await openLevel(page, 20);
    const inGame = await page.evaluate(() => {
      const de = document.documentElement;
      return { over: de.scrollWidth - de.clientWidth, down: de.scrollHeight - de.clientHeight };
    });
    expect(inGame.over, 'the document scrolls sideways in a level').toBeLessThanOrEqual(0);
    expect(inGame.down, 'the document scrolls down in a level').toBeLessThanOrEqual(0);
  });
}

test('the liquid follows the board across a resize', async ({ page }) => {
  await start(page, { unlocked: 20, gold: 900 });
  await openLevel(page, 20);
  await settle(page);
  await page.setViewportSize({ width: 700, height: 900 });
  /* the board re-lays out on a debounce, so wait for the canvas to agree again
     rather than for a fixed time */
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById('board');
    const fl = document.querySelector('canvas.fluidLayer');
    return Math.abs(Math.round(fl.getBoundingClientRect().width) - Math.round(root.getBoundingClientRect().width));
  }), { timeout: 15_000 }).toBeLessThanOrEqual(1);
});

test('the bottles sit above the HUD and the controls', async ({ page }) => {
  await start(page, { unlocked: 4, gold: 400 });
  await openLevel(page, 4);
  const order = await page.evaluate(() => {
    const z = s => { const e = document.querySelector(s); return e ? getComputedStyle(e).zIndex : null; };
    return { board: z('#board'), controls: z('.controls'), stream: z('#board .fx'),
             liquid: z('canvas.fluidLayer'), top: z('canvas.fluidTop') };
  });
  expect(Number(order.board)).toBeGreaterThan(0);
  expect(order.controls === 'auto' || Number(order.controls) < Number(order.board)).toBeTruthy();
  /* back to front: the stream, then the liquid, then the bottle in flight */
  expect(Number(order.stream)).toBeLessThan(Number(order.liquid));
  expect(Number(order.liquid)).toBeLessThan(Number(order.top));
});
