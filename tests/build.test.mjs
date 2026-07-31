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
                     'art/map.webp', 'art/board.webp', 'art/win.webp',
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
      for (const slot of ['<!--CSS-->', '<!--JS-->', '<!--SOLVER-->', '<!--FONTS-->', '<!--ART-->', '<!--PWAHEAD-->']){
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
});
