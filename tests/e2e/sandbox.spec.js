/* The bubble sandbox, which is Jabari mode's.

   Two things are worth a browser for. The first is that it exists at all only
   when the beta word is in the address bar, because the whole point of a fence
   is that it holds. The second is that nothing it does can pay: it is the same
   game, dealt from the same code, against a save that a graded run would move,
   so "this one does not count" is a claim about wiring rather than about intent
   and wiring is what breaks.

   The rest of it is the pace, which is the feature: a row every N shots, and no
   shot limit at all, so the only way out is an empty board or the line. */
import { test, expect } from '@playwright/test';
import { start } from './helpers.js';

const BETA = '/?jabarimoneeey';

const state = page => page.evaluate(() => globalThis.BubbleApp._state);
const rules = page => page.evaluate(() => globalThis.BubbleApp.rules);

/* Open the picker and take a pace by its visible name, the way a hand would. */
async function pick(page, name){
  await page.locator('#sandbox').click();
  await expect(page.locator('#sandboxVeil')).toHaveClass(/show/);
  await page.locator('#sandboxPicks .btn', { hasText: name }).click();
  /* taking a name previews it; Play is what deals it */
  await page.locator('#sandboxPlay').click();
  await page.waitForFunction(() => globalThis.BubbleApp
    && globalThis.BubbleApp._state.board
    && globalThis.BubbleApp.rules.runShots === null);
}

test('is not there at all without the word', async ({ page }) => {
  await start(page, { unlocked: 40, gold: 400 });
  await expect(page.locator('#sandbox')).toBeHidden();
  /* and not merely hidden: nothing was drawn into it and nothing listens */
  expect(await page.evaluate(() => document.getElementById('sandbox').innerHTML)).toBe('');
});

test('opens a board at the pace it was asked for, with no limit', async ({ page }) => {
  await start(page, { unlocked: 40, gold: 400 }, { path: BETA });
  await expect(page.locator('#sandbox')).toBeVisible();

  await pick(page, 'Hard');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'bubble');

  const r = await rules(page);
  expect(r.runShots, 'a sandbox board has no shot limit').toBe(null);
  expect(r.graded, 'and is not the graded game').toBe(false);
});

test('shows the four names and none of the numbers behind them', async ({ page }) => {
  /* A setting is three numbers that only mean anything together, so putting one
     of them on the button would name the weakest and read as the setting. */
  await start(page, { unlocked: 40, gold: 400 }, { path: BETA });
  await page.locator('#sandbox').click();
  const labels = await page.locator('#sandboxPicks .btn').allTextContents();
  expect(labels).toEqual(['Easy', 'Normal', 'Hard', 'Ultra']);
  for (const t of labels) expect(t, `${t} shows a number`).not.toMatch(/\d/);
});

test('gets easier by more than the drop cadence', async ({ page }) => {
  /* The thing that makes the names true. Cadence alone flattens near a coin
     flip however slow it gets, so Easy deals fewer colors and fewer rows as
     well, and Ultra deals every color there is. Asserted on the board the game
     actually deals rather than on the table that asked for it. */
  await start(page, { unlocked: 40, gold: 400 }, { path: BETA });

  await pick(page, 'Easy');
  const easy = await page.evaluate(() => ({
    rules: globalThis.BubbleApp.rules,
    colors: globalThis.BubbleRules.liveColors(globalThis.BubbleApp._state.board).length,
    rows: new Set(globalThis.BubbleGrid.occupied(globalThis.BubbleApp._state.board)
      .map(([j]) => j)).size
  }));

  await page.locator('#bubToMap').click();
  await pick(page, 'Ultra');
  const ultra = await page.evaluate(() => ({
    rules: globalThis.BubbleApp.rules,
    colors: globalThis.BubbleRules.liveColors(globalThis.BubbleApp._state.board).length
  }));

  expect(easy.colors, 'Easy dealt every color, so only the cadence is easier')
    .toBeLessThan(ultra.colors);
  expect(easy.colors).toBe(easy.rules.colors);
  expect(easy.rows).toBeLessThanOrEqual(easy.rules.rows);
  expect(ultra.colors).toBe(await page.evaluate(() => globalThis.BubbleConfig.COLORS));
});

