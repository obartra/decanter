/* Shared setup for the browser specs.

   Every spec starts from a known save rather than from whatever the last one
   left behind, because progress lives in localStorage and specs run in
   parallel. The save is written before the page's own scripts run, so the game
   boots into the state the spec asked for rather than booting, saving, and then
   being overwritten. */

import { loadPure, loadGame } from '../helpers.mjs';

export const SAVE_KEY = 'decanter.save.v1';

/* The named states, off the same module the lab offers as presets.

   Loaded here rather than restated, which is the whole point: a spec asking for
   `state('purseDry')` and a person clicking "Stranded with an empty purse" in
   the lab are asking for the same save. Before this, "stranded" was the literal
   `{ unlocked: 15, gold: 0, seen: { 0: true, 1: true } }` written out in four
   specs, and the day the fee moved there were four of them to find.

   The states are functions of the game's own modules — which level precedes a
   bubble board, which chapter grants the blast — so they are resolved against
   the pure modules in the sandbox, the same ones the unit suite uses. */
const pure = loadPure();
const { LabStates } = loadGame('lab');

const stateEnv = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return {
    CONFIG: pure.CONFIG, Levels: pure.Levels, Chapters: pure.Chapters,
    LAST_LEVEL: pure.LAST_LEVEL,
    /* the local calendar day the game itself computes, or a draught state would
       describe a different day from the one the map is looking at */
    today: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  };
};

/* A named state, as save overrides `start()` accepts. Extra fields may be
   layered on for the one thing a spec is about — the state is the setting, not
   a straitjacket. */
export const state = (id, extra = {}) => ({ ...LabStates.make(id, stateEnv()), ...extra });

/* The whole list, for the specs that walk every one of them. */
export const everyState = () => LabStates.list.map(s => ({ ...s, save: LabStates.make(s.id, stateEnv()) }));
export const RECOVERY = LabStates.RECOVERY;

/* Ask for the reduced motion the game already implements.

   A pour is almost entirely waiting. Measured on one board, the queue takes
   1537ms to drain per pour at full motion and 597ms under reduced motion, and
   the clicks either side of it cost twenty between them. A spec that plays a
   level of twelve pours therefore spends eighteen seconds watching liquid move,
   and most of the suite's slowest specs play levels.

   This is not a stopwatch trick. `src/js/70-board.js` reads the same media query
   and collapses the tilt, the lean, the tip and every sleep in the queue,
   because a player who asks for less motion still gets their pours sequenced in
   the same order through the same queue. What it gives up is real-time timing,
   which is why play.spec.js asks for full motion back on the two tests where the
   timing is the subject, and economy.spec.js asks for it on the one that counts
   confetti — reduced motion is the first thing that turns confetti off, so run
   reduced it asks for paper the game is right not to throw.

   Set here rather than in playwright.config.js because the config option does
   not work. In 1.62.1 `use: { reducedMotion: 'reduce' }` arrives intact at
   `testInfo.project.use.reducedMotion` and never reaches the browser: the page
   goes on reporting `no-preference`, so the setting reads as applied, every spec
   runs at full speed, and measuring it shows no difference for a reason that has
   nothing to do with the game. `emulateMedia` does work. */
const motion = (page, mode) => page.emulateMedia({ reducedMotion: mode });

/* A save the game will accept as current. The layout stamp has to match the
   build's, or the game will treat the save as one from older boards. */
/* `path` is here for the one thing that is decided by the address bar rather
   than by the save: Jabari mode is on when a beta word is in the query string,
   and the reloads below carry it, so a spec that asks for it gets it on every
   load rather than only the first. */
