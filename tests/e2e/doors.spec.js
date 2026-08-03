/* The cellar doors, in a browser.

   The unit suite has the rule: which floor stands in front of which chapter,
   what the save records, and that `isUnlocked` says no. None of that is what a
   player meets. What a player meets is a map with a gate drawn across the road,
   a medallion that will not take a tap, and a floor of casks with none of the
   things every other board in this game has.

   Three claims, and they are the three that cannot be made without a page:

   - the gate is on the map, in the right place, and the chapter behind it is
     genuinely refused by every route in — including the one that takes money;
   - the door board has no aids on it at all, which here is a claim about what is
     absent from a document rather than about a flag being false;
   - getting the gilt cask out opens that chapter and only that chapter, and it
     stays open across a reload.

   The last one is the whole feature. Everything else is scaffolding around it. */
import { test, expect } from '@playwright/test';
import { start, state } from './helpers.js';

/* The first door: the one in front of chapter two. Read off the game rather
   than written down, so this spec follows the table in 30-levels.js. */
const firstDoor = page => page.evaluate(() => ({
  section: 1,
  floor: globalThis.Levels.doorFor(1),
  first: globalThis.CONFIG.sectionSize + 1,
  last: globalThis.CONFIG.sectionSize
}));

const doorNode = page => page.locator('.node.door[data-door="1"]');

/* Get the gilt cask out, by solving the floor rather than by shoving casks at
   it. The moves come from the game's own exhaustive search — the same one that
   measured the par this door was chosen for — and are played through the same
   `play()` a finger goes through, so this is the real turn and not a state
   write. */
async function solveTheDoor(page){
  await page.waitForFunction(() => typeof globalThis.CasksApp !== 'undefined'
    && globalThis.CasksApp._state.layout.length > 0);
  /* `line` and not `solve`: solve answers what par is and which move to make
     first, which is what a hint needs; the whole optimal line is a separate
     export and it is what playing the board through requires. */
  const moves = await page.evaluate(() => {
    const st = globalThis.CasksApp._state;
    return globalThis.CasksSearch.line(st.layout, st.pos);
  });
  expect(moves, 'the door floor must be solvable, or it is not a door').toBeTruthy();
  for (const m of moves){
    await page.evaluate(mv => globalThis.CasksApp.play(mv.cask, mv.to), m);
    /* A cask travels, and the next move is refused while it does. Waiting on the
       game rather than on a duration, so a slow machine does not drop a move and
       report it as an unsolvable floor. */
    await page.waitForFunction(() => {
      const st = globalThis.CasksApp._state;
      return !st.sliding;
    });
  }
}

test('draws the door on the road between the chapters', async ({ page }) => {
  await start(page, state('atDoor'));
  const { first, last } = await firstDoor(page);

  await expect(doorNode(page)).toBeVisible();
  await expect(doorNode(page)).toBeEnabled();
  /* It says which chapter it is the way in to. A gate that only says "locked"
     is the map declining to say the one thing that would help. */
  await expect(doorNode(page)).toContainText(await page.evaluate(
    n => globalThis.Levels.sectionName(n), first));

  /* Between the two chapters, not merely somewhere on the map. Compared by the
     offsets the browser actually laid out. */
  const ys = await page.evaluate(([a, b]) => {
    const at = sel => document.querySelector(sel).getBoundingClientRect().top;
    return { last: at(`.node[data-level="${a}"]`), door: at('.node.door[data-door="1"]'),
             next: at(`.node[data-level="${b}"]`) };
  }, [last, first]);
  /* the map climbs, so later is higher up the page */
  expect(ys.door).toBeLessThan(ys.last);
  expect(ys.next).toBeLessThan(ys.door);
});

test('refuses the chapter behind it, by every route in', async ({ page }) => {
  await start(page, state('atDoor'));
  const { first } = await firstDoor(page);
  const medallion = page.locator(`.node[data-level="${first}"]`);

  await expect(medallion).toBeDisabled();
  await expect(medallion).toHaveAttribute('aria-label', /behind its door/);

  /* And not for sale. Paying past a board is for a board you cannot beat; a shut
     door is the next chapter not being open yet, and a purse charged for one
     would come away holding a level it still could not enter. */
  const before = await page.evaluate(() => globalThis.App._progress.gold);
  await page.evaluate(n => globalThis.App._progress.buyUnlock(n, 0), first);
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(before);
  expect(await page.evaluate(n => globalThis.App._progress.isUnlocked(n), first)).toBe(false);
});

