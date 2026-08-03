/* Gold changing hands, and the things it buys. */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { start, openLevel, settle, state } from './helpers.js';

const PORTABLE = join(dirname(fileURLToPath(import.meta.url)), '../../dist/decanter-standalone.html');

test('a level can be bought from the map, and only the next one', async ({ page }) => {
  await start(page, { unlocked: 5, gold: 400, seen: { 0: true } });
  const buyable = page.locator('.node.buyable');
  await expect(buyable).toHaveCount(1);
  await expect(buyable).toHaveAttribute('data-level', '6');

  /* the first tap arms it and must not spend anything */
  const before = await page.evaluate(() => globalThis.App._progress.gold);
  await buyable.click();
  await expect(page.locator('.node.armed')).toHaveCount(1);
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(before);

  await page.locator('.node.armed').click();
  const after = await page.evaluate(() => ({
    gold: globalThis.App._progress.gold,
    unlocked: globalThis.App._progress.unlocked,
    stars: globalThis.App._progress.starsFor(5),
    claimed: !!globalThis.App._progress.raw.claimed[5]
  }));
  expect(after.unlocked).toBe(6);
  expect(after.gold).toBeLessThan(before);
  /* buying past a board is not beating it */
  expect(after.stars).toBe(0);
  expect(after.claimed).toBe(false);
  /* and back on the map it is the one after that which is for sale */
  await page.locator('#toMap').click();
  await expect(page.locator('.node.buyable')).toHaveAttribute('data-level', '7');
});

test('the price of paying past a board buys the same thing from either screen', async ({ page }) => {
  /* Twice an attempt covers the deal as well, which is why the panel's Move on
     hands over the board without charging again. The map charged the identical
     amount and dealt nothing, so a purse holding exactly the skip price came
     away owning a level it could not afford to open until the next draught. */
  await start(page, { unlocked: 5, gold: 400, seen: { 0: true } });
  const e = await page.evaluate(() => globalThis.CONFIG.economy);
  const skip = e.attempt * e.skipMultiple;

  await start(page, { unlocked: 5, gold: skip, seen: { 0: true } });
  /* the medallion has to name the number the app is about to charge; the map
     used to work this out from CONFIG itself, which 09-map.md says not to do */
  await expect(page.locator('.node.buyable'))
    .toHaveAttribute('aria-label', new RegExp(`Open it for ${skip} gold`));

  await page.locator('.node.buyable').click();
  await page.locator('.node.armed').click();
  await page.waitForFunction(() => globalThis.App._state.level === 6);

  expect(await page.evaluate(() => globalThis.App._progress.gold),
    'the fee covers the board too, so there is exactly one charge').toBe(0);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'game');
  expect(await page.evaluate(() => globalThis.App._state.moves)).toBe(0);
});

test('a locked level nobody can afford refuses the tap', async ({ page }) => {
  await start(page, { unlocked: 5, gold: 4 });
  const buyable = page.locator('.node.buyable');
  await expect(buyable).toBeDisabled();
  await buyable.click({ force: true });
  expect(await page.evaluate(() => globalThis.App._progress.unlocked)).toBe(5);
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(4);
});

/* The purse running dry on the level you are stuck on is a state the economy
   plans for: the daily draught is the way back. The map used to keep offering
   the board anyway, so the tap was taken, the fee refused, and nothing at all
   happened, on a medallion that was still lit and still beaconing. */
test('an open level nobody can afford refuses the tap, and says the price', async ({ page }) => {
  await start(page, state('purseDry'));
  const fee = await page.evaluate(() => globalThis.CONFIG.economy.attempt);
  const node = page.locator('[data-level="15"]');
  await expect(node).toBeDisabled();
  await expect(node.locator('.ns.buy')).toContainText(String(fee));
  await expect(node).toHaveAttribute('aria-label', /not enough/);
  /* and the way out of it is the thing being offered */
  await expect(page.locator('#daily')).toHaveClass(/primary/);

  await node.click({ force: true });
  expect(await page.evaluate(() => document.body.dataset.view)).toBe('map');
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(0);

  /* the draught pays for a board, and the map says so without being reloaded */
  await page.locator('#daily').click();
  await expect(node).toBeEnabled();
  await expect(page.locator('#daily')).not.toHaveClass(/primary/);
  await node.click();
  await page.waitForFunction(() => globalThis.App._state.level === 15);
});

