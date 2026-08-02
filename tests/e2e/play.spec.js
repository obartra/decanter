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

/* Escape meant one thing, "leave the level", and it meant it whatever was on
   the screen. A panel is not part of the level though, so pressing it over the
   end-of-run panel moved the game to the map and left the panel sitting on top,
   fully live, offering Try again and Next level for a run already banked and a
   board that was no longer there. */
test('escape puts away the panel in front of you, not the level behind it', async ({ page }) => {
  await start(page, { unlocked: 4, gold: 400, seen: { 0: true } });
  await openLevel(page, 4);
  await page.evaluate(() => {
    globalThis.App._state.moves = 999;
    globalThis.App._end();
  });
  await expect(page.locator('#veil')).toHaveClass(/show/);

  await page.keyboard.press('Escape');
  await expect(page.locator('#veil'), 'the panel stayed up over the map').not.toHaveClass(/show/);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'map');

  /* and pressing it again on the map does nothing at all */
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'map');
});

test('escape reads a chapter opening rather than stepping round it', async ({ page }) => {
  /* The opening covers the board and is shown once ever. Escaping past it used
     to leave it on the map and count it as read, so the one chance to see it
     went to a screen it was not describing. */
  await start(page, { unlocked: 11, gold: 400, seen: { 0: true } });
  await page.locator('[data-level="11"]').click();
  await expect(page.locator('#chapterVeil')).toHaveClass(/show/);

  await page.keyboard.press('Escape');
  await expect(page.locator('#chapterVeil')).not.toHaveClass(/show/);
  await expect(page.locator('body'), 'the level itself was thrown away with the card')
    .toHaveAttribute('data-view', 'game');
});

test('walking off a lost board leaves its panel behind', async ({ page }) => {
  /* The panel waits a moment before it covers the board, so the pour that ended
     the run is seen before the verdict lands on it. That wait outlived the run
     it belonged to: the veil is a sibling of all three views rather than
     something inside the game, so leaving inside the window brought the panel up
     over the map, for a run nobody was looking at any more, with a priced Try
     again on it that dealt a board straight out of the map view. */
  await start(page, { unlocked: 5, gold: 400, seen: { 0: true } });
  await openLevel(page, 5);
  const move = await page.evaluate(() => {
    const S = globalThis.App._state;
    S.moves = S.par + globalThis.CONFIG.stars.one;
    const m = globalThis.Rules.legalMoves(S.tubes)[0];
    return [m.from, m.to];
  });

  const after = await page.evaluate(([f, t]) => new Promise(res => {
    const glass = document.querySelectorAll('#board .glass');
    glass[f].click();
    glass[t].click();
    const tick = () => {
      /* the frame the run ends on, which is inside the window by construction:
         finish() schedules the reveal before any later frame can run */
      if (!globalThis.App._state.finished) return requestAnimationFrame(tick);
      document.getElementById('toMap').click();
      setTimeout(() => res({
        view: document.body.dataset.view,
        shown: document.getElementById('veil').classList.contains('show')
      }), 2000);
    };
    requestAnimationFrame(tick);
  }), move);

  expect(after.view).toBe('map');
  expect(after.shown, 'a scheduled panel arrived over the map').toBe(false);
});

