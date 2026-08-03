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
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { start, state, openLevel, endRun, SAVE_KEY } from './helpers.js';
import { loadPure } from '../helpers.mjs';

const { CONFIG, Levels, Chapters } = loadPure();

/* Every chapter that has a door, which is every one but the first. Asked of the
   game rather than written down, so a run that grows a chapter grows this. */
const doorSections = Array.from({ length: Levels.sectionCount() - 1 }, (_, i) => i + 1);
const firstLevelOf = section => section * CONFIG.sectionSize + 1;

/* The save of somebody standing at the nth door: every door before it got
   through, this one shut, and the frontier on the first board behind it.

   Built here rather than as eleven lab states, because eleven presets that
   differ only in a number are not eleven states, they are one state and a
   parameter. `atDoor` in the lab is still the first of these, and it is the one
   a person clicks. */
const doorSave = section => {
  const doors = {};
  for (let s = 1; s < section; s++) doors[s] = true;
  const seen = {};
  for (let i = 0; i <= Math.min(section - 1, Chapters.count - 1); i++) seen[i] = true;
  return { unlocked: firstLevelOf(section), gold: 400, doors, seen };
};

/* The same save one purchase earlier: the frontier is the last board of the
   chapter before, which is the board standing in the way of the gate. */
const beforeDoorSave = section => ({
  ...doorSave(section), unlocked: section * CONFIG.sectionSize
});

/* What paying past a board costs, off the game's own economy rather than
   written down here. */
const skipCost = CONFIG.economy.attempt * CONFIG.economy.skipMultiple;
const gold = page => page.evaluate(() => globalThis.App._progress.gold);

/* A chapter whose last board is a pour level, because the specs below drive one
   to an ending and the pour game is where an ending can be posed. Two boards in
   every chapter are the bubble game and which two is decided by a hash, so this
   asks rather than assumes: the day that hash moves, these follow it instead of
   failing for a reason that has nothing to do with doors. */
const pourBoundary = () => {
  for (const s of doorSections){
    if (!Levels.isBubble(s * CONFIG.sectionSize)) return s;
  }
  throw new Error('no chapter ends on a pour level');
};

/* The first door: the one in front of chapter two. Read off the game rather
   than written down, so this spec follows the table in 30-levels.js. */
const firstDoor = page => page.evaluate(() => ({
  section: 1,
  floor: globalThis.Levels.doorFor(1),
  first: globalThis.CONFIG.sectionSize + 1,
  last: globalThis.CONFIG.sectionSize
}));

const doorNode = (page, section = 1) => page.locator(`.node.door[data-door="${section}"]`);

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

/* ---- money reaches the gate and stops ----

   Two rules that only hold together: every board in the run can be paid past,
   including the last one before a door, and no door can be paid through. Each
   was broken on its own. The panel is the one screen the map is not on, and its
   way on from the last board of a chapter dealt the first board of the next,
   through a gate the map was still refusing, with the fee for it taken on the
   way. And the map, which owns the only other way to spend gold on progress,
   put no price on that last board at all, so the one purchase the rules do
   allow was the one nothing offered. */

test('the way on from the last board of a chapter is the gate, not the board behind it', async ({ page }) => {
  const section = pourBoundary();
  const inTheWay = section * CONFIG.sectionSize;
  await start(page, beforeDoorSave(section));
  await openLevel(page, inTheWay);
  await endRun(page, 'clean');

  const next = page.locator('#next');
  await expect(next).toBeVisible();
  await expect(next).toBeEnabled();
  /* Named for what pressing it opens. "Next level" here would be promising a
     board, and the board is not what is on the other side of this button. */
  await expect(next).toHaveText(/door/i);

  await next.click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'door');
  /* Standing at the gate is not being through it. */
  expect(await page.evaluate(s => globalThis.App._progress.isDoorOpen(s), section)).toBe(false);
  expect(await page.evaluate(n => globalThis.App._progress.isUnlocked(n), inTheWay + 1)).toBe(false);
});

