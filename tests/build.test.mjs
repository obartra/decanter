import { describe, it, assert, equal, read, root } from './helpers.mjs';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
/* the same list the linter is configured from, so "what a browser defines" has
   one answer here and there rather than a copy that drifts */
import globals from 'globals';

const browserGlobals = globals.browser;

const dist = join(root, 'dist');
const has = f => existsSync(join(dist, f));
const text = f => readFileSync(join(dist, f), 'utf8');
const all = (dir = dist, base = '') => readdirSync(dir).flatMap(f => {
  const full = join(dir, f);
  return statSync(full).isDirectory() ? all(full, `${base}${f}/`) : [`${base}${f}`];
});

/* Found by name rather than listed, so these keep pointing at the right files as
   their hashes move. */
const built = () => all();
const assetNamed = (name, ext) =>
  built().find(f => new RegExp(`^assets/${name}-[0-9a-f]{10}\\.${ext}$`).test(f));

/* Every game that has sources, discovered rather than written down, so a third
   and fourth game are covered by these the moment they exist. */
const gameDirs = () => readdirSync(join(root, 'src'))
  .filter(d => existsSync(join(root, 'src', d, 'index.html'))
            && existsSync(join(root, 'src', d, 'js')));

describe('the workflow and the scripts it names', () => {
  it('never asks npm for a script that does not exist', () => {
    /* CI is the one file `npm run check` cannot check. Its steps are npm
       scripts named as strings in yaml, so renaming or removing one leaves the
       workflow calling a script that is gone — and everything passes locally
       right up until the pull request goes red on `Missing script`. That is
       exactly how this landed: a detector was folded into another, its script
       came out of package.json, and the CI step naming it stayed. */
    const yml = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
    const named = [...yml.matchAll(/npm run ([\w:]+)/g)].map(m => m[1]);
    assert(named.length >= 5, `only found ${named.length} npm steps, so the scan has broken`);
    for (const name of new Set(named)){
      assert(scripts[name], `.github/workflows/ci.yml runs "npm run ${name}", which package.json does not define`);
    }
  });

  it('runs every gate that npm run check runs', () => {
    /* The other direction, and the reason it matters: a gate in `check` but in
       no CI step is one nothing can fail a pull request with. */
    const yml = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
    const inCheck = [...scripts.check.matchAll(/npm run ([\w:]+)/g)].map(m => m[1]);
    for (const name of inCheck){
      assert(new RegExp(`npm run ${name}\\b`).test(yml),
        `npm run check runs "${name}" and no CI step does, so it cannot fail a pull request`);
    }
  });
});

