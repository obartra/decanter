/* Some levels are the other game.

   The unit suite decides which ones and proves the scoring compares the right
   way round. What it cannot reach is the part that only exists once there is a
   page: that opening one of those levels deals a bubble board rather than a
   shelf of bottles, that finishing it pays through the same panel at the same
   prices, and that the two games do not tread on each other now that both are
   inlined into one document.

   Every level number here is asked for rather than written down, so moving which
   boards are bubble cannot quietly turn these into tests of the pour game. */
import { test, expect } from '@playwright/test';
import { start, dismissChapter } from './helpers.js';

const kinds = page => page.evaluate(() => {
  const all = [...Array(120)].map((_, i) => i + 1);
  return {
    bubble: all.filter(globalThis.Levels.isBubble),
    pour: all.filter(l => !globalThis.Levels.isBubble(l))
  };
});

/* opens a level from the map without waiting for bottles, since a bubble board
   has none */
async function open(page, level){
  await page.locator(`[data-level="${level}"]`).click();
  await page.waitForFunction(l => globalThis.App._state.level === l, level);
  await dismissChapter(page);
}

const purse = page => page.evaluate(() => globalThis.App._progress.gold);

test('a bubble level deals a bubble board, not a shelf', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });
  const { bubble } = await kinds(page);
  await open(page, bubble[0]);

  await expect(page.locator('body')).toHaveAttribute('data-view', 'bubble');
  await expect(page.locator('#bubbleView')).toBeVisible();
  await expect(page.locator('#gameView')).toBeHidden();
  const board = await page.evaluate(() => ({
    occupied: globalThis.BubbleGrid.occupied(globalThis.BubbleApp._state.board).length,
    shots: globalThis.BubbleApp._state.shots
  }));
  expect(board.occupied).toBeGreaterThan(30);
  expect(board.shots).toBe(0);
});

test('a pour level is still a pour level', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });
  const { pour } = await kinds(page);
  await open(page, pour[3]);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'game');
  await expect(page.locator('#board .bottle').first()).toBeVisible();
});

test('the same board every time, for everyone', async ({ page }) => {
  /* level 14 has to be the same puzzle on every device and every reload, the
     same way every pour level is */
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });
  const { bubble } = await kinds(page);
  const hash = async () => {
    await open(page, bubble[1]);
    const h = await page.evaluate(() => globalThis.BubbleGrid.hash(globalThis.BubbleApp._state.board));
    await page.locator('#bubToMap').click();
    return h;
  };
  const first = await hash();
  await page.reload();
  /* `App` existing is not the map being on screen: the medallions are drawn
     during boot, and clicking one before then is a race that only shows under
     load. Waiting for the node itself waits for the thing about to be clicked. */
  await page.waitForFunction(() => !!globalThis.App);
  await page.locator(`[data-level="${bubble[1]}"]`).waitFor({ state: 'visible' });
  expect(await hash()).toBe(first);
});

test('a bubble run banks through the same panel, at the same prices', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });
  const { bubble } = await kinds(page);
  const level = bubble[0];
  await open(page, level);
  const spent = await purse(page);

  /* a run worth three stars, ended deliberately rather than played out */
  await page.evaluate(() => {
    const { BubbleApp: A, BubbleConfig: C } = globalThis;
    A._state.shots = C.STAR_SHOTS.three + 5;
    A.finish('lost');
  });

  await expect(page.locator('#veil')).toHaveClass(/show/, { timeout: 15_000 });
  await expect(page.locator('#stars')).toHaveText('★★★');
  await expect(page.locator('#winLine')).toContainText('Lasted');
  /* the bubble game's own panel is not on this page at all: inside the other
     game the result is shown once, on the panel that has the gold on it */
  await expect(page.locator('#bubbleVeil')).toHaveCount(0);

  const after = await page.evaluate(l => ({
    gold: globalThis.App._progress.gold,
    stars: globalThis.App._progress.starsFor(l),
    best: globalThis.App._progress.bestFor(l),
    unlocked: globalThis.App._progress.unlocked
  }), level);
  expect(after.stars).toBe(3);
  expect(after.gold).toBeGreaterThan(spent);
  expect(after.best, 'best on a bubble level is how long the run lasted')
    .toBe(await page.evaluate(() => globalThis.BubbleApp._state.shots));
});

test('a longer bubble run replaces a shorter one, never the other way', async ({ page }) => {
  /* the inversion, end to end: two runs of the same level, the shorter played
     second, and the save has to keep the longer */
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });
  const { bubble } = await kinds(page);
  const level = bubble[0];

  const runFor = async shots => {
    await open(page, level);
    await page.evaluate(n => {
      globalThis.BubbleApp._state.shots = n;
      globalThis.BubbleApp.finish('lost');
    }, shots);
    await expect(page.locator('#veil')).toHaveClass(/show/, { timeout: 15_000 });
    await page.locator('#winMap').click();
    await expect(page.locator('body')).toHaveAttribute('data-view', 'map');
  };

  await runFor(90);
  expect(await page.evaluate(l => globalThis.App._progress.bestFor(l), level)).toBe(90);
  await runFor(40);
  expect(await page.evaluate(l => globalThis.App._progress.bestFor(l), level),
    'a shorter run overwrote a longer one').toBe(90);
});

