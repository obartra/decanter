/* The map, in a browser.

   `tests/map.test.mjs` owns the geometry, which is numbers and needs no page.
   What needs one is everything here: what a medallion actually says, whether the
   road stops where it should, and whether the way back appears when there is
   somewhere to go back to. */
import { test, expect } from '@playwright/test';
import { start, openLevel } from './helpers.js';

/* far enough in that the map is several screens tall and the frontier is buyable */
const deep = { unlocked: 18, gold: 400, seen: { 0: true, 1: true },
               stars: Object.fromEntries([...Array(17)].map((_, i) => [i + 1, 3])) };

const scroller = page => page.locator('#mapScroll');

test('a medallion never puts a price where the level number goes', async ({ page }) => {
  /* The confirm used to replace the level number with the cost, in the same
     slot and the same face. Level 19 armed read "10", which is both a plausible
     price and a real level two rows down: the wrong reading was the one that
     matched every other medallion on the map. */
  await start(page, deep);
  const buyable = page.locator('.node.buyable');
  await expect(buyable).toHaveCount(1);
  const level = await buyable.getAttribute('data-level');

  await buyable.click();
  const armed = page.locator('.node.armed');
  await expect(armed).toHaveCount(1);

  await expect(armed.locator('.num'), 'the center must be the level being opened')
    .toHaveText(level);
  const label = await armed.locator('.buy').textContent();
  expect(label, 'a number that is money has to carry the diamond').toContain('◆');
  await expect(armed).toHaveAttribute('aria-label', new RegExp(`level ${level}`, 'i'));
});

test('every price on the map carries the diamond', async ({ page }) => {
  /* the rule that makes the above impossible to reintroduce: prices are marked,
     bare numbers are levels */
  await start(page, deep);
  const bare = await page.evaluate(() => {
    const bad = [];
    for (const n of document.querySelectorAll('.node')){
      const num = n.querySelector('.num');
      const buy = n.querySelector('.buy');
      if (num && /^\d+$/.test(num.textContent) && num.textContent !== n.dataset.level){
        bad.push(`node ${n.dataset.level} center says ${num.textContent}`);
      }
      if (buy && /\d/.test(buy.textContent) && !buy.textContent.includes('◆')){
        bad.push(`node ${n.dataset.level} label "${buy.textContent}" has a number and no diamond`);
      }
    }
    return bad;
  });
  expect(bare).toEqual([]);
});

test('the road runs out of sight rather than stopping', async ({ page }) => {
  /* The doc promises ghost points "so the road and the trail have somewhere to
     fade out to rather than stopping at the last node". The stones faded; the
     earth under them ended in a rounded cap, because the erase was a fraction of
     the whole map height and the map is several screens tall. Measured off the
     canvas, not eyeballed. */
  await start(page, deep);
  const alpha = await page.evaluate(() => {
    const road = document.querySelector('.mapRoad');
    const g = road.getContext('2d');
    const dpr = road.width / parseFloat(road.style.width);
    /* the top strip of the canvas is where the road physically terminates */
    const band = g.getImageData(0, 0, road.width, Math.round(40 * dpr));
    let peak = 0;
    for (let i = 3; i < band.data.length; i += 4) peak = Math.max(peak, band.data[i]);
    return peak / 255;
  });
  expect(alpha, 'the far end of the road is still painted, so it reads as cut off')
    .toBeLessThan(0.06);
});

