/* The workbench, in a browser.

   The lab is a shipped page. It is built by the same build, precached by the
   same worker and served from the same origin as the games, and until now it was
   the one page in the build with no browser test at all — checked only by a unit
   suite that reads its config as text and can say nothing about whether it comes
   up.

   That gap matters more here than it would elsewhere, because of what the lab
   is. It reaches into another page through `contentWindow` and writes the
   player's own save. A lab that quietly stopped reaching would report that
   nothing is wrong with everything; a lab that stopped putting the save back
   would eat somebody's progress. Neither is visible from outside a browser and
   neither throws.

   Two claims, then, above all the others: the frame is really being reached, and
   your own save comes back. */
import { test, expect } from '@playwright/test';

/* Straight to the page, with no `start()`: this spec is about the lab writing
   the save, so it writes its own by hand and then watches what happens to it. */
const OWN = { version: 1, layout: 5, unlocked: 42, gold: 777, stars: { 1: 3 }, best: { 1: 9 },
              pars: { 1: 9 }, claimed: { 1: true }, seen: { 0: true }, dailyOn: null };

async function openLab(page, save = OWN){
  await page.addInitScript(([key, wanted]) => {
    /* Guarded. addInitScript runs again on every navigation INCLUDING the
       iframe, so an unguarded write re-seeds the game each time the lab reloads
       the frame — which makes every state look as though it did not apply. That
       cost an hour the first time. */
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(wanted));
  }, ['decanter.save.v1', save]);
  await page.goto('/lab/');
  await page.waitForFunction(() => document.querySelectorAll('.labTab').length > 0);
  /* the frame carries the first game, and the knobs are drawn from it */
  await page.waitForFunction(() => document.querySelectorAll('#labKnobs input[type=range]').length > 0);
}

const frame = page => page.evaluate(() => {
  const w = document.getElementById('labFrame').contentWindow;
  return { has: !!w && !!w.CONFIG, view: w.document.body.dataset.view || w.document.body.dataset.only };
});

test('opens with a tab for every game the build has', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openLab(page);
  const tabs = await page.locator('.labTab').allTextContents();
  /* Four pages carry a game, and the lab is a workbench for all of them. A tab
     that stopped appearing is a game nobody would think to look at again. */
  expect(tabs.length).toBe(4);
  expect(tabs).toContain('The Cellar');
  expect(errors).toEqual([]);
});

test('reaches into the frame rather than mounting a game of its own', async ({ page }) => {
  await openLab(page);
  /* The whole design in one assertion. If `contentWindow` stops handing over the
     live modules, every readout in the panel becomes a readout of nothing, and
     the lab goes on drawing sliders that move a config nobody is running. */
  expect(await frame(page)).toEqual({ has: true, view: 'map' });
});

test('a knob moves the constant the game is actually running on', async ({ page }) => {
  await openLab(page);
  const before = await page.evaluate(() =>
    document.getElementById('labFrame').contentWindow.CONFIG.economy.attempt);
  const slider = page.locator('#labKnobs input[type=range]').first();
  await slider.fill(String(before + 7));
  await slider.dispatchEvent('input');
  const after = await page.evaluate(() =>
    document.getElementById('labFrame').contentWindow.CONFIG.economy.attempt);
  /* Not the lab's copy of the number. The frame's. */
  expect(after).toBe(before + 7);
});

test('a named state loads the real page into it', async ({ page }) => {
  await openLab(page);
  await page.locator('.labState', { hasText: 'Stranded' }).click();
  await page.waitForFunction(() => {
    const w = document.getElementById('labFrame').contentWindow;
    return w && w.App && w.App._progress && w.App._progress.gold === 0;
  });
  const live = await page.evaluate(() => {
    const p = document.getElementById('labFrame').contentWindow.App._progress;
    return { gold: p.gold, unlocked: p.unlocked };
  });
  expect(live).toEqual({ gold: 0, unlocked: 15 });
});

/* Stepping the level, on the save where every board is already beaten.

   The lab drives the map the way a player does, and the map answers a tap on a
   CLEARED level with the card before a replay rather than with a board. Every
   level is cleared in this state, so before the lab learned to answer that card
   the step did nothing at all: the frame kept whichever board it already had
   while the sidebar's number moved on, and the readout beside it went on
   describing the old board's par. A workbench reporting a level it never dealt.

   Worst across the boundary between the two games, which is why the step is
   taken there: a bubble level's number over a shelf of bottles is the one shape
   of this bug that looks like a fault in the game rather than in the lab.

   Which level that boundary is gets asked of the game rather than written down,
   so the day the interleave moves this still tests the boundary. */
