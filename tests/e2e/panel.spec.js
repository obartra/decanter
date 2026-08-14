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

   Endings are reached through `endRun` in the shared helpers, which drives the
   app's own `_end()` hook rather than playing to a chosen ending against
   animated pours.

   Every state here is a named one. That is the point of naming them: "a failed
   run with an empty purse" is a fixture rather than a paragraph of setup. */
import { test, expect } from '@playwright/test';
import { start, openLevel, state, endRun } from './helpers.js';

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
  const broke = await page.evaluate(() => globalThis.Panel.BROKE());
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

test('offers to hear about a board that has been beating somebody', async ({ page }) => {
  /* The whole point of this offer is that it arrives without being looked for,
     so the check has to be the real flow: a save that has already lost this
     board four times, a fifth loss played out, and the line appearing under the
     buttons on its own.

     Four then five rather than five then one, because the interesting boundary
     is the one a player crosses rather than one a fixture starts on. */
  await start(page, { layout: undefined, unlocked: 3, gold: 400,
    diag: { refused: {}, faults: 0, lastFault: '', endings: { 1: { over: 4 } }, asked: {} } });
  await openLevel(page, 1);
  await endRun(page, 'stuck');

  await expect(page.locator('#reportOffer')).toBeVisible();

  /* and it opens the card that already knows how to copy itself, rather than
     sending anything anywhere */
  await page.locator('#reportOpen').click();
  await expect(page.locator('#diagVeil')).toHaveClass(/show/);
  await expect(page.locator('#diagText')).toContainText('levels lost');

  /* ON TOP of the panel that opened it, which the class alone does not say and
     `toBeVisible` does not either: neither notices one fixed layer painted over
     another. Every veil shared a z-index, which was fine while only one could be
     open — the card was reached by holding the gold count, and nobody does that
     with this panel up. This offer opens both at once, the tie went to document
     order, and what a player saw was the offer vanish and nothing arrive. */
  const onTop = await page.evaluate(() => {
    const card = document.getElementById('diagVeil');
    const box = document.getElementById('diagText').getBoundingClientRect();
    const at = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return !!at && card.contains(at);
  });
  expect(onTop).toBe(true);

  /* asked once: the offer is gone on the next failure of the same board */
  const asked = await page.evaluate(() => globalThis.App._progress.troubleOn(1).asked);
  expect(asked).toBe(true);
});

test('says nothing to somebody who is merely playing', async ({ page }) => {
  await start(page, { unlocked: 3, gold: 400,
    diag: { refused: {}, faults: 0, lastFault: '', endings: { 1: { over: 2 } }, asked: {} } });
  await openLevel(page, 1);
  await endRun(page, 'stuck');
  await expect(page.locator('#reportOffer')).toBeHidden();
});

test('a purse that cannot pay the way on says so out loud', async ({ page }) => {
  /* Most controls that cost money are disabled rather than refused, on the
     grounds that a card offering what it cannot sell is lying. That leaves the
     wall itself said in eleven quiet words under the buttons, which is the one
     moment a player is actually stuck. */
  await start(page, { unlocked: 3, gold: 400 });
  await openLevel(page, 1);
  await page.evaluate(() => globalThis.App._progress.spend(globalThis.App._progress.gold));
  await endRun(page, 'stuck');

  await expect(page.locator('#brokeVeil')).toHaveClass(/show/);
  await expect(page.locator('#brokeLine')).toContainText('purse');
  /* the draught is the answer, so it is offered where the problem is said */
  await expect(page.locator('#brokeDaily')).toBeVisible();

  await page.locator('#brokeDaily').click();
  await expect(page.locator('#brokeVeil')).not.toHaveClass(/show/);
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBeGreaterThan(0);
});

test('does not send somebody to a draught they have already drawn', async ({ page }) => {
  /* Telling a player to go and press a button that will refuse them is a second
     refusal dressed as help. */
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await start(page, { unlocked: 3, gold: 400, dailyOn: iso });
  await openLevel(page, 1);
  await page.evaluate(() => globalThis.App._progress.spend(globalThis.App._progress.gold));
  await endRun(page, 'stuck');

  await expect(page.locator('#brokeVeil')).toHaveClass(/show/);
  await expect(page.locator('#brokeDaily')).toBeHidden();
  await expect(page.locator('#brokeLine')).toContainText('drawn today');
});