/* Restart deals the board again and is charged for like any other deal, so it is
   the same dead tap the map had: a live button that takes the tap, refuses the
   fee and leaves the screen exactly as it was. */
test('restart refuses to offer a board the purse cannot deal again', async ({ page }) => {
  await start(page, { unlocked: 15, gold: 5, seen: { 0: true, 1: true } });
  await openLevel(page, 15);
  /* the fee for this board has just been paid, so the purse is empty behind it */
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(0);

  /* restart needs a move behind it before it offers itself at all */
  await page.locator('#board .glass').nth(0).click();
  await page.locator('#board .glass').nth(1).click();
  await settle(page);
  await expect(page.locator('#restart')).toBeDisabled();
});

/* The draught is the only way back for a purse that has run dry, so the one
   screen a stranded player is looking at has to say when it returns rather than
   only that it has gone. */
test('the drawn draught says how long until it comes back', async ({ page }) => {
  await start(page, { unlocked: 15, gold: 40, seen: { 0: true, 1: true } });
  await expect(page.locator('#daily')).toBeEnabled();
  await expect(page.locator('#dailyCost')).toHaveText(/^\+\d+$/);

  await page.locator('#daily').click();
  await expect(page.locator('#daily')).toBeDisabled();
  /* a length of time, not the word "drawn" */
  await expect(page.locator('#dailyCost')).toHaveText(/^(soon|\d+m|\d+h( \d+m)?)$/);
});

/* Beta convenience: a word in the query string tops the purse up, so a player
   who has run dry mid-report does not have to wait out a day to carry on. */
test('the beta word fills the purse, and keeps working on every load', async ({ page }) => {
  await start(page, state('purseDry'));
  const word = await page.evaluate(() => globalThis.CONFIG.beta.word);
  const full = await page.evaluate(() => globalThis.CONFIG.economy.purseCap);

  await page.goto(`/?${word}`);
  await page.waitForFunction(g => globalThis.App && globalThis.App._progress.gold === g, full);
  /* the map has to show it, not just the save */
  await expect(page.locator('#mapGold')).toHaveText(String(full));
  /* the word stays put, because that is what makes the link keep working */
  expect(await page.evaluate(() => location.search)).toContain(word);
  /* and the save says the gold was handed over rather than played for */
  expect(await page.evaluate(() => globalThis.App._progress.diag.grants)).toBe(1);
  /* the level it was blocking is playable now */
  await expect(page.locator('[data-level="15"]')).toBeEnabled();

  /* Opened again: the bang goes off again and the figure is the same one. This
     is the whole reason the purse is brought up to a number rather than paid a
     sum — adding would stack a second payment on every reload. */
  await page.goto(`/?${word}`);
  await page.waitForFunction(() => {
    const el = document.getElementById('jabari');
    return el && !el.hidden && el.classList.contains('go');
  });
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(full);
  await expect(page.locator('#mapGold')).toHaveText(String(full));
});

test('an ordinary load fills nothing', async ({ page }) => {
  await start(page, { unlocked: 15, gold: 7, seen: { 0: true, 1: true } });
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(7);
  expect(await page.evaluate(() => globalThis.App._progress.diag.grants)).toBe(undefined);
  await expect(page.locator('#jabari')).toBeHidden();
});

/* Reported as silent, and there were two reasons for it.

   The fixture, like the player who reported it, plays with the sound off, and
   the bang was being swallowed by that setting. And a page nobody has touched
   cannot make a sound at all: the audio context is suspended when a pasted link
   opens, so anything scheduled then is played to nobody. This counts the nodes
   the web audio graph actually builds, because "did a sound play" is not
   otherwise a thing a browser will tell you. */