test('and it is free, because a gate that can be too dear is a toll', async ({ page }) => {
  const section = pourBoundary();
  const inTheWay = section * CONFIG.sectionSize;
  /* An empty purse, and that board already beaten so that going back to it costs
     nothing and pays nothing. Clearing a board pays out, so a save that starts
     poor is rich again by the time the panel is written; this is the way to
     reach that decision with no gold at all. */
  await start(page, { ...doorSave(section), gold: 0,
    stars: { [inTheWay]: 3 }, claimed: { [inTheWay]: true } });
  await openLevel(page, inTheWay);
  await endRun(page, 'clean');

  expect(await gold(page)).toBe(0);
  await expect(page.locator('#next')).toBeEnabled();
  await page.locator('#next').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'door');
});

test('paying past that board buys the walk up to the gate and nothing through it', async ({ page }) => {
  const section = pourBoundary();
  const inTheWay = section * CONFIG.sectionSize;
  await start(page, beforeDoorSave(section));
  await openLevel(page, inTheWay);
  await endRun(page, 'stuck');

  const before = await gold(page);
  await expect(page.locator('#skip')).toBeVisible();
  await page.locator('#skip').click();

  /* The fee moved the frontier one board and landed it at the floor of casks,
     rather than dealing the board behind the gate the way it used to. */
  await expect(page.locator('body')).toHaveAttribute('data-view', 'door');
  expect(await gold(page)).toBe(before - skipCost);
  expect(await page.evaluate(() => globalThis.App._progress.unlocked)).toBe(inTheWay + 1);
  expect(await page.evaluate(s => globalThis.App._progress.isDoorOpen(s), section)).toBe(false);
});

test('sells the same walk from the map, on the gate itself', async ({ page }) => {
  const section = 1;
  const inTheWay = section * CONFIG.sectionSize;
  await start(page, beforeDoorSave(section));
  const door = doorNode(page, section);

  await expect(door).toBeEnabled();
  await expect(door).toContainText(String(skipCost));
  /* It says the money is for the board, which is the only thing it is for. */
  await expect(door).toHaveAttribute('aria-label',
    new RegExp(`level ${inTheWay} stands in the way`, 'i'));

  const before = await gold(page);
  await door.click();
  await expect(door).toHaveClass(/armed/);
  expect(await gold(page), 'one tap on a priced thing must never spend').toBe(before);

  await door.click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'door');
  expect(await gold(page)).toBe(before - skipCost);
  expect(await page.evaluate(() => globalThis.App._progress.unlocked)).toBe(inTheWay + 1);
  expect(await page.evaluate(s => globalThis.App._progress.isDoorOpen(s), section)).toBe(false);
});

test('carries no price from further off than one board', async ({ page }) => {
  /* The offer is for the board in the way. Two boards back there are two of
     them, and a gate quoting a price there would be selling a walk it cannot
     deliver: `buyUnlock` moves the frontier one board and no more. */
  const section = 1;
  await start(page, { ...beforeDoorSave(section), unlocked: section * CONFIG.sectionSize - 1 });
  const door = doorNode(page, section);
  await expect(door).toBeVisible();
  await expect(door).toBeDisabled();
  await expect(door).not.toHaveClass(/buyable/);
  await expect(door).not.toContainText(String(skipCost));
});

