#!/usr/bin/env node
/* Build: content-hashed bundles behind a small shell, plus one portable file.

   This used to inline every byte of every game into index.html. That made the
   page a single download, which was the point, but it also made the page
   *code*: 288kb of it, revalidated on every navigation, because a cached page
   would have pinned a stale build. Every load paid for the whole game again,
   and a size budget had to sit on top of it to stop that quietly getting worse.

   Now the code is hashed into its own files. A hashed file can be cached
   forever, because a change to it is a change to its name, so the only thing
   still revalidated is a shell of a few kilobytes. Two consequences worth
   naming, because they paid for the change on their own:

   - There is no longer a reason for the games to fight over cache space. Two
     builds cannot collide when their filenames differ, so one worker can hold
     every page on the origin, and the second game finally gets to work offline.
   - The sound and the second game come out of the critical path entirely. They
     are fetched after the page opens rather than as part of opening it. See
     src/js/96-deferred.js for why eagerly rather than on demand.

   The portable single file is unchanged in spirit: everything inlined, fonts as
   data URIs, no worker, opens straight off disk. It is the one build where
   splitting would be the wrong answer, so it does not split. */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, cpSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const read = p => readFileSync(join(root, p), 'utf8');
const sorted = dir => readdirSync(join(root, dir)).filter(f => !f.startsWith('.')).sort();
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 10);

/* ---------- what there is to build ----------

   The pour game is the app. Every other game is its own page at its own path,
   which is how a mechanic gets worked on without playing ten levels to reach
   one. `inApp` marks the ones the app page also carries, because some of its
   levels are that game; the rest are standalone only, and stay that way until
   somebody decides they belong in the graded run.

   Filtered by what is actually on disk, so a game can be added by creating its
   directory and a page template, and nothing here has to be edited in the same
   commit as the sources it describes. */
const GAMES = [
  { name: 'bubble',  path: 'bubble',  inApp: true },
  { name: 'measure', path: 'measure', inApp: false },
  { name: 'casks',   path: 'casks',   inApp: false }
].filter(g => existsSync(join(root, `src/${g.path}/index.html`))
           && existsSync(join(root, `src/${g.path}/js`))
           && existsSync(join(root, `src/${g.path}/css`)));

/* Modules the app does not need in order to open. Named here rather than by a
   number range, because "critical" is a judgement about this file's contents
   and not a property of where it sorts. */
const DEFERRED = ['50-audio.js'];

/* ---------- gathering sources ---------- */
/* Concatenated in filename order with the same markers the single file has
   always used, so a stack trace in the built page still names the module. */
const concat = (dir, files) =>
  files.map(f => `\n/* ---- ${f} ---- */\n${read(`${dir}/${f}`)}`).join('\n');

const cssOf = dir => sorted(`${dir}/css`).map(f => read(`${dir}/css/${f}`)).join('\n');

function sourcesOf(dir, { skip = [] } = {}){
  const files = sorted(`${dir}/js`);
  return {
    css: cssOf(dir),
    js: concat(`${dir}/js`, files.filter(f => !skip.includes(f))),
    held: concat(`${dir}/js`, files.filter(f => skip.includes(f))),
    all: concat(`${dir}/js`, files)
  };
}

const app = sourcesOf('src', { skip: DEFERRED });
const solver = read('src/worker/solver.js');
const games = GAMES.map(g => ({ ...g, src: sourcesOf(`src/${g.path}`) }));

/* One id for the build, over every source that ships anywhere in dist.

   Every game, not only the ones the app page carries. There is one cache now,
   and activate() deletes every key that is not this version — so if a game
   changed and the id did not, the worker would reopen the same cache, add the
   newly named bundles beside the superseded ones, and never sweep them: the
   install would grow a little every release, forever. The build stamp on that
   game's own page would be wrong too, which is the one thing the stamp exists
   to be right about. */
const buildId = hash([app.all, solver, ...games.map(g => g.src.css + g.src.all)].join('\n'));

/* ---------- emitting ---------- */
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });
cpSync(join(root, 'assets/fonts'), join(dist, 'fonts'), { recursive: true });
cpSync(join(root, 'assets/icons'), join(dist, 'icons'), { recursive: true });

/* A hashed file, written once and referred to by name. The hash is of the
   contents, so an unchanged file keeps its name across builds and stays in
   everybody's cache. */
function asset(name, ext, body){
  const file = `assets/${name}-${hash(body)}.${ext}`;
  writeFileSync(join(dist, file), body);
  return file;
}
/* dist-root-relative to page-relative. Absolute paths work locally and 404 the
   moment the whole thing is served from a project subdirectory. */
const href = (depth, file) => (depth ? '../'.repeat(depth) : './') + file;

