/* The bubble game, in a browser that actually animates.

   The unit suite proves the geometry: where a shot lands, what pops, what falls.
   None of that needs a browser. What does need one is the part that only exists
   once there is a canvas and a clock: that the page boots, that a shot fired at
   an angle arrives where the solver said it would, and that the board and the
   screen agree afterwards. */
import { test, expect } from '@playwright/test';

const open = async page => {
  await page.goto('/bubble/');
  await page.waitForFunction(() => !!globalThis.BubbleApp && !!globalThis.BubbleApp._state.board);
};

const state = page => page.evaluate(() => {
  const { BubbleApp: A, BubbleGrid: G, BubbleRules: R } = globalThis;
  return {
    mode: A._state.mode,
    occupied: G.occupied(A._state.board).length,
    loaded: A._state.loaded,
    live: R.liveColours(A._state.board),
    shots: A._state.shots
  };
});

test('boots and deals a board without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await open(page);
  const s = await state(page);
  expect(s.occupied).toBeGreaterThan(30);
  expect(s.mode).toBe('aim');
  /* the colour in hand must be one that is actually on the board, or the shot
     cannot match anything and the board only ever grows */
  expect(s.live).toContain(s.loaded);
  expect(errors).toEqual([]);
});

test('the loop keeps running', async ({ page }) => {
  await open(page);
  /* a canvas that is never redrawn looks identical to one that is, until
     something moves; this is the cheapest proof the frame loop is alive */
  const frames = await page.evaluate(() => new Promise(res => {
    let n = 0;
    const tick = () => { if (++n < 5) requestAnimationFrame(tick); else res(n); };
    requestAnimationFrame(tick);
  }));
  expect(frames).toBe(5);
});

test('a shot lands exactly where the solver said it would', async ({ page }) => {
  /* The one bug that matters most in this genre is the guide and the bubble
     disagreeing. They cannot here, because there is one resolved path that the
     guide draws and the flight walks, and this is the assertion that says so. */
  await open(page);
  const predicted = await page.evaluate(() => {
    const { BubbleApp: A, BubbleShot: S, BubbleConfig: C } = globalThis;
    const aim = S.aimFrom(C.MUZZLE, { x: C.MUZZLE.x + 3, y: 2 });
    A._state.aim = aim;
    const shot = S.resolveShot(A._state.board, C.MUZZLE, aim);
    return shot.landing;
  });
  expect(predicted).not.toBeNull();

  await page.evaluate(() => globalThis.BubbleApp.fire());
  await page.waitForFunction(() => globalThis.BubbleApp._state.mode === 'aim', null, { timeout: 15_000 });

  const landed = await page.evaluate(l => {
    const { BubbleApp: A, BubbleGrid: G } = globalThis;
    return G.at(A._state.board, l.j, l.c);
  }, predicted);
  expect(landed).toBeGreaterThanOrEqual(0);
});

test('a shot that completes three of a colour clears them', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => {
    /* an arranged board, so the outcome is a fact rather than a hope: two of a
       colour side by side, everything else another colour, and a clear lane */
    const { BubbleApp: A, BubbleGrid: G } = globalThis;
    const b = G.create(0);
    for (let c = 0; c < 10; c++) b.rows[0][c] = 1;
    b.rows[0][4] = 0; b.rows[0][5] = 0;
    A._state.board = b;
    A._state.loaded = 0;
    A._state.mode = 'aim';
    return G.occupied(b).length;
  });

  await page.evaluate(() => {
    const { BubbleApp: A, BubbleShot: S, BubbleConfig: C, BubbleGrid: G } = globalThis;
    /* aim at the gap under the pair so the third of that colour lands touching */
    const target = G.centreOf(A._state.board, 1, 4);
    A._state.aim = S.aimFrom(C.MUZZLE, target);
    A.fire();
  });
  await page.waitForFunction(() => globalThis.BubbleApp._state.mode === 'aim', null, { timeout: 15_000 });

  const after = await page.evaluate(() => globalThis.BubbleGrid.occupied(globalThis.BubbleApp._state.board).length);
  /* three left the board, so it is smaller than it was even after the new one
     arrived; a landing that did not match would have made it larger */
  expect(after).toBeLessThan(before);
});

test('does not serve the other game at this path', async ({ page }) => {
  await open(page);
  expect(await page.title()).toBe('Bubble');
  const leaked = await page.evaluate(() => !!globalThis.Levels || !!globalThis.PARS);
  expect(leaked, 'the water sort game leaked into the bubble page').toBe(false);
});