test('opens on the one taken last time, and on Normal before there is one',
  async ({ page }) => {
  /* The picker marks the current pace primary, so "what is selected" is a thing
     on screen and not only a variable. A fresh device has never chosen, and an
     unreadable or unrecognized value is the same question, so both land on
     Normal rather than one of them landing somewhere else. */
  await start(page, { unlocked: 40, gold: 400 }, { path: BETA });
  await page.locator('#sandbox').click();
  await expect(page.locator('#sandboxPicks .btn.primary')).toHaveText('Normal');

  /* Taking a name remembers it there and then. Nothing is dealt until Play, so
     this never waits on a board: the choice is what is being remembered. */
  await page.locator('#sandboxPicks .btn', { hasText: 'Hard' }).click();
  await expect(page.locator('#sandboxPicks .btn.primary')).toHaveText('Hard');

  await page.reload();
  await page.waitForFunction(() => !!globalThis.App);
  await page.locator('#sandbox').click();
  await expect(page.locator('#sandboxPicks .btn.primary'),
    'the last pace was not remembered across a reload').toHaveText('Hard');

  /* and a value nothing recognizes is the same as never having chosen */
  await page.evaluate(() => localStorage.setItem('decanter.sandbox.pace', 'nonsense'));
  await page.reload();
  await page.waitForFunction(() => !!globalThis.App);
  await page.locator('#sandbox').click();
  await expect(page.locator('#sandboxPicks .btn.primary')).toHaveText('Normal');
});

test('gives one of each tool and then takes it off the row', async ({ page }) => {
  /* Unlimited was a solver and, worse, a lie: the label said free and the charge
     still went to the purse. One each, free, and gone when spent. */
  await start(page, { unlocked: 40, gold: 400 }, { path: BETA });
  await pick(page, 'Easy');

  await expect(page.locator('#bubblePickCost')).toHaveText('1 free');
  const before = await page.evaluate(() => globalThis.App._progress.gold);

  /* The color, because it charges whenever the board has two colors on it. A
     hint returns before it charges when nothing clears, which is right and would
     make this spend nothing on a board nobody has shot at. */
  const took = await page.evaluate(() => {
    const live = globalThis.BubbleRules.liveColours(globalThis.BubbleApp._state.board);
    return globalThis.BubbleApp.pickColour(live[0]);
  });
  expect(took, 'the color was refused, so nothing was spent').toBe(true);
  await expect(page.locator('#bubblePick'), 'a spent tool stayed on the row').toBeHidden();
  expect(await page.evaluate(() => globalThis.App._progress.gold),
    'a sandbox tool took gold out of the purse').toBe(before);

  /* and a second attempt is refused rather than silently taken */
  expect(await page.evaluate(() => {
    const live = globalThis.BubbleRules.liveColours(globalThis.BubbleApp._state.board);
    return globalThis.BubbleApp.pickColour(live[0]);
  })).toBe(false);

  /* A fresh board hands them all back. Back to the map first, because the
     button that opens the picker lives in the map header and a board is over
     it: clicking it from here is clicking something hidden. */
  await page.locator('#bubToMap').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'map');
  await pick(page, 'Easy');
  await expect(page.locator('#bubblePick')).toBeVisible();
  await expect(page.locator('#bubblePickCost')).toHaveText('1 free');
});

test('previews the board a name deals before dealing it', async ({ page }) => {
  /* A name on its own says nothing and the numbers behind it say less. The board
     says it at a glance, so taking a name draws one and Play is a second press.
     Drawn through the game's own dealer, so it is the board Play would give. */
  await start(page, { unlocked: 40, gold: 400 }, { path: BETA });
  await page.locator('#sandbox').click();

  await page.locator('#sandboxPicks .btn', { hasText: 'Easy' }).click();
  const easy = await page.locator('#sandboxStill .stillRow').count();
  expect(easy, 'no board was drawn for the pick').toBeGreaterThan(0);
  /* still on the map: previewing is not playing */
  await expect(page.locator('body')).toHaveAttribute('data-view', 'map');

  /* and a harder name draws a fuller board, because it deals more rows */
  await page.locator('#sandboxPicks .btn', { hasText: 'Hard' }).click();
  const hard = await page.locator('#sandboxStill .stillRow').count();
  expect(hard, 'Hard drew no more board than Easy').toBeGreaterThan(easy);

  /* previewing left the live rules alone */
  await page.locator('#sandboxPicks .btn', { hasText: 'Easy' }).click();
  await page.locator('#sandboxPlay').click();
  await page.waitForFunction(() => globalThis.BubbleApp._state.board);
  expect(await page.evaluate(() => globalThis.BubbleApp.rules.colors)).toBe(4);
});