test('the two games do not tread on each other in one page', async ({ page }) => {
  /* Both are inlined into this document now. The bubble game must not have
     booted itself behind the map, and neither game's stylesheet may restyle the
     other's buttons. */
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });

  expect(await page.evaluate(() => !!globalThis.BubbleApp._state.board),
    'the bubble game dealt a board behind the map').toBe(false);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'map');

  /* the pour game's own buttons still look like themselves */
  const daily = await page.locator('#daily').evaluate(el => getComputedStyle(el).borderRadius);
  expect(daily).toBe('999px');
  expect(errors).toEqual([]);
});

test('leaving a bubble level goes back to the map', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });
  const { bubble } = await kinds(page);
  await open(page, bubble[0]);
  await page.locator('#bubToMap').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'map');
});

test('the chapters hand over the bubble tools too', async ({ page }) => {
  /* The grants are the same grants. An undo is an undo whichever board is in
     front of you, so a chapter that has not handed one over must not hand one
     over on a bubble board either. */
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });
  const { bubble } = await kinds(page);

  await open(page, bubble[0]);
  const shown = async perks => {
    await page.evaluate(p => {
      globalThis.BubbleApp.allow = p;
      globalThis.BubbleApp.paintTools();
    }, perks);
    return page.evaluate(() => ({
      undo: !document.getElementById('bubbleUndo').hidden,
      hint: !document.getElementById('bubbleHint').hidden,
      colour: !document.getElementById('bubblePick').hidden
    }));
  };

  expect(await shown({ undo: true, hint: false, colour: false }))
    .toEqual({ undo: true, hint: false, colour: false });
  expect(await shown({ undo: true, hint: true, colour: true }))
    .toEqual({ undo: true, hint: true, colour: true });
});

test('a bubble tool is paid for out of the same purse', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });
  const { bubble } = await kinds(page);
  await open(page, bubble[0]);

  /* the free undos first, then the priced ones, exactly as the pour game does */
  const free = await page.evaluate(() => globalThis.App._progress.perks().freeUndos);
  const cost = await page.evaluate(() => globalThis.CONFIG.economy.undoCost);
  await page.evaluate(n => {
    /* n + 1 shots so there is history to take back */
    const A = globalThis.BubbleApp;
    for (let i = 0; i <= n; i++){ A._state.past.push({ rows: A._state.board.rows.map(r => r.slice()),
      parity: A._state.board.parity, loaded: A._state.loaded, next: A._state.next,
      shots: 0, sinceDrop: 0, score: 0, rand: 1 }); }
  }, free);

  let before = await purse(page);
  for (let i = 0; i < free; i++) await page.evaluate(() => globalThis.BubbleApp.undo());
  expect(await purse(page), 'the free undos were charged for').toBe(before);

  before = await purse(page);
  await page.evaluate(() => globalThis.BubbleApp.undo());
  expect(await purse(page), 'the undo past the free ones was not charged').toBe(before - cost);
});

test('an empty purse refuses a bubble tool rather than giving it away', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });
  const { bubble } = await kinds(page);
  await open(page, bubble[0]);
  await page.evaluate(() => {
    const p = globalThis.App._progress;
    p.spend(p.gold);
  });
  const colours = await page.evaluate(() => globalThis.BubbleRules.liveColours(globalThis.BubbleApp._state.board));
  const took = await page.evaluate(c => globalThis.BubbleApp.pickColour(c), colours[1]);
  expect(took, 'a colour was handed over on an empty purse').toBe(false);
  expect(await page.evaluate(() => globalThis.BubbleApp._state.aided),
    'a refused purchase still capped the run').toBe(false);
  expect(await purse(page)).toBe(0);
});

test('paying past a board deals the game the next level actually is', async ({ page }) => {
  /* Move on dealt the next level by calling the pour game's start() directly,
     skipping the branch that asks which game a level number is. Twenty three of
     the hundred and twenty levels are the other game, so paying past the board
     before any of them dealt a shelf of bottles on a bubble level: a par to
     score against, a pour count in the HUD, and a best filed through
     progress.complete, which reads Levels.isBubble to decide which direction
     better is and would have recorded a twelve pour clear as a twelve shot run.

     The level is found rather than written down, so moving which boards are the
     other game cannot turn this into a test of nothing. */
  const seen = Object.fromEntries([...Array(12)].map((_, i) => [i, true]));
  await start(page, { unlocked: 120, gold: 400, seen });
  const { bubble } = await kinds(page);
  const before = bubble.find(b => b > 1);

  /* Move on is only offered when the next level is not already open — being
     beaten by a board is not the same as being stuck on one — so the frontier
     has to sit exactly here. */
  await start(page, { unlocked: before - 1, gold: 400, seen });
  await open(page, before - 1);
  await page.evaluate(() => globalThis.App._end());
  await page.waitForFunction(() => document.getElementById('veil').classList.contains('show'));
  await page.locator('#skip').click();

  await page.waitForFunction(l => globalThis.App._state.level === l, before);
  expect(await page.evaluate(() => document.body.dataset.view),
    'a bubble level must not be shown as a shelf of bottles').toBe('bubble');
  expect(await page.evaluate(() => globalThis.BubbleApp._state.board !== null),
    'and it must actually have been dealt a bubble board').toBe(true);
});
