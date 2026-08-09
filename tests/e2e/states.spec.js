/* Every named state, opened in a real browser.

   The unit suite already checks that each state means what its name says — that
   `beforeBubble` really is a pour level whose successor is not, that
   `blastReady` is granted in the chapter that grants it. What it cannot check is
   whether the game comes UP in one. A save is read at boot by code that has to
   cope with anything it finds, and the failure mode is the worst one this game
   has: a save that throws is a game that cannot be opened again, on a device
   whose owner has no way to find out why and no button to press.

   Three of these states are saves that are wrong on purpose — an older layout,
   fields that did not exist yet, types somebody's browser mangled — and until
   now none of them had ever been opened in a browser at all. They were decided
   from numbers in the unit suite, which is exactly the layer that cannot see a
   page failing to paint.

   Cheap, too: no level is played and nothing is animated, so the whole sweep is
   a boot per state. */
import { test, expect } from '@playwright/test';
import { start, startRaw, state, everyState, RECOVERY } from './helpers.js';

const states = everyState();

test('there are states to walk, and both kinds of them', () => {
  /* A loop over an empty list passes. This is what stops the whole file
     reporting a clean sweep because a module path moved. */
  expect(states.length).toBeGreaterThan(12);
  expect(states.some(s => s.kind === RECOVERY)).toBe(true);
});

