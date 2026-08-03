/* The end-of-run panel, as a screen rather than as a decision.

   `Panel.decide` is pure and the unit suite now enumerates all 135 screens it
   can produce, so which buttons SHOULD be drawn is settled before a browser is
   involved. This is the other half, and they are genuinely two different things:
   the decision is an object, the panel is markup, and the gap between them has
   swallowed a shipped bug already — a `hidden` attribute overridden by a
   `display` rule, so a clean run offered Retry and Move on beside Next Level
   while `decide()` had said to hide both.

   So each of these drives the real game into a real ending, asks the page what
   `decide()` said for that run, and then asks the DOM whether it agrees. Nothing
   here restates a rule: the expectation IS the decision, read out of the same
   module the app used.

   Endings are reached through `App._end()`, which is the app's own hook for
   exactly this: the shelf is built, the ending is asked for, and it then goes
   through the same finish() as every real run — the same solved check, the same
   rating, the same panel. Playing to a chosen ending against animated pours
   takes a minute of real time and lands on whichever ending the board felt like.

   Every state here is a named one. That is the point of naming them: "a failed
   run with an empty purse" is a fixture rather than a paragraph of setup. */
import { test, expect } from '@playwright/test';
import { start, openLevel, state } from './helpers.js';

/* End the run on the board that is up, one of the three ways it can end, and
   wait for the panel. `over` spends the pours, `stuck` leaves no legal move,
   `short` leaves more work than pours — which is the only one a blast answers. */
async function endRun(page, how){
  await page.evaluate(([kind]) => {
    const S = globalThis.App._state;
    if (kind === 'clean'){
      S.tubes = [[0, 0, 0, 0], [1, 1, 1, 1], []];
      S.par = 20; S.parExact = true; S.moves = 20;
    } else if (kind === 'short'){
      /* two colours needing more pours than are left */
      S.tubes = [[0, 1, 0, 1], [1, 0, 1, 0], []];
      S.par = 2; S.parExact = true; S.moves = 2; S.history = [];
    } else {
      /* Nothing legal and nothing sorted. Three FULL bottles, each holding two
         colours, so no pour has anywhere to go and no bottle is finished.

         The first version of this was three full bottles of one colour each,
         which is not a stuck board at all — it is a SOLVED one, and the run it
         produced was scored rather than failed. The test then asserted that a
         cleared run is not offered Move on, which is true and is not what it
         said it was checking. */
      S.tubes = [[0, 1, 0, 1], [1, 0, 1, 0], [2, 3, 2, 3]];
      S.par = 20; S.parExact = true; S.moves = 3; S.history = [];
    }
    globalThis.Board.view = globalThis.Rules.clone(S.tubes);
    globalThis.Board.render();
  }, [how]);
  await page.evaluate(() => globalThis.App._end());
  await page.waitForFunction(() => document.getElementById('veil').classList.contains('show'));
}

/* What the app itself decided, kept on the run state when the panel was written.

   Not rebuilt here, and the first version of this file did rebuild it — which
   went wrong immediately and in the way that matters: my `canPayFee` was
   `gold >= 0`, always true, where the app asks whether the purse covers the fee
   for THIS board, a number that is not the same once the board has been beaten.
   The spec was then asserting the app against its own idea of the run, and the
   two agreeing would have meant nothing. */
const decided = page => page.evaluate(() => globalThis.App._state.panel);

/* Which buttons are actually on the screen, and which of them are dead. `hidden`
   alone is not the question — the bug this exists for was a `hidden` attribute a
   stylesheet overrode, so what is asked is whether a person can see it. */
async function onScreen(page){
  const read = async id => {
    const el = page.locator('#' + id);
    if (await el.count() === 0) return { shown: false, disabled: false };
    return { shown: await el.isVisible(), disabled: await el.isDisabled() };
  };
  return {
    retry: await read('retry'),
    next: await read('next'),
    skip: await read('skip'),
    blast: await read('blast')
  };
}

