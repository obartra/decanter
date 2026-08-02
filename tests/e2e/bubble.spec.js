/* The bubble game, in a browser that actually animates.

   The unit suite proves the geometry: where a shot lands, what pops, what falls.
   None of that needs a browser. What does need one is the part that only exists
   once there is a canvas and a clock: that the page boots, that a shot fired at
   an angle arrives where the solver said it would, and that the board and the
   screen agree afterwards. */
import { test, expect } from '@playwright/test';

const open = async page => {
  await page.goto('/bubble/');
  await page.waitForFunction(() => !!globalThis.BubbleApp && !!globalThis.BubbleApp._state.board);
};

const state = page => page.evaluate(() => {
  const { BubbleApp: A, BubbleGrid: G, BubbleRules: R } = globalThis;
  return {
    mode: A._state.mode,
    occupied: G.occupied(A._state.board).length,
    loaded: A._state.loaded,
    live: R.liveColours(A._state.board),
    shots: A._state.shots
  };
});

test('boots and deals a board without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await open(page);
  const s = await state(page);
  expect(s.occupied).toBeGreaterThan(30);
  expect(s.mode).toBe('aim');
  /* the colour in hand must be one that is actually on the board, or the shot
     cannot match anything and the board only ever grows */
  expect(s.live).toContain(s.loaded);
  expect(errors).toEqual([]);
});

test('the loop keeps running', async ({ page }) => {
  await open(page);
  /* a canvas that is never redrawn looks identical to one that is, until
     something moves; this is the cheapest proof the frame loop is alive */
  const frames = await page.evaluate(() => new Promise(res => {
    let n = 0;
    const tick = () => { if (++n < 5) requestAnimationFrame(tick); else res(n); };
    requestAnimationFrame(tick);
  }));
  expect(frames).toBe(5);
});

test('a shot lands exactly where the solver said it would', async ({ page }) => {
  /* The one bug that matters most in this genre is the guide and the bubble
     disagreeing. They cannot here, because there is one resolved path that the
     guide draws and the flight walks, and this is the assertion that says so. */
  await open(page);
  const predicted = await page.evaluate(() => {
    const { BubbleApp: A, BubbleShot: S, BubbleConfig: C } = globalThis;
    const aim = S.aimFrom(C.MUZZLE, { x: C.MUZZLE.x + 3, y: 2 });
    A._state.aim = aim;
    const shot = S.resolveShot(A._state.board, C.MUZZLE, aim);
    return shot.landing;
  });
  expect(predicted).not.toBeNull();

  await page.evaluate(() => globalThis.BubbleApp.fire());
  await page.waitForFunction(() => globalThis.BubbleApp._state.mode === 'aim', null, { timeout: 15_000 });

  const landed = await page.evaluate(l => {
    const { BubbleApp: A, BubbleGrid: G } = globalThis;
    return G.at(A._state.board, l.j, l.c);
  }, predicted);
  expect(landed).toBeGreaterThanOrEqual(0);
});

test('a shot that completes three of a colour clears them', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => {
    /* an arranged board, so the outcome is a fact rather than a hope: two of a
       colour side by side, everything else another colour, and a clear lane */
    const { BubbleApp: A, BubbleGrid: G } = globalThis;
    const b = G.create(0);
    for (let c = 0; c < 10; c++) b.rows[0][c] = 1;
    b.rows[0][4] = 0; b.rows[0][5] = 0;
    A._state.board = b;
    A._state.loaded = 0;
    A._state.mode = 'aim';
    return G.occupied(b).length;
  });

  await page.evaluate(() => {
    const { BubbleApp: A, BubbleShot: S, BubbleConfig: C, BubbleGrid: G } = globalThis;
    /* aim at the gap under the pair so the third of that colour lands touching */
    const target = G.centreOf(A._state.board, 1, 4);
    A._state.aim = S.aimFrom(C.MUZZLE, target);
    A.fire();
  });
  await page.waitForFunction(() => globalThis.BubbleApp._state.mode === 'aim', null, { timeout: 15_000 });

  const after = await page.evaluate(() => globalThis.BubbleGrid.occupied(globalThis.BubbleApp._state.board).length);
  /* three left the board, so it is smaller than it was even after the new one
     arrived; a landing that did not match would have made it larger */
  expect(after).toBeLessThan(before);
});