test('stepping the level deals every board, across the bubble boundary', async ({ page }) => {
  await openLab(page);
  await page.locator('.labState', { hasText: 'Every board beaten' }).click();
  /* Waited for on the LAST level, not the first. The save this spec seeds with
     already has three stars on level 1, so waiting on that one is satisfied
     before the state has applied and before the frame has reloaded — and the
     steps below then race a document that is about to be replaced. Passed alone
     and failed in a full run, which is the worst way to learn it. */
  await page.waitForFunction(() => {
    const w = document.getElementById('labFrame').contentWindow;
    return w && w.App && w.App._progress && w.LAST_LEVEL
      && w.App._progress.starsFor(w.LAST_LEVEL) === 3;
  });

  const bubble = await page.evaluate(() => {
    const w = document.getElementById('labFrame').contentWindow;
    for (let n = 2; n < 120; n++) if (w.Levels.isBubble(n)) return n;
    return null;
  });
  expect(bubble, 'the interleave deals no bubble level at all').not.toBeNull();

  const first = bubble - 1;
  await page.fill('#labLevel', String(first));
  await page.dispatchEvent('#labLevel', 'change');

  const read = () => page.evaluate(() => {
    const w = document.getElementById('labFrame').contentWindow;
    return { dealt: w.App._state.level, bubble: w.Levels.isBubble(w.App._state.level),
             view: w.document.body.dataset.view };
  });
  const seen = [];
  for (let level = first; level <= bubble + 1; level++){
    if (level > first) await page.locator('#labNext').click();
    /* Swallowed on purpose. A step that never lands is exactly the bug, and
       letting this throw would report it as a timeout on a wait; letting it
       settle and asserting below reports it as the level it stopped on. */
    await page.waitForFunction(
      n => document.getElementById('labFrame').contentWindow.App._state.level === n,
      level, { timeout: 8000 }).catch(() => {});
    seen.push({ asked: level, ...await read() });
  }

  /* every step dealt the level it was asked for */
  expect(seen.map(s => s.dealt)).toEqual(seen.map(s => s.asked));
  /* and the frame is showing the game that level IS */
  for (const s of seen){
    expect(s.view, `level ${s.asked}`).toBe(s.bubble ? 'bubble' : 'game');
  }
  /* not vacuous: the run really did cross from one game to the other and back */
  expect(seen.filter(s => s.bubble)).toHaveLength(1);
  expect(seen.filter(s => !s.bubble)).toHaveLength(2);
});

/* The one that matters most. Everything else here is a workbench being wrong;
   this is somebody's progress being gone, silently, because they opened a
   developer page out of curiosity. */
test('your own save is parked and comes back untouched', async ({ page }) => {
  await openLab(page);
  const before = await page.evaluate(() => localStorage.getItem('decanter.save.v1'));

  for (const which of ['Stranded', 'A new player', 'Every board beaten']){
    await page.locator('.labState', { hasText: which }).click();
    await page.waitForTimeout(400);
  }
  /* parked, and said so, so nobody has to guess */
  expect(await page.evaluate(() => !!localStorage.getItem('decanter.lab.parked'))).toBe(true);
  await expect(page.locator('#labStateNote')).toContainText('parked');

  await page.locator('#labStates .labBtn', { hasText: 'Put my own save back' }).click();
  await page.waitForFunction(() => !localStorage.getItem('decanter.lab.parked'));
  const after = await page.evaluate(() => localStorage.getItem('decanter.save.v1'));
  /* byte for byte, after three states have been written over it */
  expect(JSON.parse(after)).toEqual(JSON.parse(before));
});

test('the panel sweep runs against the real game and finds nothing wrong', async ({ page }) => {
  await openLab(page);
  await page.locator('#labSweep').click();
  await page.waitForFunction(() => /panels/.test(document.getElementById('labSweepOut').textContent),
    null, { timeout: 30000 });
  const said = await page.locator('#labSweepOut .labStat').first().textContent();
  /* The unit suite gates this. What the browser adds is that the sweep RUNS
     here: it reads the frame's Panel, walks the axes and reports, which is a
     different thing from the enumeration being correct. */
  expect(said).toMatch(/\d+ panels · 0 faults/);
  expect(await page.locator('.labMatrix tr').count()).toBeGreaterThan(100);
});

