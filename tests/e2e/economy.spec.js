/* Gold changing hands, and the things it buys. */
import { test, expect } from '@playwright/test';
import { start, openLevel, settle } from './helpers.js';

test('a level can be bought from the map, and only the next one', async ({ page }) => {
  await start(page, { unlocked: 5, gold: 400 });
  const buyable = page.locator('.node.buyable');
  await expect(buyable).toHaveCount(1);
  await expect(buyable).toHaveAttribute('data-level', '6');

  /* the first tap arms it and must not spend anything */
  const before = await page.evaluate(() => globalThis.App._progress.gold);
  await buyable.click();
  await expect(page.locator('.node.armed')).toHaveCount(1);
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(before);

  await page.locator('.node.armed').click();
  const after = await page.evaluate(() => ({
    gold: globalThis.App._progress.gold,
    unlocked: globalThis.App._progress.unlocked,
    stars: globalThis.App._progress.starsFor(5),
    claimed: !!globalThis.App._progress.raw.claimed[5]
  }));
  expect(after.unlocked).toBe(6);
  expect(after.gold).toBeLessThan(before);
  /* buying past a board is not beating it */
  expect(after.stars).toBe(0);
  expect(after.claimed).toBe(false);
  await expect(page.locator('.node.buyable')).toHaveAttribute('data-level', '7');
});

test('a locked level nobody can afford refuses the tap', async ({ page }) => {
  await start(page, { unlocked: 5, gold: 4 });
  const buyable = page.locator('.node.buyable');
  await expect(buyable).toBeDisabled();
  await buyable.click({ force: true });
  expect(await page.evaluate(() => globalThis.App._progress.unlocked)).toBe(5);
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(4);
});

test('a hint costs gold and marks both ends of the pour', async ({ page }) => {
  await start(page, { unlocked: 4, gold: 400 });
  await openLevel(page, 4);
  const before = await page.evaluate(() => globalThis.App._progress.gold);
  await page.locator('#hint').click();

  await expect(page.locator('#board .bottle.hintFrom')).toHaveCount(1);
  await expect(page.locator('#board .bottle.hintTo')).toHaveCount(1);
  const after = await page.evaluate(() => globalThis.App._progress.gold);
  expect(before - after).toBe(await page.evaluate(() => globalThis.CONFIG.economy.hint));

  /* the move it names has to be one the rules would actually allow */
  const legal = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('#board .bottle')];
    const from = bs.findIndex(b => b.classList.contains('hintFrom'));
    const to = bs.findIndex(b => b.classList.contains('hintTo'));
    return globalThis.Rules.canPour(globalThis.App._state.tubes, from, to);
  });
  expect(legal).toBe(true);
});

test('a vessel adds a bottle, and restarting takes it away', async ({ page }) => {
  await start(page, { unlocked: 7, gold: 900 });
  await openLevel(page, 7);
  const before = await page.evaluate(() => globalThis.App._state.tubes.length);
  await page.locator('#vessel').click();
  await expect.poll(() => page.evaluate(() => globalThis.App._state.tubes.length)).toBe(before + 1);
  /* two stars at most from here, whatever happens next. The dim ones are still
     stars in the text, so the count of dimmed ones is what says how many are
     left rather than the text itself. */
  await expect(page.locator('#statStars .dim')).toHaveCount(1);

  /* restart needs a move behind it before it will do anything */
  await page.locator('#board .glass').nth(0).click();
  await page.locator('#board .glass').nth(before).click();
  await settle(page);
  await page.locator('#restart').click();
  await expect.poll(() => page.evaluate(() => globalThis.App._state.tubes.length)).toBe(before);
  expect(await page.evaluate(() => globalThis.App._state.vesselUsed)).toBe(false);
});

test('the board can be read after the run, and taps go back', async ({ page }) => {
  await start(page, { unlocked: 4, gold: 400 });
  await openLevel(page, 4);
  await page.evaluate(() => document.getElementById('veil').classList.add('show'));
  await page.locator('#peek').click();
  await expect(page.locator('body')).toHaveClass(/peeking/);
  await expect(page.locator('#veil')).not.toHaveClass(/show/);
  /* the board takes no input while it is being read */
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('board')).pointerEvents))
    .toBe('none');
  /* anywhere at all, including over a control, because while the board is being
     read a tap means put the panel back and nothing else */
  await page.locator('#board').click({ position: { x: 5, y: 5 }, force: true });
  await expect(page.locator('#veil')).toHaveClass(/show/);
  await expect(page.locator('body')).not.toHaveClass(/peeking/);
});