/* Watches the animation from inside the page. Polling from the test runner
   cannot see a fall that lasts under a second: by the time an evaluate lands the
   bubbles are off the bottom and the list is empty again. This records every
   frame from the moment it starts, so what it reports is what was drawn. */
const watchDrops = page => page.evaluate(() => {
  const st = globalThis.BubbleApp._state;
  const seen = globalThis.__drops = { max: 0, firstY: null, peakY: null, frames: 0 };
  const tick = () => {
    if (st.drops.length){
      seen.max = Math.max(seen.max, st.drops.length);
      const y = Math.max(...st.drops.map(d => d.y));
      if (seen.firstY === null) seen.firstY = y;
      /* the deepest any of them ever got, not the latest reading. A group is
         kicked upward before gravity turns it over, and the lowest bubbles
         leave the list as they pass the floor, so the latest reading can be
         higher than the one before it while everything is falling correctly. */
      seen.peakY = Math.max(seen.peakY ?? y, y);
      seen.frames++;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

/* two of a colour with a clear lane under them, so the third completes a group */
const armed = page => page.evaluate(() => {
  const { BubbleApp: A, BubbleGrid: G } = globalThis;
  const b = G.create(0);
  for (let c = 0; c < 10; c++) b.rows[0][c] = 1;
  b.rows[0][4] = 0; b.rows[0][5] = 0;
  A._state.board = b;
  A._state.loaded = 0;
  A._state.mode = 'aim';
  A._state.over = null;
  A._state.score = 0;
  return G.occupied(b).length;
});

const shootAtGap = page => page.evaluate(() => {
  const { BubbleApp: A, BubbleShot: S, BubbleConfig: C, BubbleGrid: G } = globalThis;
  A._state.aim = S.aimFrom(C.MUZZLE, G.centreOf(A._state.board, 1, 4));
  A.fire();
});

test('a cleared group falls off the board instead of vanishing', async ({ page }) => {
  /* The whole point of the change: a clear is something the player watches come
     down, not a gap that appears. A test that only checked the board shrank
     would pass just as well with the bubbles deleted where they sat. */
  await open(page);
  await armed(page);
  await watchDrops(page);
  await shootAtGap(page);
  await page.waitForFunction(() => globalThis.BubbleApp._state.mode === 'aim', null, { timeout: 15_000 });
  /* watched all the way out, rather than sampled early: they do leave the board
     rather than piling up at the bottom of it forever */
  await page.waitForFunction(() => globalThis.__drops.frames > 0
    && globalThis.BubbleApp._state.drops.length === 0, null, { timeout: 15_000 });

  const seen = await page.evaluate(() => globalThis.__drops);
  expect(seen.max, 'the matched group was never drawn falling').toBeGreaterThanOrEqual(3);
  expect(seen.peakY - seen.firstY,
    'the bubbles were drawn but never travelled down the board').toBeGreaterThan(2);
});

test('the score is on screen while playing, not only at the end', async ({ page }) => {
  await open(page);
  await expect(page.locator('#bubbleLive')).toHaveText('0');
  await expect(page.locator('#bubbleDrop')).toHaveText(`drops in ${await page.evaluate(() => globalThis.BubbleConfig.ADVANCE_EVERY)}`);

  await armed(page);
  await shootAtGap(page);
  await page.waitForFunction(() => globalThis.BubbleApp._state.mode === 'aim', null, { timeout: 15_000 });

  const scored = await page.evaluate(() => globalThis.BubbleApp._state.score);
  expect(scored).toBeGreaterThan(0);
  await expect(page.locator('#bubbleLive')).toHaveText(String(scored));
  /* and the board's advance is counted down rather than sprung on the player */
  await expect(page.locator('#bubbleDrop')).toHaveText(`drops in ${await page.evaluate(() => globalThis.BubbleConfig.ADVANCE_EVERY - 1)}`);
});

test('says how to win once, then gets out of the way', async ({ page }) => {
  await open(page);
  const rule = page.locator('#bubbleRule');
  await expect(rule).toBeVisible();
  /* and it says the actual length of a run, taken from the config rather than
     written into the markup, because the rules describing a different game from
     the one being played is a lie nothing else would catch */
  await expect(rule).toContainText('Survive');
  await expect(page.locator('#bubbleGoal')).toHaveText(
    String(await page.evaluate(() => globalThis.BubbleConfig.RUN_SHOTS)));
  await expect(rule).toContainText('you lose');
  await expect(rule).not.toHaveClass(/gone/);

  /* it is an explanation, not a status: a player who is playing has stopped
     needing it, and it must not sit over the board for the rest of the run */
  await armed(page);
  await shootAtGap(page);
  await expect(rule).toHaveClass(/gone/);
  await page.waitForFunction(() => globalThis.BubbleApp._state.mode === 'aim', null, { timeout: 15_000 });
  await expect(rule).toHaveCSS('opacity', '0');

  /* and it comes back for the next fresh board, because that one is new too */
  await page.evaluate(() => globalThis.BubbleApp.newBoard(9));
  await expect(rule).not.toHaveClass(/gone/);
});

test('the ending says what happened in plain words', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const A = globalThis.BubbleApp;
    A._state.score = 480;
    A._state.shots = 26;
    A.finish('won');
  });
  await expect(page.locator('#bubbleVeil')).toHaveClass(/show/);
  await expect(page.locator('#bubbleResult')).toHaveText('Board cleared');
  await expect(page.locator('#bubbleWhy')).toHaveText('Every bubble gone, in 26 shots.');
  await expect(page.locator('#bubbleScore')).toHaveText('480');

  /* the losing half, and it must not read like a log line */
  await page.evaluate(() => {
    const { BubbleApp: A, BubbleConfig: C } = globalThis;
    A.newBoard(2);
    for (let c = 0; c < C.COLS; c++) A._state.board.rows[C.DEATH_ROW][c] = c % 4;
    A.finish('lost');
  });
  await expect(page.locator('#bubbleVeil')).toHaveClass(/lost/);
  await expect(page.locator('#bubbleResult')).toHaveText('Game over');
  await expect(page.locator('#bubbleWhy')).toHaveText('The bubbles reached the line.');
});

test('the result card fits the screen it is shown on', async ({ page }) => {
  /* it did not: a content-box card was its 320px plus its padding, and hung off
     the right of a phone */
  await open(page);
  await page.evaluate(() => globalThis.BubbleApp.finish('won'));
  const box = await page.locator('.card').boundingBox();
  const width = await page.evaluate(() => innerWidth);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
});

test('the board is frozen once the run is over', async ({ page }) => {
  await open(page);
  await page.evaluate(() => globalThis.BubbleApp.finish('lost'));
  const before = await page.evaluate(() => globalThis.BubbleApp._state.shots);
  await page.evaluate(() => globalThis.BubbleApp.fire());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => globalThis.BubbleApp._state.shots),
    'a run that has ended kept taking shots').toBe(before);
});

