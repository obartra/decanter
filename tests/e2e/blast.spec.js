/* The blast, in a browser.

   The unit suite decides everything that is a number: which bottles may be
   destroyed, what the panel should offer, what the run is then worth. None of
   that is what this covers.

   What only exists once there is a page is the flow. A run has to actually be
   lost, the panel has to actually arrive, the button has to be on it, pressing
   it has to open a shelf of real bottles, choosing one has to take the gold and
   put the player back on a board that is one bottle shorter and still winnable,
   and the run has to go on to score at two rather than three. Every one of those
   is a thing this project has had go wrong: a hidden attribute overridden by a
   display rule, a panel offering buttons for a run that had not happened.

   Levels are asked for rather than written down, so moving which boards are the
   other game cannot turn these into tests of something else. */
import { test, expect } from '@playwright/test';
import { start, openLevel, settle, dismissChapter } from './helpers.js';

const purse = page => page.evaluate(() => globalThis.App._progress.gold);
const price = page => page.evaluate(() => globalThis.CONFIG.economy.blast);

/* The first section that has handed the blast over, asked for rather than
   assumed, and the first pour level in it. */
const blastLevel = page => page.evaluate(() => {
  const size = globalThis.CONFIG.sectionSize;
  for (let s = 0; s < 12; s++){
    if (!globalThis.Chapters.perksFor(s).blast) continue;
    for (let l = s * size + 1; l <= s * size + size; l++){
      if (!globalThis.Levels.isBubble(l)) return l;
    }
  }
  return null;
});

/* Put a shelf on the board that is lost for want of pours rather than out of
   them, and end the run on it.

   `short` is the only ending a blast can answer, and it is the one hardest to
   reach by playing: it needs more work left than the count allows while the
   count still has something in it. Reaching that against a shelf the level
   chose means pouring badly for forty moves and hoping. So the shelf is built
   here, and the ending goes through the same finish() every real run does.

   Four mixed bottles and one empty. Twelve pours of work against eleven left,
   so the run is lost; take any one of the four away and it is eight against
   eleven, so the run comes back. The gap between those two numbers is the whole
   mechanism, and the shelf is chosen so it exists rather than hoping. */
const SHORT_SHELF = [[0,1,0,1],[1,0,1,0],[2,3,2,3],[3,2,3,2],[]];
const SHORT_PAR = 8;           /* par + 2 + 1 - 0 moves, so eleven pours left */

async function loseShort(page, shelf = SHORT_SHELF){
  await page.evaluate(([t, par]) => {
    const S = globalThis.App._state;
    S.tubes = t.map(b => b.slice());
    S.par = par;
    S.parExact = true;
    S.moves = 0;
    S.history = [];
    globalThis.Board.view = globalThis.Rules.clone(S.tubes);
    globalThis.Board.render();
  }, [shelf, SHORT_PAR]);
  await page.evaluate(() => globalThis.App._end());
  await page.waitForFunction(() => document.getElementById('veil').classList.contains('show'));
  const why = await page.evaluate(() => globalThis.App._state.reason);
  if (why !== 'short') throw new Error(`wanted a run short of pours, got ${why}`);
}
const loseIt = loseShort;

const seenAll = () => Object.fromEntries([...Array(12)].map((_, i) => [i, true]));

test('a failed run is offered a blast, once the chapter has handed it over', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, seen: seenAll() });
  const level = await blastLevel(page);
  expect(level, 'some chapter has to grant the blast').toBeTruthy();

  await openLevel(page, level);
  await loseIt(page);

  await expect(page.locator('#blast')).toBeVisible();
  await expect(page.locator('#blast')).toBeEnabled();
  expect(await page.locator('#blastCost').textContent()).toBe(String(await price(page)));
});

test('is not offered on a board that was won', async ({ page }) => {
  /* There is nothing to rescue on a finished run, and a rescue offered there is
     a way to spend sixty five gold on nothing. */
  await start(page, { unlocked: 120, gold: 400, seen: seenAll() });
  const level = await blastLevel(page);
  await openLevel(page, level);

  await page.evaluate(() => {
    const S = globalThis.App._state;
    /* a solved shelf, so finish() rates it rather than failing it */
    S.tubes = [[0,0,0,0],[1,1,1,1],[]];
    S.par = 20;
    S.parExact = true;
    S.moves = 20;
  });
  await page.evaluate(() => globalThis.App._end());
  await page.waitForFunction(() => document.getElementById('veil').classList.contains('show'));

  await expect(page.locator('#blast')).toBeHidden();
});

