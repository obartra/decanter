/* The card before a replay, in a browser.

   `tests/preview.test.mjs` owns what it says, which is numbers and needs no
   page. What needs one is everything here: that a tap on a cleared level opens
   it instead of dealing a board, that backing out costs nothing, and above all
   that the small board on it is the board the level actually deals. A still of
   some other board would be believed, and nothing but a browser can check that
   the picture and the deal agree. */
import { test, expect } from '@playwright/test';
import { start } from './helpers.js';

/* far enough in that there are cleared levels behind the frontier */
const played = {
  unlocked: 18, gold: 400, seen: { 0: true, 1: true },
  stars: Object.fromEntries([...Array(17)].map((_, i) => [i + 1, 3])),
  best: Object.fromEntries([...Array(17)].map((_, i) => [i + 1, 20 + i])),
  claimed: Object.fromEntries([...Array(17)].map((_, i) => [i + 1, true]))
};

const card = page => page.locator('#previewVeil');
const shown = page => card(page).evaluate(el => el.classList.contains('show'));

/* Tap a medallion and wait for the card it answers with.

   The card is not in the critical bundle. It is fetched right after the page
   opens, so the answer to a tap lands a moment after the tap, and every test
   below reads the card. A read taken before it is drawn does not fail loudly:
   `stillColours` comes back empty and `toBeHidden` passes on a row inside a
   panel nobody can see yet. Both of those are green ticks over nothing, so the
   wait lives here rather than at ten call sites where half of them would look
   fine without it. */
const look = async (page, level) => {
  await page.locator(`[data-level="${level}"]`).click();
  await expect(card(page)).toHaveClass(/show/);
};

/* the liquid in the still, bottle by bottle, as palette indices. The bands name
   their colour with the same --cN property the shelf pours, so the picture can
   be read back and compared with the board it claims to be. */
const stillColours = page => page.evaluate(() =>
  [...document.querySelectorAll('#previewStill .stillBottle')].map(b =>
    [...b.querySelectorAll('i')].map(i => {
      const m = /--c(\d+)/.exec(i.getAttribute('style') || '');
      return m ? Number(m[1]) : null;
    })));

test('a cleared level opens the card instead of dealing a board', async ({ page }) => {
  await start(page, played);
  const gold = await page.evaluate(() => globalThis.App._progress.gold);

  await look(page, 5);
  await expect(page.locator('#previewTitle')).toHaveText('Level 5');
  expect(await page.evaluate(() => document.body.dataset.view), 'the board was dealt anyway')
    .toBe('map');
  expect(await page.evaluate(() => globalThis.App._progress.gold),
    'looking at a level must not cost anything').toBe(gold);
});

test('a level not yet cleared is still dealt on the tap', async ({ page }) => {
  /* The card exists to say what is left in a level. A level with no record has
     nothing to put on one, so putting a card there is an extra tap in front of
     the button that was already working. */
  await start(page, played);
  await page.locator('.node.current').click();
  await page.waitForFunction(() => globalThis.App._state.level === 18);
  expect(await shown(page)).toBe(false);
});

test('backing out leaves the map exactly as it was', async ({ page }) => {
  await start(page, played);
  const before = await page.evaluate(() => ({
    gold: globalThis.App._progress.gold, level: globalThis.App._state.level
  }));

  await look(page, 5);
  await page.locator('#previewBack').click();

  expect(await shown(page)).toBe(false);
  expect(await page.evaluate(() => document.body.dataset.view)).toBe('map');
  expect(await page.evaluate(() => ({
    gold: globalThis.App._progress.gold, level: globalThis.App._state.level
  })), 'backing out of the card moved something').toEqual(before);
});

test('the way out is the same three ways out every panel has', async ({ page }) => {
  await start(page, played);
  for (const leave of [
    () => page.locator('#previewVeil').click({ position: { x: 5, y: 5 } }),
    () => page.keyboard.press('Escape')
  ]) {
    await look(page, 5);
    await leave();
    expect(await shown(page)).toBe(false);
    expect(await page.evaluate(() => document.body.dataset.view)).toBe('map');
  }
});

test('playing from the card deals the level the card was about', async ({ page }) => {
  await start(page, played);
  await look(page, 5);
  await page.locator('#previewPlay').click();
  await page.waitForFunction(() => globalThis.App._state.level === 5
    && globalThis.App._state.tubes.length > 0);
  expect(await page.evaluate(() => document.body.dataset.view)).toBe('game');
  expect(await shown(page)).toBe(false);
});

test('the still is the board the level actually deals', async ({ page }) => {
  /* The whole justification for the picture. Levels are deterministic, so the
     card can show the real board, and a picture of some other board would be
     believed, which is worse than no picture at all. */
  await start(page, played);
  await look(page, 5);
  const picture = await stillColours(page);

  await page.locator('#previewPlay').click();
  await page.waitForFunction(() => globalThis.App._state.level === 5
    && globalThis.App._state.tubes.length > 0);
  const dealt = await page.evaluate(() => globalThis.App._state.tubes);

  expect(picture, 'the still is not the board that was dealt').toEqual(dealt);
});

test('a board that has paid everything makes no offer at all', async ({ page }) => {
  /* The number this card exists to carry. A level pays the difference between
     the rating it has and the one you earn, so a perfect board pays nothing for
     another perfect run, and before this the only way to find that out was to
     play it and be handed a +0. Which is also why the card does not simply
     print one: it is the best result in the game, and a nought in the winnings
     slot dresses it up as a refusal. Nor does it announce the absence in words
     underneath, which is that same refusal at greater length. */
  await start(page, played);
  await look(page, 5);
  await expect(page.locator('#previewPayout')).toBeHidden();
  await expect(page.locator('#previewHint')).toBeHidden();
  await expect(page.locator('#previewFee')).toHaveText('free');
  /* and the way back in is still offered, which is the point of the card */
  await expect(page.locator('#previewPlay')).toBeEnabled();
});