for (const entry of states){
  test(`opens: ${entry.title}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    /* A recovery save is written verbatim: `start()` corrects the layout stamp,
       which is right for a spec about the game and repairs the thing under test
       for a spec about the save. */
    if (entry.kind === RECOVERY) await startRaw(page, entry.save);
    else await start(page, entry.save);

    /* The map is the game's front door, and it is drawn rather than declared, so
       "it painted" is a stronger claim than "it loaded". */
    await expect(page.locator('body')).toHaveAttribute('data-view', 'map');
    await expect(page.locator('.node').first()).toBeVisible();

    const live = await page.evaluate(() => ({
      unlocked: globalThis.App._progress.unlocked,
      gold: globalThis.App._progress.gold,
      nodes: document.querySelectorAll('.node').length
    }));

    /* Whatever it was handed, what it came up with has to be a game. A save that
       loads as level zero or a negative purse is one the player cannot play out
       of. */
    expect(Number.isInteger(live.unlocked) && live.unlocked >= 1).toBe(true);
    expect(Number.isInteger(live.gold) && live.gold >= 0).toBe(true);
    expect(live.nodes).toBeGreaterThan(0);

    /* A playable state has to arrive as itself. A recovery state is not asked
       this: repairing it is the whole point, and the repair is allowed to change
       every number in it. */
    if (entry.kind !== RECOVERY && entry.save.unlocked != null){
      expect(live.unlocked).toBe(entry.save.unlocked);
    }
    if (entry.kind !== RECOVERY && entry.save.gold != null){
      expect(live.gold).toBe(entry.save.gold);
    }

    expect(errors).toEqual([]);
  });
}

/* The states that are about a screen, checked against that screen. Each of these
   was reachable before only by playing to it. */

test('a stranded purse refuses every board and says where the way out is', async ({ page }) => {
  await start(page, state('purseDry'));
  const frontier = page.locator('.node[data-level="15"]');
  await expect(frontier).toBeDisabled();
  /* the draught is the way out, and it has to be offered rather than merely
     present */
  await expect(page.locator('#daily')).toHaveClass(/primary/);
  await expect(page.locator('#daily')).toBeEnabled();
});

test('the draught already taken says when it comes back, not just that it is gone', async ({ page }) => {
  await start(page, state('draughtDrawn'));
  await expect(page.locator('#daily')).toBeDisabled();
  /* a length of time. "Drawn" said it was gone without saying it was coming
     back, on the one screen a player with nothing left is looking at */
  await expect(page.locator('#dailyCost')).toHaveText(/^(soon|\d+m|\d+h( \d+m)?)$/);
});

test('a finished game still opens, and every board is beaten', async ({ page }) => {
  await start(page, state('finished'));
  const totals = await page.evaluate(() => {
    const p = globalThis.App._progress;
    let stars = 0;
    for (let level = 1; level <= globalThis.LAST_LEVEL; level++) stars += p.starsFor(level);
    return { stars, last: globalThis.LAST_LEVEL };
  });
  expect(totals.stars).toBe(totals.last * 3);
  await expect(page.locator('#mapStars')).toHaveText(String(totals.stars));
});

test('the last board offers no board after it', async ({ page }) => {
  await start(page, state('lastLevel'));
  /* Nothing past the graded range: a level with no par cannot be scored, so
     there must be no medallion beyond the last one to tap. */
  const beyond = await page.evaluate(l => document.querySelector(`[data-level="${l + 1}"]`) != null,
    await page.evaluate(() => globalThis.LAST_LEVEL));
  expect(beyond).toBe(false);
});

test('a mangled save opens as a new game rather than as nothing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await startRaw(page, state('nonsense'));
  /* Not "it did not throw" — that is the test above. This is the claim that
     what the player gets is a game they can play, which is the only recovery
     worth having. */
  const live = await page.evaluate(() => ({
    unlocked: globalThis.App._progress.unlocked,
    gold: globalThis.App._progress.gold
  }));
  expect(live.unlocked).toBe(1);
  expect(live.gold).toBeGreaterThan(0);
  await expect(page.locator('.node[data-level="1"]')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('a save from older boards keeps what was earned and drops the cached par', async ({ page }) => {
  await startRaw(page, state('staleLayout'));
  const live = await page.evaluate(() => {
    const p = globalThis.App._progress;
    return {
      unlocked: p.unlocked, layout: p.raw.layout,
      stars5: p.starsFor(5), best5: p.bestFor(5), par5: p.parFor(5),
      pars: Object.keys(p.raw.pars).length
    };
  });
  /* The line this draws is deliberate and easy to draw the other way round. I
     drew it the other way round first: I assumed the bests went with the boards,
     and the test failed against a module that says plainly why they do not.

     Stars and best pour counts are things a player earned. Taking them away to
     keep a record tidy is a worse trade than leaving a best the new board
     happens not to allow. The cached par is not earned — it is a note of how few
     pours one particular board needed, and that board is gone, so keeping it
     would score a level against a bar belonging to a different puzzle. */
  expect(live.unlocked).toBe(30);
  expect(live.stars5).toBe(3);
  expect(live.best5).toBe(9);
  expect(live.par5).toBe(null);
  expect(live.pars).toBe(0);
  /* and the save is stamped forward, so it migrates once rather than every load */
  expect(live.layout).toBe(await page.evaluate(() => globalThis.CONFIG.layout));
  /* The ending counts go with the par and for the same reason: they are read
     against the measured difficulty of one board, and that board is gone. The
     refusal counts are about the game rather than about a board, so they stay. */
  const diag = await page.evaluate(() => globalThis.App._progress.diag);
  expect(diag.endings).toEqual({});
  expect(diag.refused).toEqual({ undo: 2 });
});

test('counts how runs ended, keeps them across a reload, and prints them', async ({ page }) => {
  /* The whole point of these counts is that they reach a person, so the check
     runs the whole way: record, survive the page going away, and come out of the
     panel in the shape tools/endings.mjs reads. A count that never makes it into
     the report is a count nobody will ever see. */
  await startRaw(page, state('faulted'));
  await page.evaluate(() => {
    const p = globalThis.App._progress;
    p.recordEnding(19, 'stuck');
    p.recordEnding(19, 'cleared');
  });
  await page.reload();
  await page.waitForFunction(() => globalThis.App && globalThis.App._progress);
  const kept = await page.evaluate(() => globalThis.App._progress.diag.endings);
  expect(kept['19']).toEqual({ stuck: 1, cleared: 1 });
  expect(kept['12']).toEqual({ stuck: 3, cleared: 1 });

  const dump = await page.evaluate(() => {
    globalThis.Diagnostics.open();
    return document.getElementById('diagText').textContent;
  });
  expect(dump).toContain('levels lost');
  /* worst first, and a level with nothing lost against it stays out of the list */
  const rows = dump.split('\n').filter(l => /^ {2}\d+: /.test(l));
  expect(rows[0]).toContain('12:');
  expect(rows.join('\n')).toContain('19: stuck 1 cleared 1');
});