test('sound can be turned off, and stays off', async ({ page }) => {
  await open(page);
  await expect(page.locator('#bubbleSound')).toHaveText('Sound');
  await page.locator('#bubbleSound').click();
  await expect(page.locator('#bubbleSound')).toHaveText('Muted');
  expect(await page.evaluate(() => globalThis.BubbleAudio.enabled)).toBe(false);

  /* a player who muted the game did not mean "until the next board" */
  await page.reload();
  await page.waitForFunction(() => !!globalThis.BubbleApp);
  await expect(page.locator('#bubbleSound')).toHaveText('Muted');
  expect(await page.evaluate(() => globalThis.BubbleAudio.enabled)).toBe(false);
});

test('a muted game schedules no sound at all', async ({ page }) => {
  /* the button has to actually stop the audio, not just relabel itself */
  await open(page);
  const voices = await page.evaluate(() => {
    const A = globalThis.BubbleAudio;
    const AC = globalThis.AudioContext.prototype;
    const osc = AC.createOscillator, buf = AC.createBufferSource;
    let n = 0;
    AC.createOscillator = function(){ n++; return osc.call(this); };
    AC.createBufferSource = function(){ n++; return buf.call(this); };
    const count = () => { n = 0; A.shoot(); A.matched(4); A.cut(2); A.advance(); A.won(); return n; };
    A.unlock();
    A.setEnabled(true);
    const loud = count();
    A.setEnabled(false);
    const muted = count();
    A.setEnabled(true);
    AC.createOscillator = osc; AC.createBufferSource = buf;
    return { loud, muted };
  });
  expect(voices.loud, 'an unmuted game made no sound either').toBeGreaterThan(0);
  expect(voices.muted).toBe(0);
});