test('switching to a game with a par curve measures it', async ({ page }) => {
  await openLab(page);
  await page.locator('.labTab', { hasText: 'The Measure' }).click();
  await page.waitForFunction(() => {
    const w = document.getElementById('labFrame').contentWindow;
    return w && w.MeasureConfig;
  });
  await page.fill('#labFrom', '1');
  await page.fill('#labTo', '10');
  await page.locator('#labSweep').click();
  await page.waitForFunction(() => /par \d+ to \d+/.test(document.getElementById('labSweepOut').textContent),
    null, { timeout: 30000 });
  const out = await page.locator('#labSweepOut').textContent();
  /* the two claims the par sweep exists to make */
  expect(out).toMatch(/no step goes down/);
  expect(out).not.toMatch(/DISAGREE/);
});

test('is not reachable from the game, and does not reach back', async ({ page }) => {
  await openLab(page);
  /* The dependency runs one way. A game that knew about the lab would be a game
     shipping a workbench to players. */
  const linked = await page.evaluate(async () => {
    const html = (await (await fetch('../')).text()).replace(/<!--[\s\S]*?-->/g, '');
    /* A path to the lab, not the word. The first version of this asked for
       /lab/i anywhere in the page and matched `aria-label`, which is the kind of
       check that goes red for a reason nobody can act on and then gets deleted. */
    return [...html.matchAll(/(?:href|src|action)="([^"]*)"/g)].map(m => m[1])
      .filter(u => /(^|\/)lab\//.test(u));
  });
  expect(linked).toEqual([]);
});

/* The one screen the workbench could not reach.

   Stepping the level is how everything here is looked at, and a level behind a
   shut cellar door has no board to deal — so the lab reported the refusal and
   stopped, which left the door itself, a whole screen of the game, with no way
   into it from the page built for looking at screens.

   It taps the gate now, which is what the map offers a player standing there.
   Still through the map: the lab finds the node and clicks it, exactly as it
   finds a medallion. */
test('steps into a cellar door rather than only reporting the refusal', async ({ page }) => {
  await openLab(page);
  await page.locator('.labState', { hasText: 'Standing at a shut cellar door' }).click();
  await page.waitForFunction(() => {
    const w = document.getElementById('labFrame').contentWindow;
    return w && w.App && w.App._progress && !w.App._progress.isDoorOpen(1);
  });

  const first = await page.evaluate(() =>
    document.getElementById('labFrame').contentWindow.CONFIG.sectionSize + 1);
  await page.fill('#labLevel', String(first));
  await page.dispatchEvent('#labLevel', 'change');

  /* the frame is showing the floor of casks, dealt from the door table */
  await page.waitForFunction(() => {
    const w = document.getElementById('labFrame').contentWindow;
    return w.document.body.dataset.view === 'door'
      && w.CasksApp && w.CasksApp._state.layout.length > 0;
  });
  const shown = await page.evaluate(n => {
    const w = document.getElementById('labFrame').contentWindow;
    return { floor: w.CasksApp._state.level, wanted: w.Levels.doorFor(w.Levels.sectionOf(n)) };
  }, first);
  expect(shown.floor).toBe(shown.wanted);

  /* and it says what it did, rather than leaving a level number that moved and
     a frame showing something the sidebar never mentions */
  await expect(page.locator('#labNote')).toContainText('behind a shut door');
});

test('offers a state for a door into a chapter with no name', async ({ page }) => {
  /* Five of the eleven doors open onto sections the chapter list does not
     reach, so they carry a `Reserve` name and show no opening card. Nothing
     else in the lab reaches one. */
  await openLab(page);
  await page.locator('.labState', { hasText: 'chapter with no name' }).click();
  /* Waited on by name, off the lab's own readout. `unlocked > 1` was the wait
     before, and it is true of the save the lab had already parked, so it let
     the read through before the state had been written and reported whatever
     was there, which is a pass that is really a race. */
  await expect(page.locator('#labNote')).toContainText('state: atUnnamedDoor');
  const seen = await page.evaluate(() => {
    const w = document.getElementById('labFrame').contentWindow;
    const at = w.App._progress.unlocked;
    const section = w.Levels.sectionOf(at);
    return { name: w.Levels.sectionName(at), hasChapter: !!w.Chapters.at(section),
             doorShut: !w.App._progress.isDoorOpen(section) };
  });
  expect(seen.name).toMatch(/^Reserve /);
  expect(seen.hasChapter, 'this is the case where there is no chapter entry').toBe(false);
  expect(seen.doorShut).toBe(true);
});
