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

  test(`the card before a replay fits at ${w}x${h}, ${note}`, async ({ page }) => {
    /* The card carries a picture of a board, and a board is the tallest thing in
       this game. On a phone lying on its side there is barely more height than
       the card wants, and a card whose Play button is under the fold is a level
       that cannot be replayed at all, with nothing on screen saying why, since
       nothing here scrolls. So the picture gives up size and the card fits. */
    await start(page, { unlocked: 20, gold: 900, seen: { 0: true, 1: true },
                        stars: { 16: 3 }, best: { 16: 40 }, claimed: { 16: true } });
    await page.setViewportSize({ width: w, height: h });
    await page.locator('[data-level="16"]').click();

    const fit = await page.evaluate(() => {
      const card = document.querySelector('.previewCard').getBoundingClientRect();
      const play = document.getElementById('previewPlay').getBoundingClientRect();
      const back = document.getElementById('previewBack').getBoundingClientRect();
      const de = document.documentElement;
      return {
        above: card.top, below: innerHeight - card.bottom,
        left: card.left, right: innerWidth - card.right,
        play: innerHeight - play.bottom, back: innerHeight - back.bottom,
        scrollsDown: de.scrollHeight - de.clientHeight,
        scrollsOver: de.scrollWidth - de.clientWidth
      };
    });
    expect(fit.above, 'the card runs off the top').toBeGreaterThanOrEqual(0);
    expect(fit.below, 'the card runs off the bottom').toBeGreaterThanOrEqual(0);
    expect(fit.left, 'the card runs off the left').toBeGreaterThanOrEqual(0);
    expect(fit.right, 'the card runs off the right').toBeGreaterThanOrEqual(0);
    expect(fit.play, 'the way into the level is off the bottom of the screen').toBeGreaterThanOrEqual(0);
    expect(fit.back, 'the way out is off the bottom of the screen').toBeGreaterThanOrEqual(0);
    expect(fit.scrollsDown, 'the card makes the document scroll').toBeLessThanOrEqual(0);
    expect(fit.scrollsOver, 'the card makes the document scroll sideways').toBeLessThanOrEqual(0);
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

/* The room is drawn from where the bottles are, so what "where" means matters.

   A bottle is transformed constantly — lifted twenty pixels while it is
   selected, thunking as it seals, tipping as it pours — and the shelves were
   keyed on the painted box, transforms and all. So picking a bottle up made it
   claim to be standing twenty pixels above the shelf it was actually on, and the
   room built a whole extra shelf up there: plank, brackets, and a dark band
   underneath, which then moved about after whichever bottle was in hand. */
test('picking a bottle up does not build a shelf under it', async ({ page }) => {
  await start(page, { unlocked: 12, gold: 400, seen: { 0: true, 1: true } });
  await openLevel(page, 12);
  await page.evaluate(() => {
    globalThis.__rows = null;
    const real = globalThis.Backdrop.setShelf.bind(globalThis.Backdrop);
    Object.defineProperty(globalThis.Backdrop, 'setShelf', {
      value: r => { globalThis.__rows = r ? r.map(x => x.y) : null; return real(r); }
    });
  });
  const rowsNow = async () => {
    await page.evaluate(() => globalThis.Board.render());
    return page.evaluate(() => globalThis.__rows);
  };

  /* however many shelves this width lays the board out on */
  const standing = await rowsNow();
  expect(standing.length).toBeGreaterThan(0);

  await page.locator('#board .glass').nth(0).click();
  await expect(page.locator('#board .bottle.lifted')).toHaveCount(1);
  expect(await rowsNow(), 'a bottle in hand still stands on its shelf')
    .toEqual(standing);

  /* and the same for a bottle mid-thunk, which is the other transform */
  await page.evaluate(() => document.querySelectorAll('.bottle')[2].classList.add('thunk'));
  expect(await rowsNow(), 'nor does one bouncing as it seals').toEqual(standing);
});