const appCss = asset('app', 'css', app.css);
const appJs = asset('app', 'js', app.js);
const audioJs = asset('audio', 'js', app.held);
const solverJs = asset('solver', 'js', solver);
for (const g of games){
  g.cssFile = asset(g.name, 'css', g.src.css);
  g.jsFile = asset(g.name, 'js', g.src.js);
}

const fontFace = (cinzel, sans, sansBold) => `<style>
@font-face{font-family:'Cinzel';font-style:normal;font-weight:400 700;font-display:swap;src:url(${cinzel}) format('woff2')}
@font-face{font-family:'Alegreya Sans';font-style:normal;font-weight:400;font-display:swap;src:url(${sans}) format('woff2')}
@font-face{font-family:'Alegreya Sans';font-style:normal;font-weight:700;font-display:swap;src:url(${sansBold}) format('woff2')}
</style>`;
const fontFiles = d => fontFace(href(d, 'fonts/cinzel.woff2'), href(d, 'fonts/alegreyasans.woff2'),
                                href(d, 'fonts/alegreyasans-bold.woff2'));

const pwaHead = `<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" href="./icons/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">`;

/* An icon and nothing else. A page without one is not merely undecorated: the
   browser goes and asks for /favicon.ico anyway and logs a 404 when there is
   none, on every load, which is a real request and a real error in the console
   of a game that otherwise makes neither.

   No manifest, deliberately. These pages are where a mechanic gets worked on;
   installing one as its own app would put a second Decanter on the home screen
   that is a single game and cannot reach the map. */
const gameHead = depth => `<link rel="icon" href="${href(depth, 'icons/favicon-32.png')}" sizes="32x32">
<link rel="apple-touch-icon" href="${href(depth, 'icons/apple-touch-icon.png')}">`;

/* Slots are filled with a function rather than a string throughout: a replacement
   containing `$&` or `$1` is otherwise interpreted, and minified CSS is full of
   dollar signs waiting to happen. */
function page(tmpl, slots){
  let out = read(tmpl);
  for (const [slot, value] of Object.entries(slots)) out = out.replace(slot, () => value);
  return out;
}

/* 1. the app, as a shell over hashed bundles */
const deferredFor = () => {
  const groups = { audio: [href(0, audioJs)] };
  for (const g of games.filter(x => x.inApp)) groups[g.name] = [href(0, g.cssFile), href(0, g.jsFile)];
  return groups;
};
const appPage = page('src/index.html', {
  '<!--BUILD-->': `<meta name="build" content="${buildId}">`,
  '<!--PWAHEAD-->': pwaHead,
  '<!--FONTS-->': fontFiles(0),
  /* The worker is a file now rather than a script tag to be turned into a blob,
     so it caches like everything else. The page names it here and
     60-solver-client.js reads it, which keeps the URL out of the bundle and lets
     the bundle stay identical between the two builds. */
  '<!--SOLVER-->': `<meta name="solver" content="${href(0, solverJs)}">`,
  '<!--CSS-->': `<link rel="stylesheet" href="${href(0, appCss)}">`,
  '<!--DEFERRED-->': `<script type="application/json" id="deferredAssets">${JSON.stringify(deferredFor())}</script>`,
  '<!--JS-->': `<script defer src="${href(0, appJs)}"></script>`
});
writeFileSync(join(dist, 'index.html'), appPage);

/* 2. one portable file, everything inlined, opens straight off disk.

   No hashing, no deferring and no worker file: there is nowhere to fetch from.
   The sound module goes back in line with the rest, and an empty deferred slot
   is how 96-deferred.js is told there is nothing to wait for. */
const dataFont = p => 'data:font/woff2;base64,' + readFileSync(join(root, p)).toString('base64');
const standalone = page('src/index.html', {
  '<!--BUILD-->': `<meta name="build" content="${buildId}">`,
  '<!--PWAHEAD-->': '',
  '<!--FONTS-->': fontFace(dataFont('assets/fonts/cinzel.woff2'),
                           dataFont('assets/fonts/alegreyasans.woff2'),
                           dataFont('assets/fonts/alegreyasans-bold.woff2')),
  '<!--SOLVER-->': `<script id="solverSrc" type="text/js-worker">${solver}</script>`,
  '<!--CSS-->': `<style>${[app.css, ...games.filter(g => g.inApp).map(g => g.src.css)].join('\n')}</style>`,
  '<!--DEFERRED-->': '',
  '<!--JS-->': `<script>${[app.all, ...games.filter(g => g.inApp).map(g => g.src.js)].join('\n')}</script>`
});
writeFileSync(join(dist, 'decanter-standalone.html'), standalone);