test('the way back appears only when there is somewhere to go back to', async ({ page }) => {
  await start(page, deep);
  const jump = page.locator('#mapJump');

  /* the map opens scrolled to your level, so there is nothing to return to */
  await expect(jump).toBeHidden();

  await scroller(page).evaluate(el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
  await expect(jump, 'scrolled away from your level and offered no way back').toBeVisible();
  await expect(page.locator('#mapJumpLevel')).toHaveText('18');

  await jump.click();
  await expect(jump).toBeHidden();
  /* and it really went back: the level is on screen again */
  await expect.poll(() => page.evaluate(() => globalThis.MapView.currentIsVisible())).toBe(true);
});

test('the map keeps the whole screen: no footer of controls', async ({ page }) => {
  /* Play dealt `unlocked`, which is exactly what tapping the current medallion
     does, and the medallion already shows the price. What Play did that the
     medallion could not was work while scrolled away, and that is now the way
     back. The row it lived in cost the map a strip of its height on every
     phone. */
  await start(page, deep);
  await expect(page.locator('#mapPlay')).toHaveCount(0);
  await expect(page.locator('#mapView .controls')).toHaveCount(0);

  const gap = await page.evaluate(() => {
    const sc = document.getElementById('mapScroll').getBoundingClientRect();
    return Math.round(innerHeight - sc.bottom);
  });
  expect(gap, 'something is still holding a strip below the map').toBeLessThan(24);
});

test('tapping the current medallion deals the board, as Play used to', async ({ page }) => {
  await start(page, deep);
  const before = await page.evaluate(() => globalThis.App._progress.gold);
  await page.locator('.node.current').click();
  await page.waitForFunction(() => globalThis.App._state.level === 18);
  const fee = await page.evaluate(() => globalThis.CONFIG.economy.attempt);
  expect(await page.evaluate(() => globalThis.App._progress.gold)).toBe(before - fee);
});

test('the header controls are drawn, not typed, and still say what they are', async ({ page }) => {
  /* An emoji speaker arrives as whatever the platform has, which was a gray
     plastic blob in a gold header. These are paths in currentColor. A glyph with
     no words still has to answer a screen reader. */
  await start(page, deep);
  const gear = page.locator('#mapView .js-settings.icon');
  await expect(gear).toHaveAttribute('aria-label', /settings/i);
  /* and the thing it opens says what each row is, which an icon could not: no
     glyph means "hatch the liquids so they can be told apart without color" */
  await gear.click();
  await expect(page.locator('#setSound')).toContainText('Sound');
  await expect(page.locator('#setCb')).toContainText('Color blind');
  const sound = page.locator('#setSound');

  /* Read first rather than assumed: the suite seeds a muted save so the browser
     stays silent, so which way this starts is the harness's business, not this
     test's. What has to be true is that pressing it flips both the glyph's
     label and the audio itself, together. */
  const was = await page.evaluate(() => globalThis.Sound.enabled);
  await sound.click();
  /* A row says its state in words and in aria-pressed, which an icon could only
     do by changing shape. Both have to move, and the sound with them. */
  await expect(sound).toHaveAttribute('aria-pressed', was ? 'false' : 'true');
  await expect(sound.locator('b')).toHaveText(was ? /off/i : /on/i);
  expect(await page.evaluate(() => globalThis.Sound.enabled),
    'the row moved but the sound did not').toBe(!was);

  /* the draught keeps its words, because it carries a number */
  await expect(page.locator('#daily')).toContainText('Daily');
  await expect(page.locator('#dailyCost')).toHaveText(/\+?\d|soon|\dm|\dh/);
});

test('the settings card holds both settings and remembers them', async ({ page }) => {
  /* Both live in the save and both are read at boot, so the thing worth checking
     is the round trip rather than the click: a setting that toggles and does not
     come back is the same as no setting. */
  await start(page, { unlocked: 4, gold: 400, sound: false, cb: false });
  await page.locator('#mapView .js-settings').click();
  await expect(page.locator('#setVeil')).toHaveClass(/show/);

  await page.locator('#setCb').click();
  expect(await page.evaluate(() => document.body.classList.contains('cb'))).toBe(true);
  await expect(page.locator('#setCb')).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await page.waitForFunction(() => globalThis.App && globalThis.App._progress);
  expect(await page.evaluate(() => document.body.classList.contains('cb')),
    'the mode was forgotten across a reload').toBe(true);
  expect(await page.evaluate(() => globalThis.App._progress.colorblind)).toBe(true);
});

test('the card gets out of the way the ways every other one does', async ({ page }) => {
  await start(page, { unlocked: 4, gold: 400 });
  await page.locator('#mapView .js-settings').click();
  await expect(page.locator('#setVeil')).toHaveClass(/show/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#setVeil')).not.toHaveClass(/show/);

  await page.locator('#mapView .js-settings').click();
  await page.locator('#setClose').click();
  await expect(page.locator('#setVeil')).not.toHaveClass(/show/);
});

test('the hatch reaches the bottles and not only the body', async ({ page }) => {
  /* The class on the body is the switch; what matters is that a band actually
     paints something because of it. The fluid canvas is the primary path and
     cannot be asked this way, so this covers the DOM one. */
  await start(page, { unlocked: 4, gold: 400, cb: true });
  await openLevel(page, 1);
  const painted = await page.evaluate(() => {
    const band = document.querySelector('#board .band');
    if (!band) return 'no band';
    return getComputedStyle(band).backgroundImage;
  });
  expect(painted).not.toBe('none');
  expect(painted).toContain('gradient');
});