test('a level with a star still on it says what that star pays', async ({ page }) => {
  await start(page, { ...played, stars: { ...played.stars, 5: 2 } });
  await look(page, 5);

  const expected = await page.evaluate(() => {
    const g = globalThis.CONFIG.economy.starGold;
    return g[3] - g[2];
  });
  await expect(page.locator('#previewPayout')).toBeVisible();
  await expect(page.locator('#previewGold')).toHaveText(`+${expected}`);
  await expect(page.locator('#previewWhy')).toHaveText(/three stars/i);
  await expect(page.locator('#previewStars'), 'the card should show what the level has')
    .toHaveText('★★★');
  expect(await page.locator('#previewStars .dim').count(),
    'two stars earned should leave one dim').toBe(1);
});

test('the card quotes a target the run will actually score against', async ({ page }) => {
  /* An estimated par scores nothing, so a card that named it as the bar for
     three stars would be promising something the run refuses to measure. */
  await start(page, { ...played, stars: { ...played.stars, 5: 1 } });
  await look(page, 5);
  const par = await page.evaluate(() => globalThis.PARS[5]);
  await expect(page.locator('#previewHint')).toHaveText(`Three stars needs ${par} pours.`);
});

test('a bubble level shows the board its run opens on', async ({ page }) => {
  await start(page, played);
  const level = await page.evaluate(() => {
    for (let l = 1; l <= 17; l++) if (globalThis.Levels.isBubble(l)) return l;
    return null;
  });
  expect(level, 'no bubble level inside the seeded range').not.toBeNull();

  /* This card waits for two bundles rather than one: its own, and the other
     game's, which is where the picture and the shot count come from. The tap
     asks for both together and draws once both have answered, so there is no
     half-drawn state for this to catch. */
  await look(page, level);
  await expect(page.locator('#previewKind')).toHaveText('Bubble run');
  const rows = await page.locator('#previewStill .stillRow').count();
  expect(rows, 'the card drew no board at all').toBeGreaterThan(0);

  await page.locator('#previewPlay').click();
  await page.waitForFunction(() => document.body.dataset.view === 'bubble');

  /* the still and the board that was just dealt, compared cell for cell */
  const agrees = await page.evaluate(l => {
    const { BubbleApp, BubbleGrid, BubbleConfig } = globalThis;
    const board = BubbleApp._state.board;
    let last = -1;
    board.rows.forEach((row, j) => { if (row.some(c => c !== BubbleGrid.EMPTY)) last = j; });
    const live = board.rows.slice(0, last + 1).map((row, j) => ({
      indent: !!BubbleGrid.indent(board, j),
      cells: row.map(c => (c === BubbleGrid.EMPTY ? null : BubbleConfig.PALETTE[c]))
    }));
    return JSON.stringify(live) === JSON.stringify(BubbleApp.still(l));
  }, level);
  expect(agrees, 'the still showed a bubble board the run did not open on').toBe(true);
});

/* Every card waits on a bundle now, and a wait is a window.

   `previewRequest` already covered the obvious thing to do in it, tapping a
   second cleared level. What it did not cover is the other thing a map offers:
   a level never cleared is dealt on the tap rather than carded, so the board is
   up and paid for by the time the bundle lands, and the card then covers it.
   That card is about a different level entirely, its stars and its price and
   its board, and its Play charges again for a board the player is already on.

   Asked of a pour level rather than one of the other game's, because the card
   moved into a bundle of its own and every tap on a cleared level waits on it.
   Before that only the levels that are the other game could reach this.

   This is the same stale answer the pour queue and that game's frame loop
   arrive with, so it is checked against the same run number. */
test.describe('a card left behind on the map', () => {
  /* Two things have to be true for the window to exist at all, and neither is
     the default. The worker precaches the bundle, so it is blocked or the delay
     below never reaches the network. And the card's own scripts hold back the
     `load` event, which `start` waits for, so the last navigation is taken only
     as far as DOMContentLoaded: that is where a player is too, with the map
     drawn and interactive and the bundle still on its way. */
  test.use({ serviceWorkers: 'block' });

  test('does not land on the board dealt while it was waiting', async ({ page }) => {
    await start(page, played);
    await page.route('**/assets/preview-*.js', async route => {
      await new Promise(r => setTimeout(r, 4000));
      await route.continue();
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!globalThis.App);
    await page.locator('[data-level="5"]').waitFor({ state: 'visible' });

    await page.locator('[data-level="5"]').click();
    /* the window this is about: asked for, still waiting */
    expect(await page.evaluate(() => typeof globalThis.Preview !== 'undefined'),
      'the bundle landed before the tap, so this tested nothing').toBe(false);
    expect(await shown(page)).toBe(false);

    /* the player gives up on it and deals the level they are actually on */
    await page.locator('.node.current').click();
    await page.waitForFunction(() => globalThis.App._state.level === 18
      && globalThis.App._state.tubes.length > 0);
    const paid = await page.evaluate(() => globalThis.App._progress.gold);

    await page.waitForFunction(() => typeof globalThis.Preview !== 'undefined');
    await page.waitForTimeout(500);

    expect(await shown(page), 'a card for a level left behind covered the board').toBe(false);
    expect(await page.evaluate(() => document.body.dataset.view)).toBe('game');
    expect(await page.evaluate(() => globalThis.App._state.level)).toBe(18);
    expect(await page.evaluate(() => globalThis.App._progress.gold),
      'and charged for a board nobody asked for').toBe(paid);
  });
});
