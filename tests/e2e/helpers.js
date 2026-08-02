/* Shared setup for the browser specs.

   Every spec starts from a known save rather than from whatever the last one
   left behind, because progress lives in localStorage and specs run in
   parallel. The save is written before the page's own scripts run, so the game
   boots into the state the spec asked for rather than booting, saving, and then
   being overwritten. */

export const SAVE_KEY = 'decanter.save.v1';

/* A save the game will accept as current. The layout stamp has to match the
   build's, or the game will treat the save as one from older boards. */
export async function start(page, save = {}) {
  await page.addInitScript(([key, wanted]) => {
    /* Seeded once, not on every load. addInitScript runs again on every
       navigation, so writing unconditionally meant a reload put the save back to
       what the spec asked for and quietly threw away whatever the game had
       recorded. Every assertion about persistence was checking the seed. */
    const write = () => {
      if (localStorage.getItem(key)) return;
      const layout = (globalThis.CONFIG && globalThis.CONFIG.layout) || 1;
      localStorage.setItem(key, JSON.stringify({
        version: 1, layout, unlocked: 1, gold: 400, stars: {}, best: {},
        pars: {}, claimed: {}, sound: false, dailyOn: null, ...wanted
      }));
    };
    /* CONFIG only exists once the page has run, so write once now with a
       placeholder stamp and again the moment the real one is known */
    write();
    addEventListener('DOMContentLoaded', () => {
      if (!globalThis.CONFIG) return;
      const raw = JSON.parse(localStorage.getItem(key) || '{}');
      if (raw.layout !== globalThis.CONFIG.layout) {
        localStorage.setItem(key, JSON.stringify({ ...raw, layout: globalThis.CONFIG.layout }));
      }
    });
  }, [SAVE_KEY, save]);
  await page.goto('/');
  await page.waitForFunction(() => !!globalThis.App && !!globalThis.Rules);
  /* the first write used a guessed stamp, so reload once into the real one */
  await page.reload();
  await page.waitForFunction(() => !!globalThis.App && !!globalThis.Rules);
  if (Object.keys(save).length) {
    await page.evaluate(([key, wanted]) => {
      const raw = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...raw, ...wanted, layout: globalThis.CONFIG.layout }));
    }, [SAVE_KEY, save]);
    await page.reload();
    await page.waitForFunction(() => !!globalThis.App && !!globalThis.Rules);
  }
}

/* Open a level from the map. Waits for the board to be dealt rather than for a
   fixed time, so a slow machine does not turn into a flaky spec.

   Reaching a chapter for the first time puts its opening over the board, so this
   reads it and moves on the way a player would. A spec that is about the opening
   itself passes `seen` in its save and never gets here. */
/* Open a level from the map, whichever game it turns out to be. Some levels are
   the bubble game and have no shelf to wait for, so this waits only for the
   level to be dealt; `openLevel` is this plus the wait for bottles.

   Both of the two things that can land between the tap and the board are dealt
   with here: the card a cleared level answers with, and a chapter's opening. A
   spec that had its own copy of this had neither, and would have hung the first
   time it opened a level it had already cleared. */
export async function open(page, level) {
  await page.locator(`[data-level="${level}"]`).click();
  await playFromPreview(page);
  await page.waitForFunction(l => globalThis.App._state.level === l, level);
  await dismissChapter(page);
}

export async function openLevel(page, level) {
  await open(page, level);
  await page.waitForFunction(() => globalThis.App._state.tubes.length > 0);
  await page.waitForFunction(() => document.querySelectorAll('#board .bottle').length > 0);
}

/* A level already cleared answers the tap with a card rather than a board: what
   it was, how it went, and what going back would pay. A spec about the level
   itself reads it and plays, the way a player would. A spec about the card
   itself never comes through here. */
export async function playFromPreview(page) {
  const card = page.locator('#previewVeil');
  if (await card.evaluate(el => el.classList.contains('show')).catch(() => false)) {
    await page.locator('#previewPlay').click();
    await page.waitForFunction(() =>
      !document.getElementById('previewVeil').classList.contains('show'));
  }
}

export async function dismissChapter(page) {
  const card = page.locator('#chapterVeil');
  if (await card.evaluate(el => el.classList.contains('show')).catch(() => false)) {
    await page.locator('#chapterGo').click();
    await page.waitForFunction(() =>
      !document.getElementById('chapterVeil').classList.contains('show'));
  }
}

/* Play one pour and wait for the animation to land, so the next one starts from
   a board that has stopped moving. */
export async function pour(page, from, to) {
  const before = await page.evaluate(() => globalThis.App._state.moves);
  await page.locator('#board .glass').nth(from).click();
  await page.locator('#board .glass').nth(to).click();
  await page.waitForFunction(n => globalThis.App._state.moves > n, before);
  await settle(page);
}

/* the queue is empty and nothing is animating */
export async function settle(page) {
  await page.waitForFunction(() => {
    const s = globalThis.App._state;
    return !s.running && s.queue.length === 0;
  }, null, { timeout: 30_000 });
}

/* Lose the run at a pour level, by taking it past the pour budget.

   Not a hand built dead board. Any graded level can be lost this way, which is
   what a spec about a particular level boundary needs, and running out of pours
   is the commoner of the two ways to lose anyway. */
export async function loseAt(page, level) {
  await openLevel(page, level);
  const move = await page.evaluate(() => {
    const S = globalThis.App._state;
    /* one pour short of the budget, so the next one takes the run past it */
    S.moves = S.par + globalThis.CONFIG.stars.one;
    const m = globalThis.Rules.legalMoves(S.tubes)[0];
    return [m.from, m.to];
  });
  await pour(page, move[0], move[1]);
  await settle(page);
}

/* The shortest line the solver knows, as [from, to] pairs. Asking the page
   keeps the spec honest: it plays the board the build actually dealt. */
export async function optimalLine(page) {
  return page.evaluate(async () => {
    const { Rules, Levels, App } = globalThis;
    const colors = Levels.shape(App._state.level).colors;
    const tubes = Rules.clone(App._state.tubes);
    const line = [];
    const ask = t => new Promise(res => globalThis.SolverClient.solve(t, colors, res));
    let cur = tubes;
    for (let guard = 0; guard < 80; guard++) {
      if (Rules.isSolved(cur)) break;
      const got = await ask(cur);
      if (!got || !got.first) break;
      const [from, to] = got.first;
      line.push([from, to]);
      cur = Rules.applyMove(Rules.clone(cur), { from, to, n: Rules.pourAmount(cur, from, to) });
    }
    return line;
  });
}