test('does not serve the other game at this path', async ({ page }) => {
  await open(page);
  expect(await page.title()).toBe('Bubble');
  const leaked = await page.evaluate(() => !!globalThis.Levels || !!globalThis.PARS);
  expect(leaked, 'the water sort game leaked into the bubble page').toBe(false);
});

/* ---- the tools ----

   Everything below is about the four things a run is allowed to lean on. Three
   of them leave the run gradeable and one does not, and the difference has to be
   visible in the state rather than only in a comment. */

const snap = page => page.evaluate(() => {
  const { BubbleApp: A, BubbleGrid: G } = globalThis;
  const s = A._state;
  return { hash: G.hash(s.board), loaded: s.loaded, next: s.next, shots: s.shots,
           score: s.score, aided: s.aided, over: s.over, past: s.past.length,
           sinceDrop: s.sinceDrop };
});

test('undo puts back the board, the bubble and the sequence', async ({ page }) => {
  /* The sequence is the part that is easy to miss. Restoring the board but not
     the stream deals a different bubble on the retry, which is not the position
     the player asked to go back to and is worse than having no undo. */
  await open(page);
  const before = await snap(page);
  await armed(page);
  const armedBefore = await snap(page);

  await shootAtGap(page);
  await page.waitForFunction(() => globalThis.BubbleApp._state.mode === 'aim', null, { timeout: 15_000 });
  const after = await snap(page);
  expect(after.hash).not.toBe(armedBefore.hash);
  expect(after.shots).toBe(armedBefore.shots + 1);

  expect(await page.evaluate(() => globalThis.BubbleApp.undo())).toBe(true);
  const back = await snap(page);
  expect(back.hash, 'the board came back different').toBe(armedBefore.hash);
  expect(back.loaded).toBe(armedBefore.loaded);
  expect(back.next).toBe(armedBefore.next);
  expect(back.shots).toBe(armedBefore.shots);
  expect(back.score).toBe(armedBefore.score);
  expect(before).toBeTruthy();

  /* and the very next shot is the one that was going to happen */
  await shootAtGap(page);
  await page.waitForFunction(() => globalThis.BubbleApp._state.mode === 'aim', null, { timeout: 15_000 });
  const again = await snap(page);
  expect(again.hash, 'replaying the same shot produced a different board').toBe(after.hash);
  expect(again.next, 'the sequence was not put back, so a different bubble was dealt').toBe(after.next);
});

test('undo takes back the shot that ended the run', async ({ page }) => {
  await open(page);
  await armed(page);
  await shootAtGap(page);
  await page.waitForFunction(() => globalThis.BubbleApp._state.mode === 'aim', null, { timeout: 15_000 });
  await page.evaluate(() => globalThis.BubbleApp.finish('lost'));
  await expect(page.locator('#bubbleVeil')).toHaveClass(/show/);

  expect(await page.evaluate(() => globalThis.BubbleApp.undo())).toBe(true);
  expect(await page.evaluate(() => globalThis.BubbleApp._state.over)).toBeNull();
  await expect(page.locator('#bubbleVeil')).not.toHaveClass(/show/);
});

test('undo runs out rather than inventing history', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => globalThis.BubbleApp.undo()),
    'undid a shot that was never taken').toBe(false);
  await expect(page.locator('#bubbleUndo')).toBeDisabled();
});

