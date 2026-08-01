import { describe, it, assert, equal, read, root } from './helpers.mjs';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(root, 'dist');
const has = f => existsSync(join(dist, f));
const text = f => readFileSync(join(dist, f), 'utf8');

describe('build output', () => {
  it('produces every file the app needs', () => {
    for (const f of ['index.html', 'sw.js', 'manifest.webmanifest',
                     'decanter-standalone.html', 'fonts/cinzel.woff2',
                     'fonts/alegreyasans.woff2', 'fonts/alegreyasans-bold.woff2',
                     'icons/icon-192.png',
                     'icons/icon-512.png', 'icons/maskable-512.png']){
      assert(has(f), `dist/${f} is missing, run npm run build`);
    }
  });
  it('makes no network requests, so it can run fully offline', () => {
    for (const f of ['index.html', 'decanter-standalone.html']){
      const html = text(f);
      const external = [...html.matchAll(/(?:src|href)=["']?(https?:\/\/[^"'>) ]+)/g)].map(m => m[1]);
      equal(external, [], `dist/${f} still reaches out to ${external.join(', ')}`);
    }
  });
  it('leaves no unfilled template slots', () => {
    for (const f of ['index.html', 'decanter-standalone.html']){
      const html = text(f);
      for (const slot of ['<!--CSS-->', '<!--JS-->', '<!--SOLVER-->', '<!--FONTS-->', '<!--BUILD-->', '<!--PWAHEAD-->']){
        assert(!html.includes(slot), `dist/${f} still contains ${slot}`);
      }
    }
  });
  it('inlines every source module in order', () => {
    const html = text('index.html');
    for (const f of readdirSync(join(root, 'src/js'))){
      assert(html.includes(`/* ---- ${f} ---- */`), `${f} was left out of the bundle`);
    }
    assert(html.indexOf('/* ---- 20-rules.js ---- */') < html.indexOf('/* ---- 90-app.js ---- */'),
      'modules must be inlined in dependency order');
  });
  it('carries a working copy of the solver', () => {
    const html = text('index.html');
    const m = html.match(/<script id="solverSrc"[^>]*>([\s\S]*?)<\/script>/);
    assert(m, 'the solver script tag is missing');
    const stub = {};
    new Function('self', m[1])(stub);
    let out;
    stub.postMessage = x => { out = x; };
    stub.onmessage({ data: { id: 1, tubes: [[0,1,0,1],[1,0,1,0],[]], cap: 4, colors: 2, nodeCap: 400000, msCap: 5000 } });
    equal(out.par, 7, 'the embedded solver gives the wrong answer');
    assert(out.exact, 'the embedded solver should be exact here');
  });
  it('bundles javascript that actually parses', () => {
    const html = text('index.html');
    const scripts = [...html.matchAll(/<script(?![^>]*id="solverSrc")[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert(scripts.length >= 1, 'no bundle found');
    for (const src of scripts){
      if (!src.trim()) continue;
      new Function(src);   // throws on a syntax error
    }
  });
  it('ships a valid manifest', () => {
    const m = JSON.parse(text('manifest.webmanifest'));
    equal(m.display, 'standalone');
    assert(m.start_url.startsWith('.'), 'paths must be relative so a subdirectory works');
    assert(m.icons.some(i => i.purpose === 'maskable'), 'an adaptive icon is needed on Android');
    assert(m.icons.some(i => i.sizes === '512x512'), 'a 512px icon is needed to install');
    for (const i of m.icons) assert(has(i.src.replace('./', '')), `${i.src} is listed but missing`);
  });
  it('precaches exactly what was built', () => {
    const sw = text('sw.js');
    const listed = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
    const walk = (dir, base = '') => readdirSync(dir).flatMap(f => {
      const full = join(dir, f);
      return statSync(full).isDirectory() ? walk(full, `${base}${f}/`) : [`${base}${f}`];
    });
    const actual = walk(dist).filter(f => f !== 'sw.js' && f !== 'decanter-standalone.html').map(f => `./${f}`);
    for (const f of actual) assert(listed.includes(f), `${f} was built but is not precached`);
    for (const f of listed) {
      if (f === './') continue;
      assert(has(f.replace('./', '')), `${f} is precached but does not exist, install would fail`);
    }
  });
  it('changes its cache name when the app changes', () => {
    const version = text('sw.js').match(/const VERSION = '([^']+)'/)[1];
    assert(/^decanter-[0-9a-f]{10}$/.test(version), `unexpected cache name: ${version}`);
  });
  it('stamps the page with the same build the worker caches', () => {
    /* so anyone looking at a bug can say which build they are looking at,
       instead of arguing about it */
    const stamp = text('index.html').match(/<meta name="build" content="([0-9a-f]{10})">/);
    assert(stamp, 'index.html carries no build stamp');
    const version = text('sw.js').match(/const VERSION = 'decanter-([0-9a-f]{10})'/);
    assert(version, 'the worker has no version');
    equal(stamp[1], version[1], 'page and worker disagree about which build this is');
  });

  it('always revalidates the page, so a stale build cannot stick', () => {
    /* every byte of the app is inlined into index.html, so serving a cached page
       serves cached code. Without revalidation the host's max-age on HTML can
       pin an old build in place and no amount of reloading dislodges it. */
    const sw = text('sw.js');
    assert(/mode === 'navigate'/.test(sw), 'no navigation branch in the worker');
    const nav = sw.slice(sw.indexOf("mode === 'navigate'"), sw.indexOf("mode === 'navigate'") + 420);
    assert(/cache:\s*'no-cache'/.test(nav),
      'navigations must revalidate, or a cached index.html pins an old build');
  });

  it('registers the worker only where it can work', () => {
    assert(read('src/js/95-pwa.js').includes("location.protocol.startsWith('http')"),
      'registering from file:// throws, so it must be guarded');
  });

  it('picks up a new build without being asked', () => {
    /* Revalidating the page only helps someone who navigates. A tab left open
       never navigates again, so it would run the build it started with for as
       long as it stayed open: a fix can be live and invisible at the same time. */
    const pwa = read('src/js/95-pwa.js');
    assert(/reg\.update\(\)/.test(pwa), 'nothing ever asks for a newer build');
    assert(/setInterval\(/.test(pwa), 'no periodic check');
    assert(/visibilitychange/.test(pwa), 'no check when the tab comes back');
    assert(/controllerchange/.test(pwa), 'nothing notices a new build taking over');
    /* A page that starts uncontrolled is claimed once as its worker installs.
       Remembering a flag from load time treats that as disqualifying and the tab
       never updates again; tracking the controller keeps the next change usable. */
    assert(/controller = navigator\.serviceWorker\.controller/.test(pwa),
      'the controller must be tracked, not sampled once at load');
    assert(/if \(!had \|\| taken\) return/.test(pwa),
      'a first install must not be mistaken for an update, nor disqualify the tab');
    assert(/App\.updateReady\(\)/.test(pwa), 'the app is never told an update is ready');
  });

  it('scores nothing for a board that was not finished', () => {
    /* The run ends either because the board is done or because it is lost, and
       both land in finish(). rate() only counts pours against par and cannot
       tell the two apart, so a run lost after six pours on a par of thirty nine
       came out as three stars and a payout. Stars have to be gated on the board
       actually being solved. */
    const app = read('src/js/90-app.js');
    const fn = app.slice(app.indexOf('function finish(){'), app.indexOf('function skipCost'));
    assert(/const solved = Rules\.isSolved\(S\.tubes\)/.test(fn),
      'finish() must ask whether the board is actually solved');
    assert(/solved \? Rules\.rate\(/.test(fn),
      'and must only rate a run that finished the board');
  });
  it('never drops a resize taken during a pour', () => {
    /* Rebuilding the board mid pour would strand the animation, so the resize is
       held back. Held back is only safe if something applies it afterwards:
       nothing else will, because the glass re-centres by itself in CSS while the
       liquid keeps the geometry it measured before, so the two come apart and
       stay apart until the next resize. */
    const app = read('src/js/90-app.js');
    const held = app.slice(app.indexOf('const onResize ='), app.indexOf('addEventListener(\'keydown\''));
    assert(/missedResize = true/.test(held), 'a resize during a pour must be remembered, not dropped');
    const drain = app.slice(app.indexOf('async function drain('), app.indexOf('function finish('));
    assert(/missedResize/.test(drain) && /Board\.render\(\)/.test(drain),
      'and the board must be rebuilt once the pours land');
    assert(/addEventListener\('orientationchange'/.test(app),
      'some browsers rotate without firing resize');
  });
  it('never reloads out from under a pour', () => {
    /* progress is saved per level, so reloading on the map costs nothing, but
       reloading mid-level would throw away the level being played */
    const app = read('src/js/90-app.js');
    const fn = app.slice(app.indexOf('function takeUpdate('), app.indexOf('/* local calendar day'));
    assert(/dataset\.view !== 'map'/.test(fn), 'it must wait for the map');
    assert(/S\.running \|\| S\.queue\.length/.test(fn), 'it must wait for the animation to finish');
    assert(/location\.reload\(\)/.test(fn), 'it never actually reloads');
  });
});
