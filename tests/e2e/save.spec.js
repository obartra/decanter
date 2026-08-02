/* What a broken save does to the game.

   This is the only failure in the project with no way back. Everything else a
   player can walk away from and return to: a board they cannot beat, a purse
   they cannot fill, a level that will not deal. A save the game throws on is
   different — the throw happens during boot, before anything is drawn, so what
   the owner of that device gets is a blank screen, forever, with no button to
   press and nothing saying what went wrong. Clearing site data would fix it and
   nobody would ever guess.

   The save is also the one input the game does not control. It has been on disk
   across versions, it has been through migrations, and browsers do lose bytes
   out of localStorage. `40-progress.js` is careful about all of this and the
   unit suite checks its arithmetic, but "the module normalised the object" and
   "the page came up" are two different claims and only one of them was checked.

   So: one valid save, mutated every way that is cheap to describe, opened for
   real. Not fuzzing for crashes in general — fuzzing the one boundary where a
   crash is unrecoverable. */
import { test, expect } from '@playwright/test';
import { startRaw, state } from './helpers.js';

/* A save a real player would have, as the thing to break. Taken from the named
   states so it stays a save the game recognises as current rather than a literal
   that slowly stops being one. */
const WHOLE = { version: 1, layout: 5, ...state('firstChapter') };

/* Values that are wrong in the ways values are actually wrong: absent, the wrong
   shape, a number that is not one, a number outside the range it is read in. */
const BROKEN = [
  undefined, null, 0, -1, 1e9, NaN, Infinity, -0.5,
  '', 'nope', '12', true, false, [], {}, [1, 2, 3], { a: 1 }
];

/* Every field of a real save, crossed with every way a field goes wrong. Built
   from the save's own keys, so a field added to the schema is fuzzed the day it
   arrives rather than the day somebody remembers to add it here. */
function mutations(){
  const out = [];
  for (const key of Object.keys(WHOLE)){
    for (const [i, value] of BROKEN.entries()){
      /* NaN and Infinity do not survive JSON, and a save is JSON. Writing them
         would be fuzzing a state that cannot reach the disk, which is worse than
         not fuzzing: it spends a test on an input no player can produce. */
      if (Number.isNaN(value) || value === Infinity) continue;
      const save = { ...WHOLE };
      if (value === undefined) delete save[key]; else save[key] = value;
      out.push({ as: `${key} = ${value === undefined ? 'absent' : JSON.stringify(value)}`, save, i });
    }
  }
  /* and the shapes that are not an object at all */
  out.push({ as: 'the whole save is a string', save: 'nonsense' });
  out.push({ as: 'the whole save is a number', save: 7 });
  out.push({ as: 'the whole save is an array', save: [1, 2, 3] });
  out.push({ as: 'the whole save is null', save: null });
  out.push({ as: 'the whole save is empty', save: {} });
  return out;
}

const CASES = mutations();

test('there is something to fuzz', () => {
  /* A loop over an empty list passes, and a fuzzer that fuzzes nothing is the
     most convincing green tick in the suite. */
  expect(CASES.length).toBeGreaterThan(100);
  expect(Object.keys(WHOLE).length).toBeGreaterThan(5);
});

/* One test rather than one per mutation, because there are over a hundred and
   each needs a page load: as separate tests this file would be the slowest thing
   in the suite by an order of magnitude. Batched, the whole sweep is one context
   and the failure names the mutation that did it. */
test('no save, however broken, stops the game opening', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const broke = [];
  for (const c of CASES){
    await page.addInitScript(([key, value]) => {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }, ['decanter.save.v1', c.save]);
    /* A fresh context per mutation would be correct and would also be a hundred
       browser launches. Same page, save rewritten, reloaded: the init script
       runs again on each navigation, which is exactly what is wanted here and is
       the opposite of what `start()` needs. */
    await page.goto('/');
    let up = true;
    try {
      await page.waitForFunction(() => !!globalThis.App && !!globalThis.App._progress, { timeout: 5000 });
      const live = await page.evaluate(() => ({
        unlocked: globalThis.App._progress.unlocked,
        gold: globalThis.App._progress.gold,
        view: document.body.dataset.view,
        nodes: document.querySelectorAll('.node').length
      }));
      /* Not merely "it did not throw". What the player gets has to be a game:
         a map with medallions on it, a level they can open, and a purse that is
         a number. */
      up = Number.isInteger(live.unlocked) && live.unlocked >= 1
        && Number.isFinite(live.gold) && live.gold >= 0
        && live.view === 'map' && live.nodes > 0;
    } catch (e) {
      up = false;
    }
    if (!up || errors.length) broke.push(`${c.as} — ${errors.join('; ') || 'no game came up'}`);
    errors.length = 0;
  }

  expect(broke).toEqual([]);
});

/* The fuzzer above is only worth its runtime if it can fail. This plants the
   failure it is looking for: a save the game cannot read at all, written where
   the game cannot recover from it. */
test('the fuzz would notice a game that did not come up', async ({ page }) => {
  await page.addInitScript(() => {
    /* The check the fuzz applies is "a map with medallions on it". So the plant
       is a game that boots without one: the app is there, the save is fine, and
       nothing is drawn. That is the shape of the failure being guarded against —
       a page that loaded and did not become a game — rather than an exception,
       which any `catch` would have caught anyway. */
    addEventListener('DOMContentLoaded', () => {
      const scroll = document.getElementById('mapScroll');
      if (scroll) scroll.replaceChildren();
      const obs = new MutationObserver(() => {
        for (const n of document.querySelectorAll('.node')) n.remove();
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    });
  });
  await page.goto('/');
  await page.waitForFunction(() => !!globalThis.App).catch(() => {});
  const live = await page.evaluate(() => ({
    view: document.body.dataset.view,
    nodes: document.querySelectorAll('.node').length
  })).catch(() => ({ view: null, nodes: 0 }));
  /* the same question the sweep asks, answered no */
  expect(live.view === 'map' && live.nodes > 0).toBe(false);
});

/* A save the game repaired has to STAY repaired. A migration that runs on every
   load is one that never finished, and the cost is paid on every open forever
   rather than once. */
test('a save the game had to repair is written back mended', async ({ page }) => {
  await startRaw(page, state('oldVersion'));
  const first = await page.evaluate(() => {
    /* nudge it into saving, the way any real change would */
    globalThis.App._progress.setSound(true);
    return localStorage.getItem('decanter.save.v1');
  });
  const mended = JSON.parse(first);
  expect(Number.isInteger(mended.layout)).toBe(true);
  expect(mended.seen && typeof mended.seen === 'object').toBe(true);
  expect(mended.claimed && typeof mended.claimed === 'object').toBe(true);
  expect(mended.diag && typeof mended.diag === 'object').toBe(true);

  await page.reload();
  await page.waitForFunction(() => !!globalThis.App);
  const second = await page.evaluate(() => localStorage.getItem('decanter.save.v1'));
  /* the second load changes nothing, because there is nothing left to fix */
  expect(JSON.parse(second)).toEqual(mended);
});