/* 3. every game at its own path, from the same bundles the app uses.

   The fonts are reached by climbing out of the subfolder rather than copied,
   because a second set of the same three files is dead weight in the cache. */
for (const g of games){
  mkdirSync(join(dist, g.path), { recursive: true });
  writeFileSync(join(dist, g.path, 'index.html'), page(`src/${g.path}/index.html`, {
    '<!--BUILD-->': `<meta name="build" content="${buildId}">`,
    '<!--HEAD-->': gameHead(1),
    '<!--FONTS-->': fontFiles(1),
    '<!--CSS-->': `<link rel="stylesheet" href="${href(1, g.cssFile)}">`,
    '<!--JS-->': `<script defer src="${href(1, g.jsFile)}"></script>`
  }));
}

writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify({
  id: '/decanter/',
  name: 'Decanter',
  short_name: 'Decanter',
  description: 'A water sorting puzzle. Pour until every bottle holds one color.',
  start_url: './',
  scope: './',
  display: 'standalone',
  display_override: ['standalone', 'fullscreen', 'minimal-ui'],
  orientation: 'portrait',
  background_color: '#0B0805',
  theme_color: '#1A120A',
  categories: ['games', 'puzzle'],
  icons: [
    { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: './icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}, null, 2) + '\n');

/* ---------- the worker ---------- */
/* The precache is derived from what actually landed in dist, so nothing can be
   built and then forgotten. The portable file is left out: it is a copy of the
   app for carrying around, and precaching it would double the install. */
const walk = (dir, base = '') => readdirSync(dir).flatMap(f => {
  const full = join(dir, f);
  return statSync(full).isDirectory() ? walk(full, `${base}${f}/`) : [`${base}${f}`];
});
const precache = walk(dist)
  .filter(f => f !== 'sw.js' && f !== 'decanter-standalone.html')
  .map(f => `./${f}`);
precache.unshift('./');

/* Every page on the origin, so a navigation offline can be answered with the
   shell that belongs to it rather than with whichever one happens to be first. */
const shells = ['./index.html', ...games.map(g => `./${g.path}/index.html`)];

const version = 'decanter-' + buildId;
writeFileSync(join(dist, 'sw.js'), `/* generated by tools/build.mjs, do not edit */
const VERSION = '${version}';
const ASSETS = ${JSON.stringify(precache, null, 2)};
const SHELLS = ${JSON.stringify(shells)};

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  /* There is one worker on this origin now. Hashed filenames mean two builds
     cannot collide over an asset, so the games no longer need a cache each to
     keep out of each other's way — which is what left the second game with no
     worker at all, and no offline, for as long as it had its own scope. */
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate'){
    /* Shells are small and they name the bundles, so they are the one thing
       that has to be fresh: a stale shell points at a build that is no longer
       there. no-cache still sends the ETag, so an unchanged shell costs a 304.

       Offline, the fallback is the shell for the path being asked for. Falling
       back to the app for every navigation would serve the pour game at another
       game's URL, which reads as the wrong game loading rather than as being
       offline. */
    const wanted = SHELLS.find(s => url.pathname.replace(/\\/$/, '/index.html').endsWith(s.slice(1)))
      || './index.html';
    e.respondWith(
      fetch(req.url, { cache: 'no-cache' })
        .catch(() => caches.match(wanted, { ignoreSearch: true }))
    );
    return;
  }

  /* Everything under assets/ is named by its own hash, so a hit is not merely
     probably right, it is the exact bytes that name was minted for. Never
     revalidated, never expired. */
  if (url.pathname.includes('/assets/')){
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok && url.origin === location.origin){
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    })));
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok && url.origin === location.origin){
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
`);

/* ---------- what it came to ---------- */
const size = f => readFileSync(join(dist, f)).length;
const kb = n => (n / 1024).toFixed(1) + 'kb';
const critical = size('index.html') + size(appCss) + size(appJs);
console.log('built dist/');
console.log('  index.html                ', kb(size('index.html')), '(shell)');
console.log('  critical path             ', kb(critical), '(shell + app css + app js)');
console.log('  deferred                  ', kb(size(audioJs) + games.filter(g => g.inApp)
  .reduce((n, g) => n + size(g.cssFile) + size(g.jsFile), 0)));
for (const g of games) console.log(`  ${(g.path + '/index.html').padEnd(26)}`, kb(size(`${g.path}/index.html`)),
  `(shell, ${kb(size(g.cssFile) + size(g.jsFile))} of game)`);
console.log('  decanter-standalone.html  ', kb(size('decanter-standalone.html')));
console.log('  sw.js                     ', version, `(${precache.length} precached)`);