test('the bang survives a muted game, and waits for a touch it can be heard through', async ({ page }) => {
  await start(page, { unlocked: 15, gold: 0, sound: false, seen: { 0: true, 1: true } });
  const word = await page.evaluate(() => globalThis.CONFIG.beta.word);
  await page.addInitScript(() => {
    window.__srcs = 0;
    window.__started = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    const make = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function () { window.__srcs++; return make.apply(this, arguments); };
    /* Anything that would be heard, whether it came from the recording or from
       the synthesised fallback. Counting starts, not nodes: a node that is built
       and never started makes no sound. */
    for (const kind of ['createBufferSource', 'createOscillator']){
      const build = AC.prototype[kind];
      AC.prototype[kind] = function () {
        const node = build.apply(this, arguments);
        const start = node.start;
        node.start = function () { window.__started++; return start.apply(this, arguments); };
        return node;
      };
    }
  });

  await page.goto(`/?${word}`);
  await page.waitForFunction(() => {
    const el = document.getElementById('jabari');
    return el && !el.hidden && el.classList.contains('go');
  });
  /* The picture is up before anything has been touched, which is the point:
     nothing may have sounded yet.

     This used to ask `Sound.ready`, which is a proxy — whether a context exists
     and is running — and the proxy stopped tracking the claim. Chromium decides
     that state when the context is CONSTRUCTED, and under the runner's tracing
     the verdict differs either side of the `load` event: the sound module is
     fetched after the page opens now, so its context is built a few tens of
     milliseconds later than it used to be, and comes back running. Driven by
     hand against both builds, with video recording on, the two are identical:
     zero sounds started before the touch, three after, from the recording. So
     the claim is asked directly instead. It is also the stronger question — a
     running context that plays nothing is not a sound. */
  expect(await page.evaluate(() => window.__started),
    'a pasted link is not a gesture, so nothing may have sounded yet').toBe(0);
  expect(await page.evaluate(() => globalThis.Sound.enabled), 'and the game is muted').toBe(false);

  /* the first touch is the first moment a sound can be heard, so that is when
     it goes off — muted or not */
  await page.mouse.click(200, 400);
  /* Three, and the number is the point: the recording is one source per bang,
     and the synthesised fallback is three. Nine here would be a bang that still
     sounds, so nothing else in the suite would fail, and the recording could
     have stopped shipping months earlier. */
  await expect.poll(() => page.evaluate(() => window.__srcs),
    { message: 'three booms, one source each, played from the recording' })
    .toBe(3);
});

/* Three of the recording overlap, and nothing between them and the speaker
   limits anything. That makes the mix a property of whichever file is sitting in
   assets/audio/, and 11 Sound tells the next person to swap that file by copying
   a different one over it, so the number in the code is only right for as long
   as nobody takes that invitation. This renders the actual bang and measures it,
   which is the only form of "it does not clip" that survives the swap.

   The floor matters as much as the ceiling. A quiet recording still plays, still
   passes every other test here, and turns the loudest moment in the game into a
   thud nobody remarks on. 0.3 is just above the synthesised bang it replaced. */
test('the three bangs together neither clip nor fizzle', async ({ page }) => {
  await start(page, state('purseDry'));
  const mix = await page.evaluate(async () => {
    const src = document.querySelector('meta[name="boom"]')?.content;
    if (!src) return { missing: true };
    const AC = window.AudioContext || window.webkitAudioContext;
    const bytes = await (await fetch(src)).arrayBuffer();
    const buf = await new AC().decodeAudioData(bytes.slice(0));
    /* the shipped graph: three sources at the bang's spacing, each through its
       own gain, all through the master */
    const off = new OfflineAudioContext(1, Math.ceil(48000 * (buf.duration + 1)), 48000);
    const master = off.createGain();
    master.gain.value = 0.45;
    master.connect(off.destination);
    for (const at of [0, 0.19, 0.44]){
      const s = off.createBufferSource(); s.buffer = buf;
      const g = off.createGain(); g.gain.value = 0.8;
      s.connect(g).connect(master); s.start(at);
    }
    const d = (await off.startRendering()).getChannelData(0);
    let peak = 0, clipped = 0;
    for (let i = 0; i < d.length; i++){
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      if (a >= 1) clipped++;
    }
    return { peak, clipped, seconds: buf.duration };
  });

  expect(mix.missing, 'the page does not say where the bang is').toBeFalsy();
  expect(mix.clipped, 'three bangs overlapping drove the mix into the rails').toBe(0);
  expect(mix.peak, 'the bang is quieter than the synthesised one it replaced').toBeGreaterThan(0.3);
  expect(mix.peak, 'no headroom left for the three to overlap in').toBeLessThan(0.85);
});

