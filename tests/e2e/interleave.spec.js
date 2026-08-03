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
import { start, open } from './helpers.js';

const kinds = page => page.evaluate(() => {
  const all = [...Array(120)].map((_, i) => i + 1);
  return {
    bubble: all.filter(globalThis.Levels.isBubble),
    pour: all.filter(l => !globalThis.Levels.isBubble(l))
  };
});

/* opens a level from the map without waiting for bottles, since a bubble board
   has none */
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

test('a bubble level carries nothing over from the pour level before it', async ({ page }) => {
  /* Both games run out of one state object, because they share the purse, the
     panel and the chapter card. Opening a bubble level used to clear the four
     fields it obviously touched, so the panel went on building a par sentence
     out of the last pour level's numbers and only escaped saying "Sorted in 37
     pours" because the bubble path passes a line of its own. Nothing visible
     failed, which is exactly why this is asserted on the state. */
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });
  const { bubble, pour } = await kinds(page);

  await open(page, pour[0]);
  const dirtied = await page.evaluate(() => {
    const S = globalThis.App._state;
    S.moves = 37;
    S.history = [{}, {}];
    return { moves: S.moves, par: S.par };
  });
  expect(dirtied.moves, 'the pour level under test recorded no pours').toBe(37);

  await page.locator('#toMap').click();
  await open(page, bubble[0]);

  const carried = await page.evaluate(() => {
    const S = globalThis.App._state;
    return { moves: S.moves, par: S.par, parExact: S.parExact,
             history: S.history.length, tubes: S.tubes.length, finished: S.finished };
  });
  expect(carried).toEqual({ moves: 0, par: null, parExact: false,
                            history: 0, tubes: 0, finished: false });
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
    A._state.shots = C.RUN_SHOTS;
    A.finish('survived');
  });

  await expect(page.locator('#veil')).toHaveClass(/show/, { timeout: 15_000 });
  await expect(page.locator('#stars')).toHaveText('★★★');
  await expect(page.locator('#winLine')).toContainText('Survived all');
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

/* Reported as "I turned the sound off and the bubble ones are still loud".

   There are three sound modules on this page, one per game, and they kept three
   separate answers: this game's in the save, the others in keys of their own,
   because they also ship as pages of their own where there is no save to read.
   Muting therefore reached one game, and the boards that are another one arrived
   at full volume on a screen with no button to stop it. Nothing failed, nothing
   errored, and the player had already done the only thing the game offers for
   making it stop.

   The cellar door was the third of those and was reached by none of it, so this
   asks all three rather than the two it was written for. */
test('muting the game mutes all of them, including the boards that are another one', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, sound: true, seen: { 0: true, 1: true, 2: true } });
  const { bubble } = await kinds(page);

  await page.locator('#mapView .js-sound').click();
  const afterTap = await page.evaluate(() => ({
    pour: globalThis.Sound.enabled,
    bubble: globalThis.BubbleAudio.enabled,
    casks: globalThis.CasksAudio.enabled,
    saved: globalThis.App._progress.sound
  }));
  expect(afterTap).toEqual({ pour: false, bubble: false, casks: false, saved: false });

  /* and it is still off once one of the other game's boards is actually dealt */
  await open(page, bubble[0]);
  expect(await page.evaluate(() => globalThis.BubbleAudio.enabled),
    'a bubble board came up loud in a muted game').toBe(false);

  /* back on again, from the control that is now on that screen too, and all
     three hear it */
  await page.locator('#bubbleView .js-sound').click();
  expect(await page.evaluate(() => ({
    pour: globalThis.Sound.enabled, bubble: globalThis.BubbleAudio.enabled,
    casks: globalThis.CasksAudio.enabled
  }))).toEqual({ pour: true, bubble: true, casks: true });
});

/* A screen with a game on it and no way to stop the noise is the bug the
   paragraph above is about, and for two of these screens the fix for it was the
   button rather than the wiring. Asked of every view that has a game on it,
   including the map they are reached from. */
test('every screen carries the same one control for the sound', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });
  for (const view of ['mapView', 'gameView', 'bubbleView', 'doorView']){
    const btn = page.locator(`#${view} .js-sound`);
    expect(await btn.count(), `${view} has no way to stop the sound`).toBe(1);
    /* the same shape everywhere: a glyph, and a label that says which way it is */
    await expect(btn).toHaveClass(/icon/);
    await expect(btn).toHaveAttribute('aria-label', /Sound (on|off)/);
  }
});

/* A muted game that was muted in an earlier sitting has to come back muted, in
   both games. The preference is read from the save at boot, and the other game
   reads its own key at that point, so this is the path where the two can
   disagree before anybody has touched anything. */