/* The pairs the decision names, so a mismatch says which button and which way
   round rather than dumping two objects. */
function agree(decision, screen){
  const wrong = [];
  const pairs = [
    ['retry', decision.retryHidden, decision.retryDisabled, screen.retry],
    ['next', decision.nextHidden, decision.nextDisabled, screen.next],
    ['skip', decision.skipHidden, decision.skipDisabled, screen.skip],
    ['blast', decision.blastHidden, decision.blastDisabled, screen.blast]
  ];
  for (const [name, hidden, disabled, was] of pairs){
    if (hidden === was.shown) wrong.push(`${name} should be ${hidden ? 'hidden' : 'shown'} and is not`);
    if (!hidden && disabled !== was.disabled)
      wrong.push(`${name} should be ${disabled ? 'dead' : 'live'} and is not`);
  }
  return wrong;
}

test('a clean win draws the panel its own decision asked for', async ({ page }) => {
  await start(page, state('everythingOpen', { unlocked: 12 }));
  await openLevel(page, 11);
  await endRun(page, 'clean');
  expect(agree(await decided(page), await onScreen(page))).toEqual([]);
  /* and the words on it are the words it decided, not a second copy */
  await expect(page.locator('#winTitle')).toHaveText((await decided(page)).title);
});

test('a failed run draws the panel its own decision asked for', async ({ page }) => {
  await start(page, state('everythingOpen', { unlocked: 12 }));
  await openLevel(page, 11);
  await endRun(page, 'stuck');
  expect(agree(await decided(page), await onScreen(page))).toEqual([]);
});

/* An empty purse is the case where a button is drawn and dead, which is the one
   place silence is wrong: a dead button with nothing saying why reads as broken
   rather than as refused. */
test('an empty purse draws the buttons dead and says why', async ({ page }) => {
  await start(page, state('everythingOpen', { unlocked: 12, gold: 5 }));
  await openLevel(page, 11);
  /* the fee for this board has just been paid, so the purse is empty behind it */
  await endRun(page, 'stuck');
  const decision = await decided(page);
  expect(agree(decision, await onScreen(page))).toEqual([]);
  const broke = await page.evaluate(() => globalThis.Panel.BROKE);
  expect(decision.hint).toBe(broke);
  await expect(page.locator('#winHint')).toHaveText(broke);
});

/* The last board is the hardest screen in the game to reach honestly — a hundred
   and nineteen levels of playing — and it is the one where an offer that should
   not exist would be least likely to be noticed. */
test('the last board offers nothing after it', async ({ page }) => {
  await start(page, state('lastLevel'));
  const last = await page.evaluate(() => globalThis.LAST_LEVEL);
  await openLevel(page, last);
  await endRun(page, 'clean');
  const decision = await decided(page);
  expect(decision.atEnd).toBe(true);
  expect(decision.nextHidden).toBe(true);
  expect(agree(decision, await onScreen(page))).toEqual([]);
  await expect(page.locator('#next')).toBeHidden();
});

/* A stuck run at the frontier is the only state that offers Move on, and it is
   the one that dealt the wrong game when it was reached from the wrong place. */
test('only a stuck run at the frontier is offered a way past it', async ({ page }) => {
  await start(page, state('everythingOpen', { unlocked: 11 }));
  await openLevel(page, 11);
  await endRun(page, 'stuck');
  const decision = await decided(page);
  expect(decision.stuck).toBe(true);
  expect(decision.skipHidden).toBe(false);
  expect(agree(decision, await onScreen(page))).toEqual([]);

  /* and a run that is not at the frontier is not */
  await start(page, state('everythingOpen', { unlocked: 40 }));
  await openLevel(page, 11);
  await endRun(page, 'stuck');
  const open = await decided(page);
  expect(open.stuck).toBe(false);
  expect(open.skipHidden).toBe(true);
  expect(agree(open, await onScreen(page))).toEqual([]);
});