/* The portable file is the other half of what ships and no other spec opens it,
   because until now it was the same page with the fonts pasted in and there was
   nothing about running it off disk that could fail on its own. The bang is: it
   is fetched at the moment it is wanted, and a file:// page is its own origin,
   so the version of this that points at ./audio/ would find nothing and fall
   through to the synthesised bang without a word. A build test can check the
   bytes are in the file; only a browser can say they can still be reached from
   there. */
test('the portable file still has the bang when it is opened off disk', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`file://${PORTABLE}?jabarimoneeey`);
  await page.waitForFunction(() => {
    const el = document.getElementById('jabari');
    return el && !el.hidden && el.classList.contains('go');
  });

  const played = await page.evaluate(async () => {
    let srcs = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    const make = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function(){ srcs++; return make.apply(this, arguments); };
    const src = document.querySelector('meta[name="boom"]')?.content || '';
    await globalThis.Sound.loadBoom();
    globalThis.Sound.unlock();
    globalThis.Sound.boom(); globalThis.Sound.boom(0.19); globalThis.Sound.boom(0.44);
    return { carriesItsOwnBytes: src.startsWith('data:audio/mpeg;base64,'), srcs };
  });

  expect(played.carriesItsOwnBytes, 'the portable file points at a bang instead of holding one').toBe(true);
  /* one source per bang is the recording, three would be the fallback */
  expect(played.srcs, 'off disk the bang fell back to the synthesised one').toBe(3);
  expect(errors, 'the portable file threw on open').toEqual([]);
});

/* A bang belongs to something on the screen. The noise waits for a touch
   because a pasted link is not one and the browser will not make a sound before
   it — but once the message has taken itself away, a tap is a tap on the map,
   and an explosion out of nowhere is not a celebration. */
test('a tap after the message has gone is not answered with a bang', async ({ page }) => {
  await start(page, { unlocked: 15, gold: 0, sound: false, seen: { 0: true, 1: true } });
  const word = await page.evaluate(() => globalThis.CONFIG.beta.word);
  await page.addInitScript(() => {
    window.__srcs = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    const make = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function () { window.__srcs++; return make.apply(this, arguments); };
  });

  await page.goto(`/?${word}`);
  await page.waitForFunction(() => {
    const el = document.getElementById('jabari');
    return el && !el.hidden && el.classList.contains('go');
  });
  /* nothing has been touched, so nothing has been played */
  expect(await page.evaluate(() => window.__srcs)).toBe(0);

  await page.waitForFunction(() => document.getElementById('jabari').hidden, null, { timeout: 8000 });
  await page.mouse.click(200, 400);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__srcs),
    'the bang should have stood down with the message').toBe(0);
  /* and the tap still reaches the game underneath it */
  expect(await page.evaluate(() => document.body.dataset.view)).toBe('map');
});

/* The message is the thing the word is for, so nothing is allowed to hold it
   back — not a muted game, not an audio context that will not start, not a
   purse that is already full. It is on screen the moment the link opens. */