test('is not offered before the chapter that grants it', async ({ page }) => {
  await start(page, { unlocked: 3, gold: 400, seen: seenAll() });
  await openLevel(page, 3);
  await loseIt(page);

  await expect(page.locator('#retry')).toBeVisible();
  await expect(page.locator('#blast')).toBeHidden();
});

test('opens a shelf of real bottles, and charges nothing for looking', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, seen: seenAll() });
  await openLevel(page, await blastLevel(page));
  await loseIt(page);

  const before = await purse(page);
  await page.locator('#blast').click();
  await expect(page.locator('#blastPick')).toBeVisible();

  /* exactly the bottles the rules allow, and each drawn as what it holds */
  const offered = await page.locator('#blastPick button').count();
  const allowed = await page.evaluate(() => {
    const S = globalThis.App._state;
    return globalThis.Rules.blastTargets(S.tubes, S.moves, S.par, S.parExact, null).length;
  });
  expect(offered).toBe(allowed);
  expect(offered).toBeGreaterThan(0);
  expect(await page.locator('#blastPick button').first().locator('i').count())
    .toBeGreaterThan(0);
  expect(await purse(page), 'opening the shelf is free').toBe(before);

  /* and the same button is the way back out, saying so */
  await expect(page.locator('#blast')).toHaveText(/Cancel/);
  await expect(page.locator('#blast')).toHaveClass(/armed/);
  await page.locator('#blast').click();
  await expect(page.locator('#blastPick')).toBeHidden();
  await expect(page.locator('#blast')).toHaveText(/Blast/);
  await expect(page.locator('#blast')).not.toHaveClass(/armed/);
  expect(await purse(page), 'and backing out costs nothing').toBe(before);
});

test('cannot be armed at all without the gold for it', async ({ page }) => {
  /* The mode is only enterable when it can be paid for, so nobody opens a shelf
     of bottles they cannot buy and finds out at the last tap. */
  await start(page, { unlocked: 120, gold: 400, seen: seenAll() });
  await openLevel(page, await blastLevel(page));
  await page.evaluate(() => {
    const p = globalThis.App._progress;
    p.spend(p.gold - globalThis.CONFIG.economy.blast + 1);   /* one short */
  });
  await loseIt(page);

  await expect(page.locator('#blast')).toBeVisible();
  await expect(page.locator('#blast')).toBeDisabled();
  await expect(page.locator('#blastPick')).toBeHidden();
});

test('takes the gold, takes the bottle, and hands the run back', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, seen: seenAll() });
  await openLevel(page, await blastLevel(page));
  await loseIt(page);

  const cost = await price(page);
  const before = await purse(page);
  const shelf = await page.evaluate(() => globalThis.App._state.tubes.length);

  await page.locator('#blast').click();
  await page.locator('#blastPick button').first().click();
  await settle(page);

  expect(await purse(page), 'the blast was paid for').toBe(before - cost);
  expect(await page.evaluate(() => globalThis.App._state.tubes.length),
    'the shelf lost a bottle').toBe(shelf - 1);
  expect(await page.locator('#board .bottle').count(),
    'and so did the board on screen').toBe(shelf - 1);

  /* the run is live again: not over, not finished, and the panel is gone */
  const s = await page.evaluate(() => {
    const S = globalThis.App._state;
    return { over: S.over, finished: S.finished, reason: S.reason,
             blownUp: S.blownUp, spilled: [...S.spilled], history: S.history.length };
  });
  expect(s.over, 'a resumed run must take pours again').toBe(false);
  expect(s.finished, 'and must be able to score when it ends').toBe(false);
  expect(s.reason).toBe(null);
  expect(s.blownUp).toBe(true);
  expect(s.spilled.length, 'something was spilled').toBeGreaterThan(0);
  expect(s.history, 'the snapshots describe a shelf that no longer exists').toBe(0);
  await expect(page.locator('#veil')).not.toHaveClass(/show/);
});

test('caps the resumed run at two stars, and only offers one', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, seen: seenAll() });
  await openLevel(page, await blastLevel(page));
  await loseIt(page);
  await page.locator('#blast').click();
  await page.locator('#blastPick button').first().click();
  await settle(page);

  /* The HUD says what the run is still worth, and it can never say three again. */
  expect(await page.locator('#statStars').innerHTML())
    .not.toContain('★★★');
  const live = await page.evaluate(() => {
    const S = globalThis.App._state;
    return globalThis.Rules.rate(S.par, S.par, S.parExact, S.vesselUsed || S.blownUp);
  });
  expect(live, 'even a perfect finish from here is two').toBe(2);

  /* and a second one is not on offer when this run ends again */
  await loseIt(page);
  await expect(page.locator('#blast')).toBeHidden();
});

