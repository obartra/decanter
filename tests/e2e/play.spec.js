/* Playing a level, end to end, in a browser that actually animates. */
import { test, expect } from '@playwright/test';
import { start, openLevel, pour, settle, optimalLine } from './helpers.js';

test('boots to the map without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await start(page);
  await expect(page.locator('[data-level="1"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a level plays to a clean win and pays for it', async ({ page }) => {
  await start(page, { unlocked: 1, gold: 400 });
  await openLevel(page, 1);

  const line = await optimalLine(page);
  expect(line.length).toBeGreaterThan(0);

  for (const [from, to] of line) await pour(page, from, to);
  await settle(page);

  /* the panel is the game's own account of what happened */
  await expect(page.locator('#veil')).toHaveClass(/show/);
  await expect(page.locator('#winTitle')).toHaveText('Poured clean');
  await expect(page.locator('#winLine')).toHaveText('Solved in the minimum moves.');
  await expect(page.locator('#stars')).toHaveText('★★★');

  const state = await page.evaluate(() => ({
    stars: globalThis.App._progress.starsFor(1),
    unlocked: globalThis.App._progress.unlocked,
    moves: globalThis.App._state.moves,
    par: globalThis.App._state.par
  }));
  expect(state.stars).toBe(3);
  expect(state.moves).toBe(state.par);
  expect(state.unlocked).toBe(2);
});

test('a perfect run offers only the way forward', async ({ page }) => {
  /* Retry and Move On both set hidden, and both are priced buttons. A display
     rule on .btn.priced used to outrank the browser's [hidden], so a clean run
     showed all three. Nothing in a unit test can see that. */
  await start(page, { unlocked: 1, gold: 400 });
  await openLevel(page, 1);
  for (const [from, to] of await optimalLine(page)) await pour(page, from, to);
  await settle(page);

  await expect(page.locator('#veil')).toHaveClass(/show/);
  await expect(page.locator('#next')).toBeVisible();
  await expect(page.locator('#retry')).toBeHidden();
  await expect(page.locator('#skip')).toBeHidden();
});

test('the pour count falls to nothing and the stars go with it', async ({ page }) => {
  await start(page, { unlocked: 1, gold: 400 });
  await openLevel(page, 1);
  const par = await page.evaluate(() => globalThis.App._state.par);
  await expect(page.locator('#statLeft')).toHaveText(String(par + 3));
  await expect(page.locator('#pourLabel')).toHaveText('pours left');

  const line = await optimalLine(page);
  await pour(page, ...line[0]);
  await expect(page.locator('#statLeft')).toHaveText(String(par + 2));
  await expect(page.locator('#statStars')).toHaveText('★★★');
});

test('undo puts back exactly what the pour took', async ({ page }) => {
  await start(page, { unlocked: 1, gold: 400 });
  await openLevel(page, 1);
  const before = await page.evaluate(() => JSON.stringify(globalThis.App._state.tubes));
  const [from, to] = (await optimalLine(page))[0];
  await pour(page, from, to);
  await page.locator('#undo').click();
  const after = await page.evaluate(() => JSON.stringify(globalThis.App._state.tubes));
  expect(after).toBe(before);
  await expect(page.locator('#statLeft')).toHaveText(
    String(await page.evaluate(() => globalThis.App._state.par + 3)));
});

test('a board with no legal pour ends the run and says why', async ({ page }) => {
  await start(page, { unlocked: 1, gold: 400 });
  await openLevel(page, 1);
  /* A real deadlock takes a specific board, so one is arranged and then a legal
     pour is played into it. The run has to end on that pour, not later. */
  await page.evaluate(() => {
    const S = globalThis.App._state;
    /* One pour away from a dead board. Every bottle but the last is full, so the
       last is the only one with room, and after it fills nothing on any other
       top matches it. Pouring into an empty is always legal, so a deadlock needs
       no empty bottle anywhere. */
    S.tubes = [[0, 1, 0, 1], [2, 3, 2, 3], [4, 5, 5, 4], [1, 0, 1, 0], [3, 2, 3, 2], [5, 5, 4]];
    globalThis.Board.view = globalThis.Rules.clone(S.tubes);
    globalThis.Board.render();
    S.moves = 4;
  });
  /* the only pour on the board, and it leaves nothing playable */
  await pour(page, 2, 5);
  await settle(page);

  await expect(page.locator('#veil')).toHaveClass(/show/);
  await expect(page.locator('#winTitle')).toHaveText('Failed');
  await expect(page.locator('#winLine')).toHaveText('You are out of valid moves.');
  const stars = await page.evaluate(() => globalThis.App._progress.starsFor(1));
  expect(stars).toBe(0);
});

/* A run could only ever end on a pour: `lostBecause` was consulted in exactly
   one place, inside the code that commits a move. That is the obvious moment
   and it is where most endings happen, but par is not always known when a board
   is dealt — the baked one is refused if it is below what the board plainly
   still needs — and the search that answers it is allowed eight seconds. Pours
   made during those seconds count, so the answer can arrive already spent. The
   counter relabelled itself to no pours left and the run carried on underneath
   it. */
test('a par that lands after its pours are spent ends the run', async ({ page }) => {
  await start(page, { unlocked: 4, gold: 400, seen: { 0: true } });

  /* Force the deal to refuse its baked par so the game has to ask for one, and
     hold the answer so the run can be moved on underneath it. Both patches undo
     themselves the moment the search starts, so only this deal is affected. */
  await page.evaluate(() => {
    const realMin = globalThis.Rules.minPours;
    const realSolve = globalThis.SolverClient.solve;
    globalThis.Rules.minPours = () => 9999;
    globalThis.SolverClient.solve = (tubes, colors, cb) => {
      globalThis.Rules.minPours = realMin;
      globalThis.SolverClient.solve = realSolve;
      realSolve(tubes, colors, res => { globalThis.__answer = () => cb(res); });
    };
  });
  await openLevel(page, 4);
  expect(await page.evaluate(() => globalThis.App._state.par), 'the deal should have no par')
    .toBe(null);
  await page.waitForFunction(() => !!globalThis.__answer);

  /* the pours that were made while the search was running */
  await page.evaluate(() => { globalThis.App._state.moves = 999; });
  await page.evaluate(() => globalThis.__answer());

  await expect(page.locator('#veil')).toHaveClass(/show/);
  expect(await page.evaluate(() => globalThis.App._state.over)).toBe(true);
  expect(await page.evaluate(() => globalThis.App._state.reason)).toBe('over');
  await expect(page.locator('#winTitle')).toHaveText('Failed');
});