test('the message shows on every load, whatever the state behind it', async ({ page }) => {
  const word = await page.evaluate(async () => 'jabarimoneeey');
  const cases = [
    { name: 'broke and muted', save: { unlocked: 15, gold: 0, sound: false } },
    { name: 'already full', save: { unlocked: 15, gold: 9999999, sound: false } },
    { name: 'sound on', save: { unlocked: 15, gold: 40, sound: true } }
  ];
  for (const c of cases) {
    await start(page, { ...c.save, seen: { 0: true, 1: true } });
    await page.goto(`/?${word}`);
    await page.waitForFunction(() => {
      const el = document.getElementById('jabari');
      return el && !el.hidden && el.classList.contains('go');
    }, null, { timeout: 5000 });
    /* and the purse is reset to the figure, not nudged towards it */
    expect(await page.evaluate(() => globalThis.App._progress.gold),
      `${c.name}: the purse must read the cap exactly`)
      .toBe(await page.evaluate(() => globalThis.CONFIG.economy.purseCap));
  }
});

/* Everything read here is read off the layout rather than off the frame the
   animation happens to be on, because the message is up for about three seconds
   and every frame of it is different. Sampling the painted box was the whole
   trouble: the word is flung out to twice its size on its way off, so a rect
   measured in the last half second is wider than the screen and paper thrown at
   the start of the three seconds is on the floor by the end of them. Both were
   true readings of the wrong thing.

   `offsetWidth` and `scrollWidth` are the box the word was laid out in, which is
   what "does it fit" means and what a clamp() gone wrong would break. They do not
   move while the message is up, so it does not matter which frame catches them. */