test('a game muted in an earlier sitting comes back muted in all of them', async ({ page }) => {
  await start(page, { unlocked: 120, gold: 400, sound: false, seen: { 0: true, 1: true, 2: true } });
  await page.waitForFunction(() => !!globalThis.CasksAudio && !!globalThis.BubbleAudio);
  expect(await page.evaluate(() => ({
    pour: globalThis.Sound.enabled, bubble: globalThis.BubbleAudio.enabled,
    casks: globalThis.CasksAudio.enabled
  }))).toEqual({ pour: false, bubble: false, casks: false });
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
      color: !document.getElementById('bubblePick').hidden
    }));
  };

  expect(await shown({ undo: true, hint: false, color: false }))
    .toEqual({ undo: true, hint: false, color: false });
  expect(await shown({ undo: true, hint: true, color: true }))
    .toEqual({ undo: true, hint: true, color: true });
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
  const colors = await page.evaluate(() => globalThis.BubbleRules.liveColors(globalThis.BubbleApp._state.board));
  const took = await page.evaluate(c => globalThis.BubbleApp.pickColor(c), colors[1]);
  expect(took, 'a color was handed over on an empty purse').toBe(false);
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

test('a bubble run left mid collapse does not follow you to the map', async ({ page }) => {
  /* The other game's frame loop does not stop when the view changes. A lost
     board takes about a second to fall, and the ending is read out at the end of
     that fall wherever the player happens to be by then: on the map, with the
     failed panel fading in over it and a priced Try again on it. */
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });
  const { bubble } = await kinds(page);
  await open(page, bubble[0]);
  const before = await purse(page);

  const after = await page.evaluate(() => new Promise(res => {
    const A = globalThis.BubbleApp;
    A._state.shots = 40;
    A.finish('lost');
    const tick = () => {
      if (!A._state.collapsing) return requestAnimationFrame(tick);
      document.getElementById('bubToMap').click();
      setTimeout(() => res({
        view: document.body.dataset.view,
        shown: document.getElementById('veil').classList.contains('show'),
        gold: globalThis.App._progress.gold
      }), 2500);
    };
    requestAnimationFrame(tick);
  }));

  expect(after.view).toBe('map');
  expect(after.shown, 'the abandoned run put its panel over the map').toBe(false);
  expect(after.gold, 'and paid out for a run nobody was watching').toBe(before);
});

test('opening the game does not overwrite what the standalone pages remember', async ({ page }) => {
  /* The other games keep their own preferences under their own keys, which is
     right on a page that is nothing but one of them. The host has to push the
     save's value in on every boot, and if that wrote through, simply opening the
     game once, before pressing anything, would silently undo a mute chosen at
     /bubble/ or /casks/. The value applies; it just does not get written down. */
  await start(page, { unlocked: 120, gold: 400, sound: true, seen: { 0: true, 1: true, 2: true } });
  await page.evaluate(() => {
    localStorage.setItem('bubble.sound', 'off');
    localStorage.setItem('casks.sound', 'off');
  });
  await page.reload();
  await page.waitForFunction(() => !!globalThis.App && !!globalThis.BubbleAudio && !!globalThis.CasksAudio);

  expect(await page.evaluate(() => ({
    bubble: globalThis.BubbleAudio.enabled, casks: globalThis.CasksAudio.enabled
  })), 'the save decides while the game is up').toEqual({ bubble: true, casks: true });
  expect(await page.evaluate(() => ({
    bubble: localStorage.getItem('bubble.sound'), casks: localStorage.getItem('casks.sound')
  })), 'and booting the game rewrote a standalone page’s own preference')
    .toEqual({ bubble: 'off', casks: 'off' });
});

test('undo cannot take back a bubble run the game has already paid for', async ({ page }) => {
  /* Taking back the shot that ended the run is the whole point of undo on the
     standalone page, where a run is its own reward. Inside the game it is not:
     the ending banks first and the panel only covers the board a moment later,
     so a tap in between would put a paid run back on the board to be played on
     and paid out again. */
  await start(page, { unlocked: 120, gold: 400, seen: { 0: true, 1: true, 2: true } });
  const { bubble } = await kinds(page);
  await open(page, bubble[0]);

  await page.evaluate(() => new Promise(res => {
    const A = globalThis.BubbleApp;
    A.fire();
    const tick = () => (A._state.past.length ? res() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }));
  const before = await purse(page);

  await page.evaluate(() => { globalThis.BubbleApp._state.shots = 40; globalThis.BubbleApp.finish('lost'); });
  const state = await page.evaluate(() => ({
    over: globalThis.BubbleApp._state.over,
    disabled: document.getElementById('bubbleUndo').disabled,
    took: globalThis.BubbleApp.undo(),
    stillOver: globalThis.BubbleApp._state.over,
    gold: globalThis.App._progress.gold
  }));

  expect(state.over).toBe('lost');
  expect(state.disabled, 'undo was still offered on a run that had already paid out').toBe(true);
  expect(state.took, 'and it was accepted').toBe(false);
  expect(state.stillOver, 'a banked run was put back on the board').toBe('lost');
  expect(state.gold, 'and undo charged for the privilege').toBe(before);
});