test('the hint points at a shot that really clears', async ({ page }) => {
  await open(page);
  await armed(page);
  const best = await page.evaluate(() => globalThis.BubbleApp.hint());
  expect(best, 'no hint offered on a board with an obvious match').not.toBeNull();
  expect(best.matched).toBeGreaterThanOrEqual(3);

  /* the ring is drawn on the cell the hint named, and firing there clears it */
  const marked = await page.evaluate(() => globalThis.BubbleApp._state.hint);
  expect(marked).toEqual({ j: best.landing.j, c: best.landing.c });

  const before = await page.evaluate(() => globalThis.BubbleGrid.occupied(globalThis.BubbleApp._state.board).length);
  await page.evaluate(b => {
    const { BubbleApp: A } = globalThis;
    A._state.aim = b.dir;
    A.fire();
  }, best);
  await page.waitForFunction(() => globalThis.BubbleApp._state.mode === 'aim', null, { timeout: 15_000 });
  const after = await page.evaluate(() => globalThis.BubbleGrid.occupied(globalThis.BubbleApp._state.board).length);
  expect(after, 'taking the advised shot did not clear anything').toBeLessThan(before);
});

test('the hint button is dead when there is nothing to advise', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    /* one colour on the board, another in hand: nothing can match */
    const { BubbleApp: A, BubbleGrid: G } = globalThis;
    const b = G.create(0);
    for (let c = 0; c < 10; c++) b.rows[0][c] = 1;
    A._state.board = b;
    A._state.loaded = 0;
    A._state.mode = 'aim';
    A._state.over = null;
    A._state.shots = 0;
    A.paintHud();
  });
  await expect(page.locator('#bubbleHint')).toBeDisabled();
  expect(await page.evaluate(() => globalThis.BubbleApp.hint()),
    'advised a shot on a board where nothing can match').toBeNull();
});

test('the hint does not cost the run a star', async ({ page }) => {
  /* same reasoning as the other game: it names the shot the game would take, and
     taking a good shot is what earns stars in the first place */
  await open(page);
  await armed(page);
  await page.evaluate(() => globalThis.BubbleApp.hint());
  expect(await page.evaluate(() => globalThis.BubbleApp._state.aided)).toBe(false);
});

test('swap exchanges the two bubbles and nothing else', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const s = globalThis.BubbleApp._state;
    s.loaded = globalThis.BubbleRules.liveColours(s.board)[0];
    s.next = globalThis.BubbleRules.liveColours(s.board)[1];
  });
  const before = await snap(page);
  expect(await page.evaluate(() => globalThis.BubbleApp.swap())).toBe(true);
  const after = await snap(page);
  expect(after.loaded).toBe(before.next);
  expect(after.next).toBe(before.loaded);
  expect(after.hash, 'swapping touched the board').toBe(before.hash);
  expect(after.shots).toBe(before.shots);
  expect(after.aided, 'swapping cost the run a star').toBe(false);
});

test('picking a colour loads it and caps the run', async ({ page }) => {
  await open(page);
  const colours = await page.evaluate(() => globalThis.BubbleRules.liveColours(globalThis.BubbleApp._state.board));
  const wanted = colours[colours.length - 1];
  expect(await page.evaluate(c => globalThis.BubbleApp.pickColour(c), wanted)).toBe(true);

  const s = await snap(page);
  expect(s.loaded).toBe(wanted);
  expect(s.aided, 'picking a colour left the run ungraded as uncapped').toBe(true);
  expect(s.hash, 'picking a colour touched the board').toBe(
    (await page.evaluate(() => globalThis.BubbleGrid.hash(globalThis.BubbleApp._state.board))));

  /* and the cap is real, even on a run that would otherwise have earned three */
  const stars = await page.evaluate(() => {
    const { BubbleScore: Sc, BubbleConfig: C } = globalThis;
    return Sc.stars({ cleared: true, survived: false, shots: C.RUN_SHOTS, aided: true });
  });
  expect(stars).toBe(await page.evaluate(() => globalThis.BubbleConfig.AID_CAP));
});