export async function start(page, save = {}, { path = '/', reducedMotion = 'reduce' } = {}) {
  await motion(page, reducedMotion);
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
  await page.goto(path);
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
  /* The card a cleared level answers with is not in the critical bundle: it is
     fetched on `load`, and `App` and `Rules` are alive well before that. So a
     spec that taps a medallion the moment the map appears is racing a fetch, and
     losing that race looks like a tap that did nothing rather than like a
     missing wait. Waiting once, here, is what keeps every spec about the game
     rather than about the network. */
  await page.waitForFunction(() => !!globalThis.Preview);
}

/* A save written down exactly as given, and opened once.

   `start()` above is deliberate about the layout stamp: it corrects it to the
   build's, because a spec that meant "level 15, four hundred gold" does not also
   mean "and from an older set of boards", and every one of them would otherwise
   have been silently testing the migration path.

   That is right for a spec about the game and wrong for a spec about the save.
   The three recovery states — an older layout, fields that did not exist yet,
   types somebody's browser mangled — are saves whose whole point is being wrong,
   and stamping a current layout onto one repairs the thing under test. This
   found that the hard way: a stale-layout state seeded through `start()` arrived
   with a current stamp and kept the bests it was supposed to lose.

   So: written verbatim, once, before anything runs. No defaults filled in and no
   second pass, because both of those are the game's job here rather than the
   fixture's. */
export async function startRaw(page, save, { reducedMotion = 'reduce' } = {}) {
  await motion(page, reducedMotion);
  await page.addInitScript(([key, wanted]) => {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify(wanted));
  }, [SAVE_KEY, save]);
  await page.goto('/');
  await page.waitForFunction(() => !!globalThis.App && !!globalThis.Rules);
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
  /* Whichever of the two answers this tap gets, before looking at either. Both
     of them settle a moment after the tap now, so sampling once for the card and
     moving on when it is not there yet leaves this waiting for a board that was
     never going to be dealt. */
  await page.waitForFunction(() =>
    document.getElementById('previewVeil').classList.contains('show')
    || document.body.dataset.view !== 'map');
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

/* End the run on the board that is up, one of the three ways it can end, and
   wait for the panel. `over` spends the pours, `stuck` leaves no legal move,
   `short` leaves more work than pours — which is the only one a blast answers.

   Through `App._end()`, which is the app's own hook for exactly this: the shelf
   is built, the ending is asked for, and it then goes through the same finish()
   as every real run — the same solved check, the same rating, the same panel.
   Playing to a chosen ending against animated pours takes a minute of real time
   and lands on whichever ending the board felt like.

   Here rather than in the spec about the panel, because the specs about the
   doors need the same three endings on the last board of a chapter, and a second
   copy of a fixture is a second thing to keep in step with `finish()`. */
export async function endRun(page, how){
  await page.evaluate(([kind]) => {
    const S = globalThis.App._state;
    if (kind === 'clean'){
      S.tubes = [[0, 0, 0, 0], [1, 1, 1, 1], []];
      S.par = 20; S.parExact = true; S.moves = 20;
    } else if (kind === 'short'){
      /* two colors needing more pours than are left */
      S.tubes = [[0, 1, 0, 1], [1, 0, 1, 0], []];
      S.par = 2; S.parExact = true; S.moves = 2; S.history = [];
    } else {
      /* Nothing legal and nothing sorted. Three FULL bottles, each holding two
         colors, so no pour has anywhere to go and no bottle is finished.

         The first version of this was three full bottles of one color each,
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

/* Sound and the patterned liquids live in a settings card now, reachable from
   the gear in every header. The specs used to click a header icon directly;
   this is the same intent, one screen deeper, written once so the next setting
   does not mean editing four files again. */
export async function toggleSetting(page, which, view = 'mapView'){
  await page.locator(`#${view} .js-settings`).click();
  await page.waitForFunction(() => document.getElementById('setVeil').classList.contains('show'));
  await page.locator(which === 'sound' ? '#setSound' : '#setCb').click();
  await page.locator('#setClose').click();
  await page.waitForFunction(() => !document.getElementById('setVeil').classList.contains('show'));
}