test('the beta word goes off with a bang, and clears itself away', async ({ page }) => {
  /* Paper counted as it is thrown, not as it lies. Each bit removes itself when
     it lands, about a second and a half in, so the number on screen peaks and
     then falls back to nothing while the message is still up.

     Watched on the document rather than on the layer it lands in: this runs
     before the page is parsed, so neither #confetti nor documentElement exists
     to be handed to a watcher yet. */
  await page.addInitScript(() => {
    window.__paper = 0;
    new MutationObserver(ms => {
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.classList && n.classList.contains('conf')) window.__paper++;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await start(page, state('purseDry'));
  const word = await page.evaluate(() => globalThis.CONFIG.beta.word);
  const full = await page.evaluate(() => globalThis.CONFIG.economy.purseCap);

  await page.goto(`/?${word}`);
  /* Caught and read in the same frame, so the message cannot take itself away
     between being found and being measured. */
  const mid = await (await page.waitForFunction(() => {
    const el = document.getElementById('jabari');
    if (!el || el.hidden || !el.classList.contains('go')) return null;
    const w = el.querySelector('.jabariWord');
    return {
      says: w.textContent,
      shouts: el.querySelector('.jabariGold').textContent,
      /* it lands over everything without being able to eat a tap on its way to
         something else */
      pointers: getComputedStyle(el).pointerEvents,
      /* and it says it at a size worth saying it at, inside the screen */
      fontPx: parseFloat(getComputedStyle(w).fontSize),
      /* the box it was given is on the screen */
      tooWide: w.offsetWidth > innerWidth,
      /* and the letters are inside the box, rather than hanging out of it */
      clipped: w.scrollWidth > w.clientWidth
    };
  })).jsonValue();
  expect(mid.says.replace(/\s+/g, '')).toBe('JabariMode');
  expect(mid.shouts).toBe('+9,999,999');
  expect(mid.pointers).toBe('none');
  expect(mid.fontPx).toBeGreaterThan(30);
  expect(mid.tooWide, 'the word must fit the screen it is shouted on').toBe(false);
  expect(mid.clipped, 'the letters must fit the word').toBe(false);
  await expect.poll(() => page.evaluate(() => window.__paper),
    { message: 'the bang should throw paper' }).toBeGreaterThan(50);

  /* nothing to dismiss: it takes itself away and leaves the map alone */
  await page.waitForFunction(() => document.getElementById('jabari').hidden, null, { timeout: 8000 });
  await expect(page.locator('#mapGold')).toHaveText(String(full));
  await expect(page.locator('[data-level="15"]')).toBeEnabled();
});

/* The beta word hands out seven figures, and the purse is a number in a header
   that has a chapter name beside it. Nothing else in the game can produce one
   this long, so nothing else would catch it getting too wide. */
for (const [w, h] of [[375, 812], [380, 300], [320, 700]]) {
  test(`a seven figure purse still fits the headers at ${w}x${h}`, async ({ page }) => {
    await start(page, { unlocked: 15, gold: 9999999, seen: { 0: true, 1: true } });
    await page.setViewportSize({ width: w, height: h });
    const sideways = () => page.evaluate(() => {
      const de = document.documentElement;
      return de.scrollWidth - de.clientWidth;
    });
    await expect.poll(sideways, { message: 'the map header pushes the page sideways' })
      .toBeLessThanOrEqual(0);
    await openLevel(page, 15);
    expect(await sideways(), 'the game header pushes the page sideways').toBeLessThanOrEqual(0);
  });
}

/* a cleared board is free, so an empty purse must never stand in the way of one.
   There are two places it could: the medallion, and the card the medallion now
   opens. Both have to know the board costs nothing. */
test('an empty purse still opens a level already beaten', async ({ page }) => {
  await start(page, { unlocked: 15, gold: 0, stars: { 4: 3 }, seen: { 0: true, 1: true } });
  const node = page.locator('[data-level="4"]');
  await expect(node).toBeEnabled();
  await node.click();
  await expect(page.locator('#previewFee')).toHaveText('free');
  await expect(page.locator('#previewPlay'), 'the card refused a board it is not charging for')
    .toBeEnabled();
  await page.locator('#previewPlay').click();
  await page.waitForFunction(() => globalThis.App._state.level === 4);
});

test('a hint costs gold and marks both ends of the pour', async ({ page }) => {
  /* hints are the apothecary's, so this has to be played somewhere it has them */
  await start(page, { unlocked: 11, gold: 400, seen: { 0: true, 1: true } });
  await openLevel(page, 11);
  const before = await page.evaluate(() => globalThis.App._progress.gold);
  await page.locator('#hint').click();

  await expect(page.locator('#board .bottle.hintFrom')).toHaveCount(1);
  await expect(page.locator('#board .bottle.hintTo')).toHaveCount(1);
  const after = await page.evaluate(() => globalThis.App._progress.gold);
  expect(before - after).toBe(await page.evaluate(() => globalThis.CONFIG.economy.hint));

  /* the move it names has to be one the rules would actually allow */
  const legal = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('#board .bottle')];
    const from = bs.findIndex(b => b.classList.contains('hintFrom'));
    const to = bs.findIndex(b => b.classList.contains('hintTo'));
    return globalThis.Rules.canPour(globalThis.App._state.tubes, from, to);
  });
  expect(legal).toBe(true);
});

/* Seventeen silent refusals in one player's save, all of them the hint. The
   search comes back with nothing — a board with no way on from here, or a
   search that could not find one, and the game cannot tell those apart — and
   the button simply did nothing, while saying it costs 25. */
test('a hint that finds nothing says so, and charges nothing', async ({ page }) => {
  await start(page, { unlocked: 11, gold: 400, seen: { 0: true, 1: true } });
  await openLevel(page, 11);
  await page.evaluate(() => {
    globalThis.SolverClient.solve = (t, c, cb) => setTimeout(() => cb({ par: null, exact: false, first: null }), 10);
  });
  const before = await page.evaluate(() => globalThis.App._progress.gold);

  await page.locator('#hint').click();
  await expect(page.locator('#pourLabel')).toHaveText(/no way on/i);
  expect(await page.evaluate(() => globalThis.App._progress.gold),
    'a search that gives up owes the player nothing').toBe(before);
  await expect(page.locator('#board .bottle.hintFrom')).toHaveCount(0);
  /* and it says it rather than only recording it */
  expect(await page.evaluate(() => globalThis.App._progress.diag.refused.hint)).toBe(1);
});