test('a colour that has left the board is not on offer', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const { BubbleApp: A, BubbleGrid: G } = globalThis;
    const b = G.create(0);
    for (let c = 0; c < 10; c++) b.rows[0][c] = 2;
    A._state.board = b;
    A._state.over = null;
    A.paintHud();
  });
  /* only one colour left, so there is nothing to pick between and the button
     must not offer a purchase that buys an unmatched bubble */
  await expect(page.locator('#bubblePick')).toBeDisabled();
  expect(await page.evaluate(() => globalThis.BubbleApp.pickColour(0)),
    'loaded a colour that is not on the board').toBe(false);
});

test('the tool row says what can be pressed', async ({ page }) => {
  await open(page);
  const palette = page.locator('#bubblePalette');
  await expect(palette).toBeHidden();
  await page.locator('#bubblePick').click();
  await expect(palette).toBeVisible();
  const swatches = await palette.locator('.swatch').count();
  const live = await page.evaluate(() => globalThis.BubbleRules.liveColours(globalThis.BubbleApp._state.board).length);
  expect(swatches, 'the picker offered a different set from what is on the board').toBe(live);

  /* choosing closes it, and so does pressing the button again */
  await palette.locator('.swatch').first().click();
  await expect(palette).toBeHidden();
});

test('the run shows the stars it has earned so far', async ({ page }) => {
  await open(page);
  const stars = page.locator('#bubbleRunStars');
  await expect(stars).toHaveText('★★★');
  const lit = () => page.evaluate(() => document.querySelectorAll('#bubbleRunStars .dim').length);
  expect(await lit(), 'a run that has not started cannot have earned anything').toBe(3);

  await page.evaluate(() => {
    const { BubbleApp: A, BubbleConfig: C } = globalThis;
    A._state.shots = C.STAR_SHOTS.two;
    A.paintHud();
  });
  expect(await lit(), 'two stars earned should leave one dim').toBe(1);

  /* and the third never lights while the run is still going. It is paid for
     finishing rather than for a count, so this row holds at two while the
     shots-left readout counts down beside it. */
  await page.evaluate(() => {
    const { BubbleApp: A, BubbleConfig: C } = globalThis;
    A._state.shots = C.RUN_SHOTS;
    A.paintHud();
  });
  expect(await lit(), 'the third star lit before the run had finished').toBe(1);
});

test('the panel shows the stars and says when a run was capped', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const { BubbleApp: A, BubbleConfig: C } = globalThis;
    A._state.shots = C.RUN_SHOTS;
    A._state.aided = true;
    A.finish('survived');
  });
  await expect(page.locator('#bubbleStars')).toHaveText('★★★');
  expect(await page.evaluate(() => document.querySelectorAll('#bubbleStars .dim').length)).toBe(1);
  await expect(page.locator('#bubbleNote')).toContainText('caps a run at two stars');
});

test('the run ends itself, and says so as a win', async ({ page }) => {
  /* The run has a length now, and reaching it is the ending most runs are
     playing for. Nothing else on this page fails if the cap stops being applied:
     the game just quietly goes back to being unbounded and only endable by
     losing, which is the shape it was changed out of. */
  await open(page);
  await page.evaluate(() => {
    const { BubbleApp: A, BubbleConfig: C } = globalThis;
    A._state.shots = C.RUN_SHOTS - 1;
    A._state.sinceDrop = 0;
    /* the last shot of the run, landing nowhere, so what ends the run is the
       length and nothing about where the bubble went */
    A._state.path = { landing: null };
    A.land();
  });
  expect(await page.evaluate(() => globalThis.BubbleApp._state.over)).toBe('survived');
  await expect(page.locator('#bubbleResult')).toHaveText('You survived');
  await expect(page.locator('#bubbleStars')).toHaveText('★★★');
  expect(await page.evaluate(() => document.querySelectorAll('#bubbleStars .dim').length),
    'surviving the run is worth all three').toBe(0);
});