test('a pour left behind on one board does not land on the next one', async ({ page }) => {
  /* Nothing cancels an animation. Leave while a pour is tipping, open another
     level, and a second later that drain wakes up past its await and applies the
     move it was carrying. start() has re-pointed Board.view by then, so the pour
     lands on the board now on screen: a bottle drawn a unit short, another drawn
     past the cap. It is permanent for the level, because taps are read off
     S.tubes and the drawing off Board.view. */
  await start(page, { unlocked: 30, gold: 4000, seen: { 0: true, 1: true, 2: true } });
  await openLevel(page, 1);
  const move = await page.evaluate(() => {
    const m = globalThis.Rules.legalMoves(globalThis.App._state.tubes)[0];
    return [m.from, m.to];
  });

  const after = await page.evaluate(([f, t]) => new Promise(res => {
    const glass = document.querySelectorAll('#board .glass');
    glass[f].click();
    glass[t].click();
    const tick = () => {
      if (!globalThis.App._state.running) return requestAnimationFrame(tick);
      document.getElementById('toMap').click();
      document.querySelector('[data-level="3"]').click();
      setTimeout(() => {
        const S = globalThis.App._state;
        res({
          level: S.level,
          tubes: JSON.stringify(S.tubes),
          view: JSON.stringify(globalThis.Board.view),
          over: S.tubes.some(b => b.length > globalThis.Rules.CAP)
        });
      }, 3000);
    };
    requestAnimationFrame(tick);
  }), move);

  expect(after.level).toBe(3);
  expect(after.view, 'the abandoned pour was applied to the board now on screen').toBe(after.tubes);
  expect(after.over, 'it pushed a bottle past the cap').toBe(false);
});

/* The other direction of the run token, which is the dangerous one.

   Every spec around this one asks whether an abandoned run stays abandoned. The
   failure that costs a player something is the opposite: a win that arrives
   through the queue, on a board dealt by a button that bumped the token, and
   banks nothing. `drain` finishes only if the number it started with is still
   the number on screen, and Try again moves that number twice, once to deal the
   failed board and once to deal this one.

   Played rather than declared. `_end()` reaches finish() directly and would
   step straight over the check this is about, so the win has to come off a real
   pour going through commit and drain. The shelf is planted one pour from home
   so that is one pour rather than a whole level: what is under test is the
   handover, not the solving. */
test('a board dealt by Try again still banks the run it is won with', async ({ page }) => {
  await start(page, { unlocked: 3, gold: 400, seen: { 0: true } });
  await openLevel(page, 3);

  /* lose it, the ordinary way: one pour past the budget */
  const lost = await page.evaluate(() => {
    const S = globalThis.App._state;
    S.moves = S.par + globalThis.CONFIG.stars.one;
    const m = globalThis.Rules.legalMoves(S.tubes)[0];
    return [m.from, m.to];
  });
  await pour(page, lost[0], lost[1]);
  await settle(page);
  await expect(page.locator('#veil')).toHaveClass(/show/);
  expect(await page.evaluate(() => globalThis.App._progress.starsFor(3)),
    'the lost run banked something').toBe(0);

  await expect(page.locator('#retry')).toBeVisible();
  await page.locator('#retry').click();
  await page.waitForFunction(() => globalThis.App._state.moves === 0
    && globalThis.App._state.tubes.length > 0);
  const purse = await page.evaluate(() => globalThis.App._progress.gold);

  /* a shelf one legal pour from solved, on the board Try again just dealt */
  await page.evaluate(() => {
    const S = globalThis.App._state;
    S.tubes = [[0, 0, 0], [0], [1, 1, 1, 1]];
    S.par = 1;
    S.parExact = true;
    globalThis.Board.view = globalThis.Rules.clone(S.tubes);
    globalThis.Board.render();
  });
  await pour(page, 1, 0);
  await settle(page);

  await expect(page.locator('#veil')).toHaveClass(/show/);
  await expect(page.locator('#stars')).toHaveText('★★★');
  const banked = await page.evaluate(() => ({
    stars: globalThis.App._progress.starsFor(3),
    best: globalThis.App._progress.bestFor(3),
    gold: globalThis.App._progress.gold,
    unlocked: globalThis.App._progress.unlocked,
    finished: globalThis.App._state.finished
  }));
  expect(banked.finished, 'the run never finished').toBe(true);
  expect(banked.stars, 'a win on a re-dealt board banked no stars').toBe(3);
  expect(banked.best, 'and no best').toBe(1);
  expect(banked.gold, 'and no gold').toBeGreaterThan(purse);
  expect(banked.unlocked).toBe(4);
});