/* A board the exact search cannot crack still has a way through it, and the
   fallback that finds one used to walk the whole line and then throw away the
   move it opened with. */
test('a hint from the fallback is shown, and is free because it is not the shortest', async ({ page }) => {
  await start(page, { unlocked: 11, gold: 400, seen: { 0: true, 1: true } });
  await openLevel(page, 11);
  await page.evaluate(() => {
    const real = globalThis.SolverClient.solve;
    /* the budget an exact search cannot finish in, so the worker falls back */
    globalThis.SolverClient.solve = (t, c, cb) => {
      globalThis.CONFIG.solver.nodeCap = 200;
      globalThis.CONFIG.solver.msCap = 5;
      return real(t, c, cb);
    };
  });
  const before = await page.evaluate(() => globalThis.App._progress.gold);

  await page.locator('#hint').click();
  await expect(page.locator('#board .bottle.hintFrom')).toHaveCount(1);
  await expect(page.locator('#board .bottle.hintTo')).toHaveCount(1);
  await expect(page.locator('#pourLabel')).toHaveText(/not the shortest/i);
  expect(await page.evaluate(() => globalThis.App._progress.gold),
    'an unproven move is not what the price is for').toBe(before);

  /* and it is still a move the rules would allow */
  expect(await page.evaluate(() => {
    const bs = [...document.querySelectorAll('#board .bottle')];
    const from = bs.findIndex(b => b.classList.contains('hintFrom'));
    const to = bs.findIndex(b => b.classList.contains('hintTo'));
    return globalThis.Rules.canPour(globalThis.App._state.tubes, from, to);
  })).toBe(true);
});

test('a vessel adds a bottle, and restarting takes it away', async ({ page }) => {
  /* the vessel is the distillery's */
  await start(page, { unlocked: 21, gold: 900, seen: { 0: true, 1: true, 2: true } });
  await openLevel(page, 21);
  const before = await page.evaluate(() => globalThis.App._state.tubes.length);
  await page.locator('#vessel').click();
  await expect.poll(() => page.evaluate(() => globalThis.App._state.tubes.length)).toBe(before + 1);
  /* two stars at most from here, whatever happens next. The dim ones are still
     stars in the text, so the count of dimmed ones is what says how many are
     left rather than the text itself. */
  await expect(page.locator('#statStars .dim')).toHaveCount(1);

  /* restart needs a move behind it before it will do anything */
  await page.locator('#board .glass').nth(0).click();
  await page.locator('#board .glass').nth(before).click();
  await settle(page);
  await page.locator('#restart').click();
  await expect.poll(() => page.evaluate(() => globalThis.App._state.tubes.length)).toBe(before);
  expect(await page.evaluate(() => globalThis.App._state.vesselUsed)).toBe(false);
});

test('going back to a cleared level is free, and pays nothing', async ({ page }) => {
  await start(page, { unlocked: 3, gold: 400, stars: { 1: 3 }, claimed: { 1: true } });
  /* The price used to live on a Play button in a footer. It lives on the
     medallion now, and a cleared level is free, so it carries no price at all. */
  await expect(page.locator('.node[data-level="1"] .buy')).toHaveCount(0);
  const before = await page.evaluate(() => globalThis.App._progress.gold);
  await page.locator('[data-level="1"]').click();
  await page.waitForFunction(() => globalThis.App._state.level === 1);
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(before);
});

test('a level not yet beaten still charges to deal', async ({ page }) => {
  await start(page, { unlocked: 3, gold: 400, stars: { 1: 3 } });
  const before = await page.evaluate(() => globalThis.App._progress.gold);
  await page.locator('[data-level="3"]').click();
  await page.waitForFunction(() => globalThis.App._state.level === 3);
  const fee = await page.evaluate(() => globalThis.CONFIG.economy.attempt);
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(before - fee);
});

test('the first chapter opens with one tool, not all of them', async ({ page }) => {
  await start(page, { unlocked: 1, gold: 400, seen: { 0: true } });
  await openLevel(page, 1);
  await expect(page.locator('#undo')).toBeVisible();
  await expect(page.locator('#hint')).toBeHidden();
  await expect(page.locator('#vessel')).toBeHidden();
});