test('refuses the tap it cannot be paid for, and says what it would cost', async ({ page }) => {
  /* The state the economy plans for rather than an error. What it must not do is
     take the tap and quietly do nothing, which is the thing the medallions were
     fixed for and the same fix has to hold here. */
  const section = 1;
  await start(page, { ...beforeDoorSave(section), gold: skipCost - 1 });
  const door = doorNode(page, section);
  await expect(door).toBeDisabled();
  await expect(door).toContainText(String(skipCost));
  await expect(door).toHaveAttribute('aria-label', /not enough/i);
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

/* ---- every door, not just the first ----

   Everything above is the first door examined closely. This is all eleven of
   them opened, and it exists because the eleven are not the same test with a
   different number in it.

   Five of them lead into chapters that have no entry in `Chapters` at all: the
   run is twelve sections long and there are seven named chapters, so sections
   seven to eleven come through as `Reserve 1` to `Reserve 5`. Those doors carry
   a name nothing in `CONFIG.sectionNames` provides, and `openChapter` finds no
   card to show behind them. Both of those are fine, and neither was exercised
   by anything until now — they were reasoned about, which is not the same.

   The floors also get much harder along the way, from par 3 to par 42, and the
   last of them is the one most likely to find a search that gives up or an
   animation that outruns its wait. */
for (const section of doorSections){
  test(`the door to chapter ${section + 1} opens that chapter and no other`, async ({ page }) => {
    const first = firstLevelOf(section);
    await start(page, doorSave(section));

    /* the gate is there, it is the only one that can be pressed, and the
       chapter behind it is refused */
    await expect(doorNode(page, section)).toBeEnabled();
    await expect(page.locator(`.node[data-level="${first}"]`)).toBeDisabled();
    expect(await page.evaluate(n => globalThis.App._progress.isUnlocked(n), first)).toBe(false);

    /* It names the chapter it opens, whether or not that chapter has a name of
       its own. A door into an unnamed section says `Reserve 3`, which is what
       the map calls it everywhere else. */
    await expect(doorNode(page, section)).toContainText(
      await page.evaluate(n => globalThis.Levels.sectionName(n), first));

    await doorNode(page, section).click();
    await expect(page.locator('body')).toHaveAttribute('data-view', 'door');
    await solveTheDoor(page);
    await page.waitForFunction(s => globalThis.App._progress.isDoorOpen(s), section);

    /* that chapter, and nothing else */
    const doors = await page.evaluate(() => {
      const p = globalThis.App._progress;
      const out = {};
      for (let s = 1; s <= globalThis.Levels.sectionCount() - 1; s++) out[s] = p.isDoorOpen(s);
      return out;
    });
    for (const [s, open] of Object.entries(doors)){
      expect(open, `chapter ${Number(s) + 1}`).toBe(Number(s) <= section);
    }
    expect(await page.evaluate(n => globalThis.App._progress.isUnlocked(n), first)).toBe(true);
  });
}

/* ---- the finger, not the turn function ----

   Every test above reaches the board through `play()`, which is the turn but is
   not the input. What sits between a finger and that turn is a hit test, and the
   door is the first place it has ever run inside the APP page: the canvas is
   sized by the app's stage there rather than by the cellar door's own page, so
   the scale and the offsets it measures are different numbers arrived at a
   different way.

   Get those wrong and nothing throws. Taps land on the cask next to the one
   under the finger, which 20-rules.js calls the worst bug a game played by
   touching things can have, and every test that drives `play()` directly goes on
   passing while it happens. */
test('a real tap moves the cask that is under it', async ({ page }) => {
  await start(page, state('atDoor'));
  await doorNode(page).click();
  await page.waitForFunction(() => typeof globalThis.CasksApp !== 'undefined'
    && globalThis.CasksApp._state.layout.length > 0);

  /* Screen coordinates worked out HERE, from the canvas box and the size of the
     room, rather than by asking the view where a world point is.

     That distinction is the test. Going through the view's own `screenToWorld`
     reads well and proves almost nothing: the tap would be placed by the same
     scale and offset the hit test then uses, so any error in them moves the
     finger and the target together and the assertion passes through it. This is
     the fit rule restated independently — whole room, one scale for both axes,
     centered, never cropped — which is the same reason tests/baseline.mjs
     restates the pour rules instead of importing them. */
  const plan = await page.evaluate(() => {
    const V = globalThis.CasksView, R = globalThis.CasksRules, C = globalThis.CasksConfig;
    const st = globalThis.CasksApp._state;
    const box = document.getElementById('cskCanvas').getBoundingClientRect();
    const world = { w: C.W + 2 * C.WALL, h: C.H + 2 * C.WALL };
    const scale = Math.min(box.width / world.w, box.height / world.h);
    const ox = (box.width - world.w * scale) / 2;
    const oy = (box.height - world.h * scale) / 2;
    const at = (wx, wy) => ({ x: box.left + ox + wx * scale, y: box.top + oy + wy * scale });

    const gilt = st.layout[0];
    const from = st.pos[0];
    const run = R.runOf(st.layout, st.pos, 0);
    /* wherever it can actually go, so this is a legal move rather than a nudge */
    const to = run.max > from ? run.max : run.min;
    if (to === from) return null;
    const here = V.rectFor(gilt, from);
    const there = V.rectFor(gilt, to);
    /* the far cell of where it is going, so `destFor` reads the same target
       whichever direction it travels */
    const lead = to > from ? there.x + there.w - 0.5 : there.x + 0.5;
    return { cask: at(here.x + here.w / 2, here.y + here.h / 2),
             dest: at(lead, there.y + 0.5), from, to };
  });
  expect(plan, 'the gilt cask must have somewhere to go on a door floor').toBeTruthy();

  /* Tap one: the cask is taken in hand. This is the hit test on its own, and it
     is the assertion that fails when the canvas was measured wrong. */
  await page.mouse.click(plan.cask.x, plan.cask.y);
  expect(await page.evaluate(() => globalThis.CasksApp._state.picked),
    'the tap landed on the gilt cask').toBe(0);

  /* Tap two: it goes. One move, whatever distance it covered. */
  await page.mouse.click(plan.dest.x, plan.dest.y);
  await page.waitForFunction(() => !globalThis.CasksApp._state.sliding);
  const after = await page.evaluate(() => ({
    moves: globalThis.CasksApp._state.moves, at: globalThis.CasksApp._state.pos[0] }));
  expect(after.moves).toBe(1);
  expect(after.at).not.toBe(plan.from);
});

/* ---- off a disk, with nothing beside it ----

   The portable file inlines every byte it can reach, and the doors gave it a
   third game to reach. Its whole promise is that it works with nothing else
   there: no worker, no origin, no fetch. A deferred group is a fetch, so the
   one build where "the cellar door arrives after the page opens" is not an
   option is exactly this one — and a door that never loads there is a run that
   stops at level eleven with no way past it and nothing saying why.

   Opened over `file://`, because that is the only form of this that means
   anything: a sibling path is cross origin to a file page, which is the failure
   this is watching for. */
const PORTABLE = join(dirname(fileURLToPath(import.meta.url)), '../../dist/decanter-standalone.html');

test('the portable file carries the doors, and one opens off disk', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.addInitScript(([key, save]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
  }, [SAVE_KEY, { version: 1, layout: 5, unlocked: 11, gold: 400, doors: {},
                  stars: {}, best: {}, pars: {}, claimed: {}, seen: { 0: true }, sound: false }]);
  await page.goto(`file://${PORTABLE}`);
  await page.waitForFunction(() => !!globalThis.App && !!globalThis.Levels);

  /* the gate is on the map here too */
  await expect(page.locator('.node.door[data-door="1"]')).toBeEnabled();
  await page.locator('.node.door[data-door="1"]').click();

  /* and the floor deals, which is the part that needs the game to be IN the
     file rather than a fetch away */
  await page.waitForFunction(() => typeof globalThis.CasksApp !== 'undefined'
    && globalThis.CasksApp._state.layout.length > 0, null, { timeout: 15000 });
  await expect(page.locator('body')).toHaveAttribute('data-view', 'door');

  await solveTheDoor(page);
  await page.waitForFunction(() => globalThis.App._progress.isDoorOpen(1));
  expect(await page.evaluate(() => globalThis.App._progress.isUnlocked(11))).toBe(true);
  expect(errors).toEqual([]);
});
