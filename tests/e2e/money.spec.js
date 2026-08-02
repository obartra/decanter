/* Gold changing hands, end to end.

   Every transaction in the game runs through one function, `attempt(level)`, or
   through one of three buttons on the end of run panel. Between them they move
   more of a player's progress than anything else in the game, and until now not
   one of those buttons had ever been clicked in a browser: the unit suite proves
   the arithmetic and the browser suite proved the buttons existed.

   These read the purse before and after, and take the expected figure from the
   page's own config rather than hardcoding it, so a change to the economy shows
   up as a deliberate edit here rather than as a test that quietly still passes.

   Scoped to the panel. What the map charges is economy.spec's, and anything
   asserted there is deliberately not repeated here: two tests of one rule is
   one test and one thing to forget to update. */
import { test, expect } from '@playwright/test';
import { start, openLevel, pour, settle, optimalLine } from './helpers.js';

const gold = page => page.evaluate(() => globalThis.App._progress.gold);
const cfg = page => page.evaluate(() => globalThis.CONFIG.economy);

/* Play a level out properly. Nothing here reaches into the board: the line comes
   from the page's own solver, so the run is one a player could have had. */
async function clear(page, level){
  await openLevel(page, level);
  for (const [from, to] of await optimalLine(page)) await pour(page, from, to);
  await settle(page);
  await expect(page.locator('#veil')).toHaveClass(/show/);
}

test('a clean win pays exactly what the panel says it pays', async ({ page }) => {
  await start(page, { unlocked: 1, gold: 400, seen: { 0: true } });
  const before = await gold(page);
  await clear(page, 1);

  const e = await cfg(page);
  await expect(page.locator('#goldEarned')).toHaveText(`+${e.starGold[3] + e.firstClear}`);
  await expect(page.locator('#goldWhy')).toContainText('3★');
  await expect(page.locator('#goldWhy')).toContainText('first clear');

  /* the number on the panel and the number in the purse have to be the same
     number, which is the whole point of showing it */
  const shown = Number((await page.locator('#goldEarned').textContent()).replace('+', ''));
  expect(await gold(page)).toBe(before - e.attempt + shown);
});

test('next charges for the board it deals', async ({ page }) => {
  await start(page, { unlocked: 1, gold: 400, seen: { 0: true } });
  await clear(page, 1);
  const before = await gold(page);
  await page.locator('#next').click();
  await page.waitForFunction(() => globalThis.App._state.level === 2);

  const e = await cfg(page);
  expect(await gold(page)).toBe(before - e.attempt);
  const s = await page.evaluate(() => ({ moves: globalThis.App._state.moves,
    view: document.body.dataset.view }));
  expect(s.moves).toBe(0);
  expect(s.view).toBe('game');
});

test('an empty purse refuses the next board rather than dealing it on credit', async ({ page }) => {
  await start(page, { unlocked: 1, gold: 400, seen: { 0: true } });
  /* Clear it once first. Spending the purse down during a *first* clear does not
     empty it: the clear pays out on the way to the panel, so the run that was
     supposed to end broke ends solvent and Next is correctly offered. A replay
     pays nothing, which is the only way to reach the panel with no gold. */
  await clear(page, 1);
  await page.locator('#winMap').click();
  await openLevel(page, 1);
  const line = await optimalLine(page);
  await page.evaluate(() => {
    const p = globalThis.App._progress;
    p.spend(p.gold);
  });
  for (const [from, to] of line) await pour(page, from, to);
  await settle(page);
  expect(await gold(page), 'the replay was supposed to pay nothing').toBe(0);

  await expect(page.locator('#next')).toBeDisabled();
  await expect(page.locator('#winHint')).toContainText('Not enough gold');
  const before = await gold(page);
  await page.locator('#next').click({ force: true });
  expect(await gold(page), 'a refused board must not take the money anyway').toBe(before);
  expect(await page.evaluate(() => globalThis.App._state.level)).toBe(1);
});

test('moving on charges once and opens exactly one level', async ({ page }) => {
  /* the largest single transaction in the game, and the panel button for it had
     never been clicked by any test */
  await start(page, { unlocked: 3, gold: 400, seen: { 0: true } });
  await openLevel(page, 3);
  await page.evaluate(() => {
    /* a board with one legal pour that leads nowhere, so the run really ends */
    const S = globalThis.App._state;
    S.tubes = [[0, 1, 0, 1], [2, 3, 2, 3], [4, 5, 5, 4], [1, 0, 1, 0], [3, 2, 3, 2], [5, 5, 4],
               [0, 1, 0, 1], [2, 3, 2, 3], [4, 5, 4, 5], [1, 0, 1, 0]].slice(0, S.tubes.length);
    globalThis.Board.view = globalThis.Rules.clone(S.tubes);
    globalThis.Board.render();
  });
  await pour(page, 2, 5);
  await settle(page);

  await expect(page.locator('#skip')).toBeVisible();
  const e = await cfg(page);
  await expect(page.locator('#skipCost')).toHaveText(String(e.attempt * e.skipMultiple));

  const before = await gold(page);
  await page.locator('#skip').click();
  await page.waitForFunction(() => globalThis.App._state.level === 4);

  const after = await page.evaluate(() => ({
    gold: globalThis.App._progress.gold,
    unlocked: globalThis.App._progress.unlocked,
    stars: globalThis.App._progress.starsFor(3),
    best: globalThis.App._progress.bestFor(3),
    claimed: !!globalThis.App._progress.raw.claimed[3],
    moves: globalThis.App._state.moves
  }));
  expect(after.gold, 'the fee covers the next board too, so there is one charge').toBe(before - e.attempt * e.skipMultiple);
  expect(after.unlocked).toBe(4);
  expect(after.moves).toBe(0);
  /* paying past a board is not beating it, so coming back still pays in full */
  expect(after.stars).toBe(0);
  expect(after.best).toBeNull();
  expect(after.claimed).toBe(false);
});

test('what a run earned survives a reload', async ({ page }) => {
  /* the assertion that the seeding fix in helpers.js exists to make possible:
     before it, a reload put the save back to whatever the spec asked for */
  await start(page, { unlocked: 1, gold: 400, seen: { 0: true } });
  await clear(page, 1);
  const earned = await page.evaluate(() => ({
    gold: globalThis.App._progress.gold,
    stars: globalThis.App._progress.starsFor(1),
    best: globalThis.App._progress.bestFor(1),
    unlocked: globalThis.App._progress.unlocked
  }));
  expect(earned.stars).toBe(3);

  await page.reload();
  await page.waitForFunction(() => !!globalThis.App);
  const after = await page.evaluate(() => ({
    gold: globalThis.App._progress.gold,
    stars: globalThis.App._progress.starsFor(1),
    best: globalThis.App._progress.bestFor(1),
    unlocked: globalThis.App._progress.unlocked
  }));
  expect(after).toEqual(earned);
});