test('later chapters hand over the rest', async ({ page }) => {
  await start(page, { unlocked: 25, gold: 900, seen: { 0: true, 1: true, 2: true } });
  await openLevel(page, 25);
  await expect(page.locator('#undo')).toBeVisible();
  await expect(page.locator('#hint')).toBeVisible();
  await expect(page.locator('#vessel')).toBeVisible();
});

test('a chapter introduces itself once', async ({ page }) => {
  await start(page, { unlocked: 11, gold: 900, seen: { 0: true } });
  await page.locator('[data-level="11"]').click();
  await expect(page.locator('#chapterVeil')).toHaveClass(/show/);
  await expect(page.locator('#chapterName')).toHaveText('The Apothecary');
  await expect(page.locator('#chapterGrant')).toContainText('Hints');
  await page.locator('#chapterGo').click();
  await expect(page.locator('#chapterVeil')).not.toHaveClass(/show/);

  /* back to the map and in again: it has been read */
  await page.locator('#toMap').click();
  await page.locator('[data-level="11"]').click();
  await expect(page.locator('#chapterVeil')).not.toHaveClass(/show/);
});

/* The press that opens this must not also close it, and the way back is put on
   during that very press. What keeps the two apart is that the way back is taken
   on the click: by the time the button's own handler runs, the click is already
   past the document, so the listener it adds there cannot be handed the press
   that added it. The assertions between the press and the tap are that claim —
   the board is grey and the panel is away, rather than back where it started.

   It used to be kept apart by a tick instead, and that tick was the whole flake:
   the tap below went in before the tick had come round, landed on nothing, and
   the panel never came back. About one full suite run in three at two workers. */
test('the board can be read after the run, and taps go back', async ({ page }) => {
  await start(page, { unlocked: 4, gold: 400, seen: { 0: true } });
  await openLevel(page, 4);
  await page.evaluate(() => document.getElementById('veil').classList.add('show'));
  await page.locator('#peek').click();
  await expect(page.locator('body')).toHaveClass(/peeking/);
  await expect(page.locator('#veil')).not.toHaveClass(/show/);
  /* the board takes no input while it is being read */
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('board')).pointerEvents))
    .toBe('none');
  /* and it says how to leave. The prompt is drawn by a rule rather than written
     into the page, so a class it no longer matches takes it away in silence. */
  expect(await page.evaluate(() => getComputedStyle(document.body, '::after').content),
    'nothing on screen says how to get the panel back').toContain('Tap to go back');
  /* anywhere at all, because while the board is being read a tap means put the
     panel back and nothing else. A raw click at a point on the screen rather
     than at an element, since every element there ignores pointers. */
  const box = page.viewportSize();
  await page.mouse.click(Math.round(box.width / 2), Math.round(box.height / 2));
  await expect(page.locator('#veil')).toHaveClass(/show/);
  await expect(page.locator('body')).not.toHaveClass(/peeking/);
});

/* The other way to press a button, and the one the way back could actually be
   handed its own opening press through: a key that both activates the button and
   is a keydown of its own. */
test('a key that opens the board to be read does not close it again', async ({ page }) => {
  await start(page, { unlocked: 4, gold: 400, seen: { 0: true } });
  await openLevel(page, 4);
  for (const key of ['Enter', 'Space']) {
    await page.evaluate(() => document.getElementById('veil').classList.add('show'));
    await page.locator('#peek').focus();
    await page.keyboard.press(key);
    await expect(page.locator('body'), `${key} opened the board and shut it again`)
      .toHaveClass(/peeking/);
    await expect(page.locator('#veil')).not.toHaveClass(/show/);
    /* and the next key is the way back, however this one was pressed */
    await page.keyboard.press('Escape');
    await expect(page.locator('#veil')).toHaveClass(/show/);
    await expect(page.locator('body')).not.toHaveClass(/peeking/);
  }
});