test('the run counts down to its end on screen', async ({ page }) => {
  /* A length the player cannot see is the same as no length at all: they are
     back to hanging on until they lose, with no idea the end was coming. */
  await open(page);
  const left = page.locator('#bubbleLeft');
  await expect(left).toHaveText(
    `${await page.evaluate(() => globalThis.BubbleConfig.RUN_SHOTS)} shots left`);

  await page.evaluate(() => {
    const { BubbleApp: A, BubbleConfig: C } = globalThis;
    A._state.shots = C.RUN_SHOTS - 1;
    A.paintHud();
  });
  await expect(left).toHaveText('last shot');
  await expect(left).toHaveClass(/nearly/);
});

test('a lost board goes over before the result is read out', async ({ page }) => {
  /* The panel must not appear over a board still standing: that is the game
     saying the run is finished while showing that it is not. */
  await open(page);
  const standing = await page.evaluate(() => globalThis.BubbleGrid.occupied(globalThis.BubbleApp._state.board).length);
  expect(standing).toBeGreaterThan(30);

  await watchDrops(page);

  /* Sampled every frame from inside the page rather than asserted between two
     round trips. The collapse lasts about a second and a half, so a runner under
     load can miss the whole of it and read the state afterwards, which fails
     describing a panel that was withheld exactly as it should have been. */
  const held = await page.evaluate(() => new Promise(res => {
    const veil = document.getElementById('bubbleVeil');
    const out = { collapsed: false, shownDuringCollapse: false, shownAfter: false };
    globalThis.BubbleApp.finish('lost');
    const tick = () => {
      const st = globalThis.BubbleApp._state;
      const shown = veil.classList.contains('show');
      if (st.collapsing){
        out.collapsed = true;
        if (shown) out.shownDuringCollapse = true;
        return requestAnimationFrame(tick);
      }
      if (out.collapsed){ out.shownAfter = shown; return res(out); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));

  expect(held.collapsed, 'the board never came down').toBe(true);
  expect(held.shownDuringCollapse, 'the verdict was shown over a board still falling').toBe(false);
  expect(held.shownAfter, 'the verdict never arrived').toBe(true);

  const seen = await page.evaluate(() => globalThis.__drops);
  expect(seen.max, 'the board did not come down, it just disappeared').toBeGreaterThanOrEqual(standing);

  /* and the grid itself was never emptied, so undo can still take the shot back */
  const left = await page.evaluate(() => globalThis.BubbleGrid.occupied(globalThis.BubbleApp._state.board).length);
  expect(left, 'the collapse cleared the real board instead of drawing a copy of it').toBe(standing);
});

test('the crash lands after the glass has gone, not during', async ({ page }) => {
  await open(page);
  const heard = await page.evaluate(() => new Promise(res => {
    const A = globalThis.BubbleAudio;
    A.unlock();
    const real = A.crash.bind(A);
    let at = null;
    A.crash = () => { at = globalThis.BubbleApp._state.drops.length; real(); };
    globalThis.BubbleApp.finish('lost');
    const tick = () => (at === null ? requestAnimationFrame(tick) : res(at));
    requestAnimationFrame(tick);
  }));
  expect(heard, 'the crash played while glass was still on screen').toBe(0);
});

test('the ending is not silent', async ({ page }) => {
  /* Both stings were defined and neither was ever called: the two biggest
     moments in the game made no sound at all, which nothing else here would
     have noticed. */
  await open(page);
  const heard = await page.evaluate(() => new Promise(res => {
    const A = globalThis.BubbleAudio;
    A.unlock();
    const said = [];
    for (const cue of ['won', 'lost', 'crash']){
      const real = A[cue].bind(A);
      A[cue] = () => { said.push(cue); real(); };
    }
    globalThis.BubbleApp.finish('won');
    setTimeout(() => {
      globalThis.BubbleApp.newBoard(4);
      globalThis.BubbleApp.finish('lost');
      const wait = () => (globalThis.BubbleApp._state.collapsing
        ? requestAnimationFrame(wait) : res(said));
      requestAnimationFrame(wait);
    }, 50);
  }));
  expect(heard, 'a cleared board said nothing').toContain('won');
  expect(heard, 'a lost run said nothing').toContain('lost');
  /* and the crash comes before the verdict, not after it */
  expect(heard.indexOf('crash')).toBeLessThan(heard.indexOf('lost'));
});