test('opens a board with nothing to lean on', async ({ page }) => {
  await start(page, state('atDoor'));
  await doorNode(page).click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'door');
  await page.waitForFunction(() => typeof globalThis.CasksApp !== 'undefined'
    && globalThis.CasksApp._state.layout.length > 0);

  /* The no-aids rule, stated as what it actually is: those controls are not in
     this document. A flag could be flipped back on by a later change and
     nothing would fail; a missing element cannot be. */
  for (const id of ['cskUndo', 'cskHint', 'cskPar', 'cskStars', 'cskVeil', 'cskNext']){
    expect(await page.locator(`#${id}`).count(), `#${id} must not exist on the door`).toBe(0);
  }
  /* Nor any of the pour game's, which are a different set of the same idea. */
  for (const id of ['hintBtn', 'undoBtn', 'vesselBtn', 'blastBtn']){
    await expect(page.locator(`#${id}`)).toBeHidden();
  }

  /* And it is the floor the table names, not floor one, which is what a boot
     that forgot to deal would leave on screen. */
  const { floor } = await firstDoor(page);
  expect(await page.evaluate(() => globalThis.CasksApp._state.level)).toBe(floor);
});

test('getting the gilt cask out opens that chapter, and only that one', async ({ page }) => {
  await start(page, state('atDoor'));
  const { first } = await firstDoor(page);
  await doorNode(page).click();
  await solveTheDoor(page);

  /* Back on the map, with the chapter open. Waited for rather than asserted at
     once: the door is not counted until the escape has played, on purpose. */
  await page.waitForFunction(n => globalThis.App._progress.isUnlocked(n), first);
  await expect(page.locator('body')).toHaveAttribute('data-view', /map|game|bubble/);

  const doors = await page.evaluate(() => {
    const p = globalThis.App._progress;
    const out = {};
    for (let s = 1; s <= globalThis.Levels.sectionCount() - 1; s++) out[s] = p.isDoorOpen(s);
    return out;
  });
  expect(doors[1]).toBe(true);
  /* one chapter, not the rest of the game */
  for (const [s, open] of Object.entries(doors)){
    if (s !== '1') expect(open, `chapter ${Number(s) + 1} should still be shut`).toBe(false);
  }

  /* The medallion is a medallion again. */
  await expect(page.locator(`.node[data-level="${first}"]`)).toBeEnabled();
  await expect(doorNode(page)).toBeDisabled();
});

test('stays open across a reload', async ({ page }) => {
  await start(page, state('atDoor'));
  const { first } = await firstDoor(page);
  await doorNode(page).click();
  await solveTheDoor(page);
  await page.waitForFunction(n => globalThis.App._progress.isUnlocked(n), first);

  await page.reload();
  await page.waitForFunction(() => !!globalThis.App && !!globalThis.Rules);
  expect(await page.evaluate(() => globalThis.App._progress.isDoorOpen(1))).toBe(true);
  expect(await page.evaluate(n => globalThis.App._progress.isUnlocked(n), first)).toBe(true);
});

test('hands over the chapter\'s tools only once its door is open', async ({ page }) => {
  /* The frontier steps into a chapter the moment the one before it falls, so
     reading the grant off that alone would give the chapter away through the
     thing meant to be guarding it. Chapter two is the hint. */
  await start(page, state('atDoor'));
  expect(await page.evaluate(() => globalThis.App._progress.perks().hint)).toBe(false);

  await doorNode(page).click();
  await solveTheDoor(page);
  await page.waitForFunction(() => globalThis.App._progress.isDoorOpen(1));
  expect(await page.evaluate(() => globalThis.App._progress.perks().hint)).toBe(true);
});

test('leaving a door costs nothing and keeps the floor', async ({ page }) => {
  await start(page, state('atDoor'));
  const before = await page.evaluate(() => globalThis.App._progress.gold);
  await doorNode(page).click();
  await page.waitForFunction(() => typeof globalThis.CasksApp !== 'undefined'
    && globalThis.CasksApp._state.layout.length > 0);
  await page.locator('#doorToMap').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'map');

  /* No fee, nothing banked, nothing opened. There is no transaction here to have
     gone wrong, which is most of the appeal of a gate that is not a toll. */
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(before);
  expect(await page.evaluate(() => globalThis.App._progress.isDoorOpen(1))).toBe(false);
  await expect(doorNode(page)).toBeEnabled();
});

test('a chapter already walked into keeps its door behind it', async ({ page }) => {
  /* The pair to the state above. Same frontier, door open, and everything the
     other one refuses is allowed — which is what says the door is the thing
     doing the refusing rather than something else about the save. */
  await start(page, state('doorJustOpened'));
  const { first } = await firstDoor(page);
  await expect(page.locator(`.node[data-level="${first}"]`)).toBeEnabled();
  await expect(doorNode(page)).toBeDisabled();
  expect(await page.evaluate(n => globalThis.App._progress.isUnlocked(n), first)).toBe(true);
});