describe('build output', () => {
  it('produces every file the app needs', () => {
    for (const f of ['index.html', 'sw.js', 'manifest.webmanifest',
                     'decanter-standalone.html', 'fonts/cinzel.woff2',
                     'fonts/alegreyasans.woff2', 'fonts/alegreyasans-bold.woff2',
                     'icons/icon-192.png',
                     'icons/icon-512.png', 'icons/maskable-512.png',
                     'audio/boom.mp3']){
      assert(has(f), `dist/${f} is missing, run npm run build`);
    }
    for (const name of ['app', 'audio', 'solver']){
      assert(assetNamed(name, 'js'), `the ${name} bundle is missing`);
    }
    assert(assetNamed('app', 'css'), 'the app stylesheet is missing');
  });

  it('makes no network requests, so it can run fully offline', () => {
    for (const f of built().filter(n => n.endsWith('.html'))){
      const html = text(f);
      const external = [...html.matchAll(/(?:src|href)=["']?(https?:\/\/[^"'>) ]+)/g)].map(m => m[1]);
      equal(external, [], `dist/${f} still reaches out to ${external.join(', ')}`);
    }
  });

  it('leaves no unfilled template slots', () => {
    for (const f of built().filter(n => n.endsWith('.html'))){
      const html = text(f);
      for (const slot of ['<!--CSS-->', '<!--JS-->', '<!--SOLVER-->', '<!--FONTS-->', '<!--BUILD-->',
                          '<!--PWAHEAD-->', '<!--DEFERRED-->', '<!--HEAD-->', '<!--BOOM-->']){
        assert(!html.includes(slot), `dist/${f} still contains ${slot}`);
      }
    }
  });

  /* The shells are the only bytes that are never cached for free: every load
     revalidates them, forever, on every device. Code getting inlined back into
     one is the regression this whole layout exists to prevent, and it would be
     invisible — the page would work perfectly and merely cost more every time. */
  it('keeps every shell to markup, because every load pays for it', () => {
    for (const f of built().filter(n => n.endsWith('index.html'))){
      const html = text(f);
      const scripts = [...html.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)];
      for (const [, body] of scripts){
        assert(!body.trim(), `dist/${f} has an inline script, which every load would re-download`);
      }
      /* The font block is the one exception, and it has to be: a @font-face
         pointing at a file is three lines, and putting it in the stylesheet
         would mean the fonts could not start downloading until the stylesheet
         had. Anything else in a <style> tag is code that every load re-fetches. */
      for (const [, body] of html.matchAll(/<style>([\s\S]*?)<\/style>/g)){
        const beyondFonts = body.replace(/@font-face\{[^}]*\}/g, '').trim();
        assert(!beyondFonts, `dist/${f} has inline CSS beyond the font block: ${beyondFonts.slice(0, 60)}`);
      }
      assert(readFileSync(join(dist, f)).length < 12_000, `dist/${f} is too big for a shell`);
    }
  });

  /* A hashed name is the whole reason these can be cached forever, and the
     reason two games can no longer collide over one. An unhashed asset would be
     served stale by a worker that has no way of knowing it changed. */
  it('hashes every bundle, so it can be cached and never revalidated', () => {
    const assets = built().filter(f => f.startsWith('assets/'));
    assert(assets.length > 0, 'no bundles were emitted');
    for (const f of assets){
      assert(/-[0-9a-f]{10}\.(js|css)$/.test(f), `${f} is not content-hashed`);
    }
  });

  it('bundles every source module in order', () => {
    const js = text(assetNamed('app', 'js'));
    /* the sound is deliberately not in here; see the deferred test below */
    for (const f of readdirSync(join(root, 'src/js')).filter(n => n !== '50-audio.js')){
      assert(js.includes(`/* ---- ${f} ---- */`), `${f} was left out of the app bundle`);
    }
    assert(js.indexOf('/* ---- 20-rules.js ---- */') < js.indexOf('/* ---- 90-app.js ---- */'),
      'modules must be bundled in dependency order');
  });

  it('carries a working copy of the solver', () => {
    const src = text(assetNamed('solver', 'js'));
    const stub = {};
    new Function('self', src)(stub);
    let out;
    stub.postMessage = x => { out = x; };
    stub.onmessage({ data: { id: 1, tubes: [[0,1,0,1],[1,0,1,0],[]], cap: 4, colors: 2, nodeCap: 400000, msCap: 5000 } });
    equal(out.par, 7, 'the emitted solver gives the wrong answer');
    assert(out.exact, 'the emitted solver should be exact here');
  });

  it('emits javascript that actually parses', () => {
    for (const f of built().filter(n => n.startsWith('assets/') && n.endsWith('.js'))){
      new Function(text(f));   // throws on a syntax error
    }
    /* and the portable file, which is still one big inline script */
    const scripts = [...text('decanter-standalone.html')
      .matchAll(/<script(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert(scripts.some(s => s.trim()), 'the portable file has no bundle in it');
    for (const s of scripts) if (s.trim()) new Function(s);
  });

  /* The sound is fetched after the page opens rather than as part of opening it.
     That is only safe because something answers for it in the meantime, and the
     thing that answers has to cover every name the real module publishes — the
     first call to one it missed is the crash this arrangement would otherwise
     have introduced. */
  it('has a stand-in for every sound the real module publishes', () => {
    const cues = src => {
      const returned = src.slice(src.lastIndexOf('\n  return {'));
      return new Set([...returned.matchAll(/^\s{4}(?:get\s+)?(\w+)\s*[(:]/gm)].map(m => m[1]));
    };
    const real = cues(read('src/js/50-audio.js'));
    const stub = cues(read('src/js/49-audio.js'));
    assert(real.size > 10, `found only ${real.size} names in the real module, so the scan is wrong`);
    const missing = [...real].filter(n => !stub.has(n));
    equal(missing, [], 'the stand-in is missing names the real sound publishes');
  });

  it('keeps the sound out of the critical bundle and fetches it afterwards', () => {
    const js = text(assetNamed('app', 'js'));
    assert(!js.includes('/* ---- 50-audio.js ---- */'), 'the sound is still in the critical bundle');
    assert(js.includes('/* ---- 49-audio.js ---- */'), 'the stand-in must be, or a cue before it lands throws');
    assert(text(assetNamed('audio', 'js')).includes('/* ---- 50-audio.js ---- */'),
      'the sound was not emitted as its own bundle');
  });

  /* The window this guards is between DOMContentLoaded, when the deferred app
     script has run and the map is interactive, and `load`, which additionally
     waits for three woff2 files. On a cold cache that is seconds. If the group
     names are not known until `load`, ready() takes its unknown-group path and
     resolves into nothing, and a caller awaiting a game gets told it is there. */
  it('knows what it will fetch before it fetches it', () => {
    const src = read('src/js/96-deferred.js');
    const declare = src.slice(src.indexOf('function declare('), src.indexOf('function start('));
    assert(/waiting\.set\(/.test(declare),
      'the group names must be declared without waiting for load');
    const start = src.slice(src.indexOf('function start('), src.indexOf('function ready('));
    assert(!/waiting\.set\(/.test(start),
      'start() runs on load; a name first known there is a name unknown while the map is live');
    assert(/declare\(\);/.test(src), 'declare() is never called');
    assert(src.indexOf('declare();') < src.indexOf("addEventListener('load', start)"),
      'the names must be declared before the fetching is scheduled');
  });

  it('names only deferred assets that were actually built', () => {
    const m = text('index.html').match(/<script type="application\/json" id="deferredAssets">([\s\S]*?)<\/script>/);
    assert(m, 'the app page lists nothing to fetch after it opens');
    const groups = JSON.parse(m[1]);
    assert(Object.keys(groups).length > 0, 'the deferred list is empty');
    for (const [name, urls] of Object.entries(groups)){
      assert(urls.length > 0, `${name} is listed with nothing in it`);
      for (const u of urls) assert(has(u.replace('./', '')), `${name} names ${u}, which was not built`);
    }
    assert(groups.audio, 'the sound must be fetched after the page opens');
  });

  /* A page with no icon is not merely undecorated. The browser asks for
     /favicon.ico regardless and logs a 404 when there is none, on every load of
     a game that otherwise produces neither a stray request nor a console error —
     and a spec that asserts a clean console then fails or not depending on
     whether the icon request happened to land before the assertion. */
  it('gives every page an icon, so nothing goes looking for one', () => {
    for (const f of built().filter(n => n.endsWith('index.html'))){
      const icon = text(f).match(/<link rel="icon" href="([^"]+)"/);
      assert(icon, `dist/${f} has no icon, so the browser will ask for one and get a 404`);
      /* A page may carry its icon instead of pointing at one — the bubble page
         draws its own bubble as an inline SVG, which costs no request at all.
         Only a path has to resolve. */
      if (icon[1].startsWith('data:')) continue;
      const from = f.includes('/') ? icon[1].replace('../', '') : icon[1].replace('./', '');
      assert(has(from), `dist/${f} points at ${icon[1]}, which was not built`);
    }
  });
  it('declares no top-level name in two files, in either bundle', () => {
    /* Every source file in a game is concatenated into one script, so top-level
       declarations from different files share a scope, and function declarations
       hoist, so the last one wins for the whole script, including the lines
       above it.

       This is not a clash that shows up as an error anywhere. A second file
       declaring `decide` quietly replaced the one `Panel` had already published,
       and the end-of-run panel started titling itself "Level 1". Nothing threw,
       the page ran, and the only symptom was one module answering with another
       module's words.

       Modules here are IIFEs precisely so this cannot happen; what this catches
       is the next one that is not. */
    for (const dir of ['src/js', 'src/bubble/js']){
      const where = new Map();
      for (const f of readdirSync(join(root, dir)).filter(n => n.endsWith('.js'))){
        for (const m of read(`${dir}/${f}`).matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)){
          if (!where.has(m[1])) where.set(m[1], new Set());
          where.get(m[1]).add(f);
        }
      }
      const clashes = [...where].filter(([, files]) => files.size > 1)
        .map(([name, files]) => `${name} in ${[...files].join(' and ')}`);
      equal(clashes, [], `${dir} declares the same name twice, so one file silently overwrites the other`);
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
    /* The portable file is a copy of the app for carrying around. Precaching it
       would double what an install costs to no end. */
    const actual = built()
      .filter(f => f !== 'sw.js' && f !== 'decanter-standalone.html')
      .map(f => `./${f}`);
    for (const f of actual) assert(listed.includes(f), `${f} was built but is not precached`);
    for (const f of listed) {
      if (f === './') continue;
      assert(has(f.replace('./', '')), `${f} is precached but does not exist, install would fail`);
    }
    assert(!listed.includes('./decanter-standalone.html'), 'the portable file must not be precached');
  });

  /* Every game now lives in the one worker's cache. That is what the hashing
     bought: two builds cannot collide over a filename, so there is no longer a
     reason to give each game a cache of its own — which is what left the second
     game with no worker, and therefore no offline, for as long as it had one. */
  it('precaches every game, so all of them work offline', () => {
    const listed = JSON.parse(text('sw.js').match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
    for (const g of gameDirs()){
      assert(listed.includes(`./${g}/index.html`), `${g} is not precached, so it cannot work offline`);
    }
  });

  it('hands each build the bang it can actually reach', () => {
    /* The two outputs answer this differently and both answers are easy to get
       wrong in the direction nobody notices: a missing or unreachable recording
       falls back to the synthesised bang, which still sounds, so the portable
       file would go on working and simply stop being the sound it shipped with.

       The portable one has to carry the bytes. A file:// page fetching a sibling
       path is a cross origin request, so a data URI is the only form of this
       that survives the file leaving the folder it was built in. */
    const app = text('index.html').match(/<meta name="boom" content="([^"]+)">/);
    assert(app, 'index.html says nothing about where the bang is');
    equal(app[1], './audio/boom.mp3', 'the installable build should point at the cached file');

    const solo = text('decanter-standalone.html').match(/<meta name="boom" content="([^"]+)">/);
    assert(solo, 'the portable file says nothing about where the bang is');
    assert(solo[1].startsWith('data:audio/mpeg;base64,'),
      'the portable file must carry the bang, not point at it');
    /* the whole recording, not a truncated one */
    const bytes = Buffer.from(solo[1].slice('data:audio/mpeg;base64,'.length), 'base64');
    equal(bytes.length, statSync(join(dist, 'audio/boom.mp3')).size,
      'the inlined bang is not the file that shipped');
  });

  it('changes its cache name when the app changes', () => {
    const version = text('sw.js').match(/const VERSION = '([^']+)'/)[1];
    assert(/^decanter-[0-9a-f]{10}$/.test(version), `unexpected cache name: ${version}`);
  });

  it('stamps every page with the build the worker caches', () => {
    const version = text('sw.js').match(/const VERSION = 'decanter-([0-9a-f]{10})'/);
    assert(version, 'the worker has no version');
    for (const f of built().filter(n => n.endsWith('index.html'))){
      const stamp = text(f).match(/<meta name="build" content="([0-9a-f]{10})">/);
      assert(stamp, `dist/${f} carries no build stamp`);
      equal(stamp[1], version[1], `${f} and the worker disagree about which build this is`);
    }
  });

  it('always revalidates the shell, so a stale build cannot stick', () => {
    /* A shell names the bundles by hash. Serving a cached one serves the names
       of a build that may no longer exist, and no amount of reloading would
       dislodge it while the host's max-age on HTML said otherwise. */
    const sw = text('sw.js');
    assert(/mode === 'navigate'/.test(sw), 'no navigation branch in the worker');
    const at = sw.indexOf("mode === 'navigate'");
    const nav = sw.slice(at, sw.indexOf('return;', at));
    assert(/cache:\s*'no-cache'/.test(nav),
      'navigations must revalidate, or a cached shell pins an old build');
  });

  it('caches a hashed asset without ever revalidating it', () => {
    const sw = text('sw.js');
    assert(/\/assets\//.test(sw), 'the worker does not treat hashed assets specially');
    const at = sw.indexOf("pathname.includes('/assets/')");
    assert(at > 0, 'no branch for hashed assets');
    const branch = sw.slice(at, sw.indexOf('return;', at));
    assert(/caches\.match/.test(branch), 'a hashed asset must be served from cache first');
    assert(!/no-cache/.test(branch), 'a hashed asset must never be revalidated: its name is its version');
  });

  it('answers a navigation offline with the shell for that path', () => {
    /* Falling back to the app for every navigation would serve the pour game at
       another game's URL, which reads as the wrong game loading rather than as
       being offline.

       This runs the worker's OWN matching expression rather than restating it.
       The first version asserted the contents of the SHELLS list and nothing
       else, and passed while the matcher beside it sent every page to the app
       shell: './index.html' is a suffix of '/bubble/index.html', so a find by
       endsWith matched the app first, every time. A list is data. What was
       broken was the line that read it. */
    const sw = text('sw.js');
    const SHELLS = JSON.parse(sw.match(/const SHELLS = (\[[\s\S]*?\]);/)[1]);
    const expr = sw.match(/const hit = (SHELLS\.find\([\s\S]*?\));/);
    assert(expr, 'the worker no longer picks a shell the way this test drives it');
    /* `url` is what the worker names it, so that is what it is handed */
    const run = new Function('SHELLS', 'url',
      `const hit = ${expr[1]}; return hit ? hit[1] : './index.html';`);
    const pick = pathname => run(SHELLS, { pathname });

    equal(pick('/'), './index.html', 'the root must get the app shell');
    for (const g of gameDirs()){
      equal(pick(`/${g}/`), `./${g}/index.html`, `${g} was answered with the wrong shell`);
      /* the whole build can be served from a project subdirectory */
      equal(pick(`/decanter/${g}/`), `./${g}/index.html`,
        `${g} under a subdirectory was answered with the wrong shell`);
    }
  });

  it('builds every game at its own path, from its own bundle', () => {
    for (const g of gameDirs()){
      assert(has(`${g}/index.html`), `the ${g} page was not built`);
      const page = text(`${g}/index.html`);
      const css = page.match(/<link rel="stylesheet" href="\.\.\/(assets\/[^"]+)"/);
      const js = page.match(/<script defer src="\.\.\/(assets\/[^"]+)"/);
      assert(css && has(css[1]), `${g} does not load a stylesheet that exists`);
      assert(js && has(js[1]), `${g} does not load a bundle that exists`);
      assert(text(js[1]).includes('/* ---- 00-config.js ---- */'), `${g}'s bundle looks empty`);
      /* it sits one level down, so every path out of it has to climb */
      assert(!/["'(]\/(assets|fonts|icons)\//.test(page),
        `${g} uses an absolute path, which works locally and 404s under a project subpath`);
    }
  });

  it('leaves the pour game out of the other games\' pages', () => {
    for (const g of gameDirs()){
      const js = text(text(`${g}/index.html`).match(/<script defer src="\.\.\/(assets\/[^"]+)"/)[1]);
      assert(!/Levels\.make/.test(js), `the pour game leaked into ${g}'s bundle`);
    }
  });

  /* The portable build is the one place splitting would be the wrong answer:
     there is nowhere to fetch from, so everything has to already be there. */
  it('inlines everything into the portable file, which has nothing to fetch', () => {
    const html = text('decanter-standalone.html');
    assert(/<script id="solverSrc"/.test(html), 'the portable file has no solver in it');
    assert(html.includes('/* ---- 50-audio.js ---- */'), 'the portable file would open silent');
    assert(html.includes('/* ---- 90-app.js ---- */'), 'the portable file has no app in it');
    assert(/data:font\/woff2;base64,/.test(html), 'the fonts are not inlined, so it cannot open off disk');
    assert(!/<link rel="stylesheet"/.test(html), 'the portable file references a stylesheet it cannot fetch');
    assert(!/<script defer src=/.test(html), 'the portable file references a script it cannot fetch');
  });

  it('registers the worker only where it can work', () => {
    assert(read('src/js/95-pwa.js').includes("location.protocol.startsWith('http')"),
      'registering from file:// throws, so it must be guarded');
  });

  it('picks up a new build without being asked', () => {
    const pwa = read('src/js/95-pwa.js');
    assert(/reg\.update\(\)/.test(pwa), 'nothing ever asks for a newer build');
    assert(/setInterval\(/.test(pwa), 'no periodic check');
    assert(/visibilitychange/.test(pwa), 'no check when the tab comes back');
    assert(/controllerchange/.test(pwa), 'nothing notices a new build taking over');
    assert(/controller = navigator\.serviceWorker\.controller/.test(pwa),
      'the controller must be tracked, not sampled once at load');
    assert(/if \(!had \|\| taken\) return/.test(pwa),
      'a first install must not be mistaken for an update, nor disqualify the tab');
    assert(/App\.updateReady\(\)/.test(pwa), 'the app is never told an update is ready');
  });

  /* Every way into a level has to ask which game that level is. There were two
     ways in and only one asked: paying past a board set the view to the pour
     game and called start() directly, so paying past the level before a bubble
     level dealt a shelf of bottles under a bubble level's number and scored it
     against a par that level does not have. */
  it('deals every level through the one thing that knows which game it is', () => {
    const app = read('src/js/90-app.js');
    assert(/function deal\(/.test(app), 'there is no single place that deals a board');
    const opener = app.slice(app.indexOf('function deal('), app.indexOf('function attempt('));
    assert(/Levels\.isBubble\(level\)/.test(opener), 'the one dispatch does not ask which game');

    /* nothing outside it may set the view and start a pour itself */
    const skip = app.slice(app.indexOf("$('skip').onclick"), app.indexOf("$('next').onclick"));
    assert(/\bdeal\(/.test(skip), 'paying past a board does not go through the dispatch');
    assert(!/\bstart\(/.test(skip), 'paying past a board still deals a pour board directly');
    assert(!/dataset\.view = 'game'/.test(skip), 'paying past a board still forces the pour view');
  });

  /* Three views, and a resize used to lay out the pour board for any of them
     that was not the map — rebuilding a shelf that is not on the screen, at zero
     height, and handing the backdrop a shelf line at the top of the window. */
  it('lays out the view that is actually up when the window changes', () => {
    const app = read('src/js/90-app.js');
    const fn = app.slice(app.indexOf('const relayout = ()'), app.indexOf('const onResize ='));
    assert(/view === 'game'/.test(fn), 'a resize does not check whether the pour board is up');
    assert(!/else Board\.render\(\);/.test(fn), 'a resize still renders the pour board unconditionally');
  });

  it('scores nothing for a board that was not finished', () => {
    const app = read('src/js/90-app.js');
    /* Ends at the blast rather than running to the end of the file, which is
       what `function skipCost` used to do by not matching anything: skipCost is
       a const arrow and declared above this, so indexOf returned -1 and the
       slice was everything after finish(). Any later call site could satisfy
       these two on its behalf, and one now would. */
    const fn = app.slice(app.indexOf('function finish(){'), app.indexOf('/* ---------- the blast'));
    assert(fn.length > 100, 'the slice must actually contain finish()');
    /* The second argument is the spilled set. Pinned loosely on purpose: what
       matters is that finish() asks the rules whether this board is solved, not
       how many arguments that question takes this month. */
    assert(/const solved = Rules\.isSolved\(S\.tubes[,)]/.test(fn),
      'finish() must ask whether the board is actually solved');
    assert(/solved \? Rules\.rate\(/.test(fn),
      'and must only rate a run that finished the board');
  });

  it('never drops a resize taken during a pour', () => {
    const app = read('src/js/90-app.js');
    const held = app.slice(app.indexOf('const onResize ='), app.indexOf('const scheduleResize'));
    assert(/missedResize = true/.test(held), 'a resize during a pour must be remembered, not dropped');
    const drain = app.slice(app.indexOf('async function drain('), app.indexOf('function finish('));
    assert(/missedResize/.test(drain) && /Board\.render\(\)/.test(drain),
      'and the board must be rebuilt once the pours land');
    assert(/addEventListener\('orientationchange'/.test(app),
      'some browsers rotate without firing resize');
  });

  it('never reloads out from under a pour', () => {
    const app = read('src/js/90-app.js');
    const fn = app.slice(app.indexOf('function takeUpdate('), app.indexOf('/* local calendar day'));
    assert(/dataset\.view !== 'map'/.test(fn), 'it must wait for the map');
    assert(/S\.running \|\| S\.queue\.length/.test(fn), 'it must wait for the animation to finish');
    assert(/location\.reload\(\)/.test(fn), 'it never actually reloads');
  });
});

/* Written for two games and generalized to however many there are, because the
   third and fourth arrived and the pairwise version would have quietly kept
   checking only the first two. */
describe('the games do not collide', () => {
  const classesIn = dir => {
    const out = new Set();
    for (const f of readdirSync(join(root, dir)).filter(n => n.endsWith('.css'))){
      for (const m of read(`${dir}/${f}`).matchAll(/^\.([a-zA-Z][-\w]*)/gm)) out.add(m[1]);
    }
    return out;
  };

  it('styles nothing by the same class name in any two stylesheets', () => {
    const sets = [['src', classesIn('src/css')],
                  ...gameDirs().map(g => [g, classesIn(`src/${g}/css`)])];
    for (let i = 0; i < sets.length; i++){
      for (let j = i + 1; j < sets.length; j++){
        const shared = [...sets[i][1]].filter(c => sets[j][1].has(c)).sort();
        equal(shared, [], `${sets[i][0]} and ${sets[j][0]} share a class name, so one restyles the other`);
      }
    }
  });

  /* One page, one global scope. `Audio` on the decanter side already shadows the
     DOM constructor; a second unprefixed name would collide outright. */
  it('gives every game global a name no other game can take', () => {
    const prefixOf = g => g[0].toUpperCase() + g.slice(1);
    const claimed = new Map();
    for (const g of gameDirs()){
      const want = prefixOf(g);
      for (const f of readdirSync(join(root, `src/${g}/js`)).filter(n => n.endsWith('.js'))){
        for (const m of read(`src/${g}/js/${f}`).matchAll(/^globalThis\.(\w+)\s*=/gm)){
          assert(m[1].startsWith(want),
            `${g}/${f} publishes ${m[1]}, which is not prefixed ${want}`);
          assert(!claimed.has(m[1]), `${m[1]} is published by both ${claimed.get(m[1])} and ${g}`);
          claimed.set(m[1], g);
        }
      }
    }
  });

  it('takes no name the browser already uses', () => {
    /* The sound module was called `Audio` and so replaced the DOM constructor on
       the page. Nothing broke, because nothing in any of these games builds an
       `new Audio()`, which is exactly what makes it worth a test rather than a
       comment: the collision is silent until the day some line wants the real
       one, and then it fails somewhere else entirely.

       Checked against the `globals` package rather than a list kept here, so it
       covers everything a browser defines instead of everything somebody
       remembered. */
    const taken = [];
    for (const dir of ['src/js', ...gameDirs().map(g => `src/${g}/js`)]){
      for (const f of readdirSync(join(root, dir)).filter(n => n.endsWith('.js'))){
        for (const m of read(`${dir}/${f}`).matchAll(/^globalThis\.(\w+)\s*=/gm)){
          if (m[1] in browserGlobals) taken.push(`${dir}/${f} publishes ${m[1]}`);
        }
      }
    }
    equal(taken, [], 'a module publishes a name the browser already defines');
  });

  it('calls every sound it defines', () => {
    /* Two cues were defined and never called, so the two biggest moments in the
       game were silent and every test passed. Nothing else here would notice:
       an uncalled sound is not an error, it is just quiet. */
    const modules = [['src/js', '50-audio.js'],
                     ...gameDirs().map(g => [`src/${g}/js`, '50-audio.js'])]
      .filter(([dir, mod]) => existsSync(join(root, dir, mod)));
    for (const [dir, mod] of modules){
      const src = read(`${dir}/${mod}`);
      /* Only the object the module returns, not its body: an `if (` at the same
         indentation reads as a method named `if` otherwise.

         Shorthand (`  loadBoom,`) counts as well as a method. It reads as an
         ordinary property and so used to be skipped, which meant a cue could go
         uncalled simply by being exposed under the name it already had. */
      const returned = src.slice(src.lastIndexOf('\n  return {'));
      const cues = [...returned.matchAll(/^\s{4}(\w+)\s*(?:\(|,\s*$|:\s*(?:function\b|\())/gm)]
        .map(m => m[1])
        .filter(n => !['get', 'set', 'if', 'for', 'while', 'return', 'switch', 'catch'].includes(n));
      assert(cues.length > 3, `found only ${cues.length} cues in ${dir}/${mod}, so the scan is wrong`);
      const callers = readdirSync(join(root, dir))
        .filter(n => n.endsWith('.js') && n !== mod)
        .map(n => read(`${dir}/${n}`)).join('\n');
      for (const cue of cues){
        assert(new RegExp(`\\.${cue}\\s*\\(`).test(callers),
          `${dir}/${mod} defines ${cue}() and nothing ever calls it`);
      }
    }
  });
});