test('never offers a target that would end the run', async ({ page }) => {
  /* The worst version of this feature: sixty five gold for an outcome worse
     than not pressing it. Checked against the rules on the live board rather
     than on a shelf written down here. */
  await start(page, { unlocked: 120, gold: 400, seen: seenAll() });
  await openLevel(page, await blastLevel(page));
  await loseIt(page);
  await page.locator('#blast').click();

  const bad = await page.evaluate(() => {
    const { Rules } = globalThis, S = globalThis.App._state;
    return Rules.blastTargets(S.tubes, S.moves, S.par, S.parExact, null).filter(i => {
      const after = Rules.blast(S.tubes, i);
      return !!Rules.lostBecause(after.tubes, S.moves, S.par, S.parExact, new Set(after.spilled));
    });
  });
  expect(bad, 'every offered bottle must leave the run alive').toEqual([]);
});

test('the other game gets a bomb from the same chapter and the same purse', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, seen: seenAll() });
  const bubble = await page.evaluate(() =>
    [...Array(120)].map((_, i) => i + 1).find(globalThis.Levels.isBubble));

  await page.locator(`[data-level="${bubble}"]`).click();
  await page.waitForFunction(l => globalThis.App._state.level === l, bubble);
  await dismissChapter(page);

  await expect(page.locator('#bubbleBomb')).toBeVisible();
  const cost = await price(page);
  const before = await purse(page);

  await page.locator('#bubbleBomb').click();
  const s = await page.evaluate(() => ({
    loaded: globalThis.BubbleApp._state.loaded,
    bombIs: globalThis.BubbleConfig.BOMB,
    aided: globalThis.BubbleApp._state.aided
  }));
  expect(s.loaded, 'a bomb is in hand').toBe(s.bombIs);
  expect(s.aided, 'and the run is capped for it').toBe(true);
  expect(await purse(page), 'paid out of the same purse as the pour game blast')
    .toBe(before - cost);

  /* swap and hint have nothing to say about a bomb, and must not be pressable */
  await expect(page.locator('#bubbleSwap')).toBeDisabled();
  await expect(page.locator('#bubbleHint')).toBeDisabled();
  await expect(page.locator('#bubbleBomb')).toBeDisabled();
});

test('a fired bomb clears a patch and leaves the loop running', async ({ page }) => {
  /* The sentinel must never reach the palette. PALETTE[-2] is undefined, the
     renderer slices whatever it is handed, and the throw escapes draw() before
     the next frame is asked for — the game would stop for good with nothing on
     screen to say why. So this fires one and then watches the clock. */
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/bubble/');
  await page.waitForFunction(() => !!globalThis.BubbleApp);

  await page.locator('#bubbleBomb').click();
  await page.waitForFunction(() =>
    globalThis.BubbleApp._state.loaded === globalThis.BubbleConfig.BOMB);
  /* a frame with a bomb in hand has to draw before it is fired */
  await page.waitForTimeout(120);

  const before = await page.evaluate(() =>
    globalThis.BubbleGrid.occupied(globalThis.BubbleApp._state.board).length);
  await page.evaluate(() => {
    globalThis.BubbleApp._state.aim = { x: 0, y: -1 };
    globalThis.BubbleApp.fire();
  });
  await page.waitForFunction(() => globalThis.BubbleApp._state.mode === 'aim'
    && globalThis.BubbleApp._state.loaded !== globalThis.BubbleConfig.BOMB,
    null, { timeout: 15_000 });

  const after = await page.evaluate(() =>
    globalThis.BubbleGrid.occupied(globalThis.BubbleApp._state.board).length);
  expect(after, 'a bomb takes a patch out of the board').toBeLessThan(before);
  expect(await page.evaluate(() => globalThis.BubbleApp._state.bombs)).toBe(1);

  /* the loop is still turning, which is the thing a palette throw would kill */
  const shots = await page.evaluate(() => globalThis.BubbleApp._state.shots);
  await page.waitForTimeout(200);
  expect(errors, 'nothing threw out of the frame loop').toEqual([]);
  expect(await page.evaluate(() => globalThis.BubbleApp._state.shots)).toBe(shots);
  await expect(page.locator('#bubbleBomb')).toBeEnabled();
});