test('remembers a best score for each difficulty on its own', async ({ page }) => {
  await start(page, { unlocked: 40, gold: 400 }, { path: BETA });
  await page.locator('#sandbox').click();
  await page.locator('#sandboxPicks .btn', { hasText: 'Easy' }).click();
  await expect(page.locator('#sandboxBest')).toHaveText('No easy run yet.');

  await page.locator('#sandboxPlay').click();
  await page.waitForFunction(() => globalThis.BubbleApp._state.board);
  await page.evaluate(() => {
    globalThis.BubbleApp._state.score = 4200;
    globalThis.BubbleApp.finish('won');
  });
  await expect(page.locator('#sandboxEnd')).toHaveClass(/show/);

  await page.locator('#sandboxToMap').click();
  await page.locator('#sandbox').click();
  await expect(page.locator('#sandboxBest')).toHaveText('Best on easy: 4200');
  /* and it belongs to that difficulty, not to the sandbox at large */
  await page.locator('#sandboxPicks .btn', { hasText: 'Ultra' }).click();
  await expect(page.locator('#sandboxBest')).toHaveText('No ultra run yet.');
});

test('says the goal is an empty board, not a number of shots', async ({ page }) => {
  await start(page, { unlocked: 40, gold: 400 }, { path: BETA });
  await pick(page, 'Easy');
  await expect(page.locator('#bubbleGoal')).toHaveText('Clear the board to win.');
  /* and the readout counts up, because there is nothing to count down to */
  await expect(page.locator('#bubbleLeft')).toHaveText('0 shots');
});

test('banks nothing, however well it goes', async ({ page }) => {
  /* The dangerous one. A sandbox board is the same game against the same save,
     so a run that cleared its board must move neither gold nor stars nor the
     best on whatever level happened to be current. */
  await start(page, { unlocked: 40, gold: 400 }, { path: BETA });
  await pick(page, 'Easy');

  const before = await page.evaluate(() => ({
    gold: globalThis.App._progress.gold,
    stars: globalThis.App._progress.totalStars(),
    level: globalThis.App._state.level
  }));

  /* won outright, which is the ending with the most to pay out */
  const run = await page.evaluate(() => {
    const A = globalThis.BubbleApp;
    A._state.shots = 60;
    A.finish('won');
    return A.result();
  });
  expect(run.cleared).toBe(true);
  expect(run.graded, 'a sandbox run reports itself ungraded').toBe(false);
  expect(run.stars, 'and scores nothing, at the source').toBe(0);

  await expect(page.locator('#sandboxEnd')).toHaveClass(/show/);
  await expect(page.locator('#sandboxResult')).toHaveText('Board cleared');

  const after = await page.evaluate(l => ({
    gold: globalThis.App._progress.gold,
    stars: globalThis.App._progress.totalStars(),
    best: globalThis.App._progress.bestFor(l),
    starsThere: globalThis.App._progress.starsFor(l)
  }), before.level);
  expect(after.gold, 'the purse moved').toBe(before.gold);
  expect(after.stars, 'stars were banked').toBe(before.stars);
  expect(after.best, 'a best was recorded against a level nobody played').toBe(null);
  expect(after.starsThere).toBe(0);
});

test('a level after a sandbox board is the graded game again', async ({ page }) => {
  /* The leak that would be worth real gold: play the easiest pace, then open a
     bubble level and have it deal at that pace and pay for it. */
  await start(page, { unlocked: 40, gold: 400, seen: { 0: true, 1: true, 2: true } },
    { path: BETA });
  await pick(page, 'Easy');
  /* the game's own way back, because the sandbox card is only up once a run has
     ended and this one is abandoned mid board on purpose */
  await page.locator('#bubToMap').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'map');

  const bubble = await page.evaluate(() =>
    [...Array(40)].map((_, i) => i + 1).filter(globalThis.Levels.isBubble)[0]);
  await page.locator(`[data-level="${bubble}"]`).click();
  await page.waitForFunction(() => globalThis.BubbleApp
    && globalThis.BubbleApp.rules.graded === true, null, { timeout: 15_000 });

  const r = await rules(page);
  expect(r.graded, 'a graded level inherited the sandbox pace').toBe(true);
  expect(r.runShots).toBe(await page.evaluate(() => globalThis.BubbleConfig.RUN_SHOTS));
  expect(r.every).toBe(await page.evaluate(() => globalThis.BubbleConfig.ADVANCE_EVERY));
});

test('the run does not end on its own, however many shots it takes', async ({ page }) => {
  await start(page, { unlocked: 40, gold: 400 }, { path: BETA });
  await pick(page, 'Easy');
  /* Well past the graded length, with the board left alone. A limit still in
     force would have finished the run here. */
  const over = await page.evaluate(() => {
    const A = globalThis.BubbleApp, S = A._state;
    S.shots = globalThis.BubbleConfig.RUN_SHOTS * 3;
    S.sinceDrop = 0;
    S.path = { landing: null };
    A.land();
    return S.over;
  });
  expect(over, 'a run with no limit ended itself').toBe(null);
  expect((await state(page)).shots).toBeGreaterThan(100);
});
