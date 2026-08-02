/* The report a player reads out when the game does nothing.

   This exists because of a bug that could not be answered: a level was said to
   do nothing when tapped, and there was no way to find out what the game
   thought had happened. These specs are about that question being answerable. */
import { test, expect } from '@playwright/test';
import { start, openLevel, SAVE_KEY } from './helpers.js';

/* the way in is a hold on the gold count, so every spec here needs it */
async function hold(page) {
  const purse = page.locator('body[data-view="map"] #mapView .purse, body[data-view="game"] #gameView .purse').first();
  const box = await purse.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(page.locator('#diagVeil')).toHaveClass(/show/);
  return page.locator('#diagText');
}

/* Reaching for an empty bottle with nothing in hand: there is nothing to pick
   up, so the tap is refused by the rules rather than by the purse. Every board
   is dealt with empties, so this is available on all of them. */
async function refusedLift(page) {
  const empty = await page.evaluate(() =>
    globalThis.App._state.tubes.findIndex(t => t.length === 0));
  expect(empty, 'every board is dealt with an empty bottle').toBeGreaterThan(-1);
  await page.locator('#board .glass').nth(empty).click();
}

test('a held purse says which build, which save and what was refused', async ({ page }) => {
  await start(page, { unlocked: 15, gold: 40, seen: { 0: true, 1: true } });
  await openLevel(page, 15);
  await refusedLift(page);

  const text = await hold(page);
  await expect(text).toContainText('Decanter build');
  await expect(text).toContainText('unlocked 15');
  /* the reason, not just the fact */
  await expect(text).toContainText('refused lift');
  await expect(text).toContainText('is empty or finished');
});

/* A stuck player reloads, and the log goes with the page. The counts are written
   to the save so that they do not, which is the whole reason they are counts
   rather than entries. The reload itself is a unit test — this one is about the
   number reaching the save at all, from a real tap in a real browser. */
test('a refusal is written to the save, not just to the page', async ({ page }) => {
  await start(page, { unlocked: 15, gold: 40, seen: { 0: true, 1: true } });
  await openLevel(page, 15);
  await refusedLift(page);

  const stored = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).diag, SAVE_KEY);
  expect(stored.refused).toEqual({ lift: 1 });
});

test('an exception in a handler leaves a mark instead of a dead button', async ({ page }) => {
  await start(page, { unlocked: 4, gold: 400, seen: { 0: true } });
  await openLevel(page, 4);
  await page.evaluate(() => { setTimeout(() => { throw new Error('a handler blew up'); }, 0); });
  await page.waitForFunction(() => globalThis.Trace.counts.fault > 0);

  const text = await hold(page);
  await expect(text).toContainText('FAULT');
  await expect(text).toContainText('a handler blew up');
});

test('says what the run in front of the player actually is', async ({ page }) => {
  await start(page, { unlocked: 15, gold: 400, seen: { 0: true, 1: true } });
  await openLevel(page, 15);
  const text = await hold(page);
  await expect(text).toContainText('level 15');
  await expect(text).toContainText('14 bottles');
  /* which tools the chapter has handed over, since that is what changed under him */
  await expect(text).toContainText('tools: undo hint');
});

test('closes without touching anything it reported on', async ({ page }) => {
  await start(page, { unlocked: 15, gold: 400, seen: { 0: true, 1: true } });
  const before = await page.evaluate(() => globalThis.App._progress.gold);
  await hold(page);
  await page.locator('#diagClose').click();
  await expect(page.locator('#diagVeil')).not.toHaveClass(/show/);
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(before);
});

/* a hold is not a tap: the gold count is on both screens and neither uses it */
test('a plain tap on the purse does nothing', async ({ page }) => {
  await start(page, { unlocked: 15, gold: 400, seen: { 0: true, 1: true } });
  await page.locator('#mapView .purse').click();
  await page.waitForTimeout(400);
  await expect(page.locator('#diagVeil')).not.toHaveClass(/show/);
});
