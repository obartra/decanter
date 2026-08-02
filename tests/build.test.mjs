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
    /* The bubble game is a separate page with its own build id, deliberately
       left out of this worker's precache, so it is left out here too. */
    const actual = walk(dist)
      .filter(f => f !== 'sw.js' && f !== 'decanter-standalone.html' && !f.startsWith('bubble/'))
      .map(f => `./${f}`);
    for (const f of listed) assert(!f.startsWith('./bubble/'),
      `${f} belongs to the other game and must not be in this worker's precache`);
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
    /* Bounded by the end of the branch rather than by a character count. A
       fixed window silently slides off the thing it is checking the moment a
       comment above it grows, and fails describing a bug that is not there. */
    const at = sw.indexOf("mode === 'navigate'");
    const nav = sw.slice(at, sw.indexOf('e.respondWith(\n    caches.match(req', at));
    assert(/cache:\s*'no-cache'/.test(nav),
      'navigations must revalidate, or a cached index.html pins an old build');
  });

  it(`leaves the other game's caches alone`, () => {
    /* Two workers on one origin. A filter of "everything that is not me" means
       whichever activated last empties the other's precache, and the two take
       turns breaking each other, visible only when offline. */
    const sw = text('sw.js');
    assert(/startsWith\('decanter-'\)/.test(sw),
      'the worker must only delete its own caches, not every cache on the origin');
    assert(/\/bubble\//.test(sw),
      'navigations to the other game must not fall back to this game\'s page');
  });

  it('builds the bubble game at its own path with its own id', () => {
    assert(has('bubble/index.html'), 'the bubble page was not built');
    const page = text('bubble/index.html');
    const mine = text('index.html').match(/name="build" content="([^"]+)"/)[1];
    const theirs = page.match(/name="build" content="([^"]+)"/)[1];
    assert(theirs && theirs !== mine, 'the two games must not share a build id');
    assert(/BubbleApp/.test(page), 'the bubble sources were not inlined');
    assert(!/Levels\.make/.test(page), 'the other game leaked into this page');
    /* it sits one level down, so every path out of it has to climb */
    assert(!/["'(]\/(bubble|fonts|icons)\//.test(page),
      'an absolute path works locally and 404s under a project subpath');
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
    /* Rebuilding the board mid pour would strand the animation, so the resize is
       held back. Held back is only safe if something applies it afterwards:
       nothing else will, because the glass re-centres by itself in CSS while the
       liquid keeps the geometry it measured before, so the two come apart and
       stay apart until the next resize. */
    const app = read('src/js/90-app.js');
    /* anchored on the resize plumbing itself, not on the next listener in the
       file, which moves whenever anything else registers one */
    const held = app.slice(app.indexOf('const onResize ='), app.indexOf('const scheduleResize'));
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

describe('the two games do not collide', () => {
  /* They are separate pages today, so none of this matters yet. It matters the
     moment they are one, which is the stated plan: bubble levels every fifth
     board of the graded game. These are the seams that would break silently at
     that point, and they are far cheaper to hold open now than to discover
     during the merge. */
  const classesIn = dir => {
    const out = new Set();
    for (const f of readdirSync(join(root, dir)).filter(n => n.endsWith('.css'))){
      for (const m of read(`${dir}/${f}`).matchAll(/^\.([a-zA-Z][-\w]*)/gm)) out.add(m[1]);
    }
    return out;
  };

  it('styles nothing by the same class name in both stylesheets', () => {
    const mine = classesIn('src/css'), theirs = classesIn('src/bubble/css');
    const shared = [...mine].filter(c => theirs.has(c)).sort();
    /* Zero, and it has to stay zero: both stylesheets are inlined into the same
       page now, so a shared name is not a latent problem, it is one game
       restyling the other. The bubble game carries a `bub` prefix on the three
       that used to collide (btn, hud, veil) for exactly this reason. */
    equal(shared, [], 'the two stylesheets share a class name, so one game will restyle the other');
  });

  it('gives every bubble global a name the other game cannot take', () => {
    /* One page, one global scope, so an unprefixed name on this side would
       collide with the other game outright. */
    const js = readdirSync(join(root, 'src/bubble/js')).filter(n => n.endsWith('.js'));
    for (const f of js){
      for (const m of read(`src/bubble/js/${f}`).matchAll(/^globalThis\.(\w+)\s*=/gm)){
        assert(m[1].startsWith('Bubble'), `${f} publishes ${m[1]}, which is not namespaced`);
      }
    }
  });

  it('takes no name the browser already uses', () => {
    /* The sound module was called `Audio` and so replaced the DOM constructor on
       the page. Nothing broke, because nothing in either game builds an
       `new Audio()`, which is exactly what makes it worth a test rather than a
       comment: the collision is silent until the day some line wants the real
       one, and then it fails somewhere else entirely.

       Checked against the `globals` package rather than a list kept here, so it
       covers everything a browser defines instead of everything somebody
       remembered. */
    const taken = [];
    for (const dir of ['src/js', 'src/bubble/js']){
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
    for (const [dir, mod] of [['src/bubble/js', '50-audio.js'], ['src/js', '50-audio.js']]){
      const src = read(`${dir}/${mod}`);
      /* Only the object the module returns, not its body: a `if (` at the same
         indentation reads as a method named `if` otherwise. */
      const returned = src.slice(src.lastIndexOf('\n  return {'));
      const cues = [...returned.matchAll(/^\s{4}(\w+)\s*(?:\(|:\s*(?:function\b|\())/gm)]
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
