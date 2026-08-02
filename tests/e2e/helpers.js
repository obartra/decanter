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
export async function openLevel(page, level) {
  await page.locator(`[data-level="${level}"]`).click();
  await page.waitForFunction(l => globalThis.App._state.level === l
    && globalThis.App._state.tubes.length > 0, level);
  await dismissChapter(page);
  await page.waitForFunction(() => document.querySelectorAll('#board .bottle').length > 0);
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
