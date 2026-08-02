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

/* The purse running dry on the level you are stuck on is a state the economy
   plans for: the daily draught is the way back. The map used to keep offering
   the board anyway, so the tap was taken, the fee refused, and nothing at all
   happened, on a medallion that was still lit and still beaconing. */
test('an open level nobody can afford refuses the tap, and says the price', async ({ page }) => {
  await start(page, { unlocked: 15, gold: 0, seen: { 0: true, 1: true } });
  const fee = await page.evaluate(() => globalThis.CONFIG.economy.attempt);
  const node = page.locator('[data-level="15"]');
  await expect(node).toBeDisabled();
  await expect(node.locator('.ns.buy')).toContainText(String(fee));
  await expect(node).toHaveAttribute('aria-label', /not enough/);
  /* and the way out of it is the thing being offered */
  await expect(page.locator('#daily')).toHaveClass(/primary/);

  await node.click({ force: true });
  expect(await page.evaluate(() => document.body.dataset.view)).toBe('map');
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(0);

  /* the draught pays for a board, and the map says so without being reloaded */
  await page.locator('#daily').click();
  await expect(node).toBeEnabled();
  await expect(page.locator('#daily')).not.toHaveClass(/primary/);
  await node.click();
  await page.waitForFunction(() => globalThis.App._state.level === 15);
});

/* a cleared board is free, so an empty purse must never stand in the way of one */
test('an empty purse still opens a level already beaten', async ({ page }) => {
  await start(page, { unlocked: 15, gold: 0, stars: { 4: 3 }, seen: { 0: true, 1: true } });
  const node = page.locator('[data-level="4"]');
  await expect(node).toBeEnabled();
  await node.click();
  await page.waitForFunction(() => globalThis.App._state.level === 4);
});

test('a hint costs gold and marks both ends of the pour', async ({ page }) => {
  /* hints are the apothecary's, so this has to be played somewhere it has them */
  await start(page, { unlocked: 11, gold: 400, seen: { 0: true, 1: true } });
  await openLevel(page, 11);
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
  /* the vessel is the distillery's */
  await start(page, { unlocked: 21, gold: 900, seen: { 0: true, 1: true, 2: true } });
  await openLevel(page, 21);
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

test('going back to a cleared level is free, and pays nothing', async ({ page }) => {
  await start(page, { unlocked: 3, gold: 400, stars: { 1: 3 }, claimed: { 1: true } });
  await expect(page.locator('#playCost')).toBeVisible();
  const before = await page.evaluate(() => globalThis.App._progress.gold);
  await page.locator('[data-level="1"]').click();
  await page.waitForFunction(() => globalThis.App._state.level === 1);
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(before);
});

test('a level not yet beaten still charges to deal', async ({ page }) => {
  await start(page, { unlocked: 3, gold: 400, stars: { 1: 3 } });
  const before = await page.evaluate(() => globalThis.App._progress.gold);
  await page.locator('[data-level="3"]').click();
  await page.waitForFunction(() => globalThis.App._state.level === 3);
  const fee = await page.evaluate(() => globalThis.CONFIG.economy.attempt);
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(before - fee);
});

test('the first chapter opens with one tool, not all of them', async ({ page }) => {
  await start(page, { unlocked: 1, gold: 400, seen: { 0: true } });
  await openLevel(page, 1);
  await expect(page.locator('#undo')).toBeVisible();
  await expect(page.locator('#hint')).toBeHidden();
  await expect(page.locator('#vessel')).toBeHidden();
});

test('later chapters hand over the rest', async ({ page }) => {
  await start(page, { unlocked: 25, gold: 900, seen: { 0: true, 1: true, 2: true } });
  await openLevel(page, 25);
  await expect(page.locator('#undo')).toBeVisible();
  await expect(page.locator('#hint')).toBeVisible();
  await expect(page.locator('#vessel')).toBeVisible();
});

test('a chapter introduces itself once', async ({ page }) => {
  await start(page, { unlocked: 11, gold: 900, seen: { 0: true } });
  await page.locator('[data-level="11"]').click();
  await expect(page.locator('#chapterVeil')).toHaveClass(/show/);
  await expect(page.locator('#chapterName')).toHaveText('The Apothecary');
  await expect(page.locator('#chapterGrant')).toContainText('Hints');
  await page.locator('#chapterGo').click();
  await expect(page.locator('#chapterVeil')).not.toHaveClass(/show/);

  /* back to the map and in again: it has been read */
  await page.locator('#toMap').click();
  await page.locator('[data-level="11"]').click();
  await expect(page.locator('#chapterVeil')).not.toHaveClass(/show/);
});

test('the board can be read after the run, and taps go back', async ({ page }) => {
  await start(page, { unlocked: 4, gold: 400, seen: { 0: true } });
  await openLevel(page, 4);
  await page.evaluate(() => document.getElementById('veil').classList.add('show'));
  await page.locator('#peek').click();
  await expect(page.locator('body')).toHaveClass(/peeking/);
  await expect(page.locator('#veil')).not.toHaveClass(/show/);
  /* the board takes no input while it is being read */
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('board')).pointerEvents))
    .toBe('none');
  /* anywhere at all, because while the board is being read a tap means put the
     panel back and nothing else. A raw click at a point on the screen rather
     than at an element, since every element there ignores pointers. */
  const box = page.viewportSize();
  await page.mouse.click(Math.round(box.width / 2), Math.round(box.height / 2));
  await expect(page.locator('#veil')).toHaveClass(/show/);
  await expect(page.locator('body')).not.toHaveClass(/peeking/);
});
