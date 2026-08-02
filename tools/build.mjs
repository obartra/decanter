#!/usr/bin/env node
/* Build: inline every source file into dist/index.html, copy assets, emit the
   manifest and a service worker whose cache name changes with the content. */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, cpSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const read = p => readFileSync(join(root, p), 'utf8');
const sorted = dir => readdirSync(join(root, dir)).filter(f => !f.startsWith('.')).sort();

/* Gathers one game's sources. Factored out so a second game can be built the
   same way; called with 'src' it produces character for character what this
   used to compute inline, so the existing build id does not move. */
function bundle(dir, { worker } = {}){
  const css = sorted(`${dir}/css`).map(f => read(`${dir}/css/${f}`)).join('\n');
  const js  = sorted(`${dir}/js`).map(f => `\n/* ---- ${f} ---- */\n${read(`${dir}/js/${f}`)}`).join('\n');
  const solver = worker ? read(worker) : '';
  return { css, js, solver, id: createHash('sha256').update(css + js + solver).digest('hex').slice(0, 10) };
}

const main = bundle('src', { worker: 'src/worker/solver.js' });
const bub = bundle('src/bubble');

/* The only recording the game ships, and only Jabari mode plays it. Read here
   rather than in `compose` because both pages want the same bytes and the build
   id wants their hash. */
const boom = readFileSync(join(root, 'assets/audio/boom.mp3'));

/* The app page carries both games, because some of its levels are the other
   one. The bubble sources go in after, so the pour game's modules are all
   defined by the time anything reads them, and nothing in this bundle touches
   BubbleApp until a bubble level is actually opened.

   They still build a separate page at /bubble/ from the same sources. That page
   is the whole game on its own and is how the mechanic gets worked on without
   playing ten levels to reach one. */
const css = `${main.css}\n${bub.css}`;
const js = `${main.js}\n${bub.js}`;
const solver = main.solver;

/* One id for the build, stamped into the page and used as the cache name, so
   "which version am I actually looking at" is a question with an answer. It has
   to cover the bubble sources too now that they ship inside this page, or a
   change to them would leave every installed copy on the old worker. The same
   goes for the boom: swapping the recording without touching a line of code
   would otherwise leave every installed copy playing the old one forever. */
const buildId = createHash('sha256').update(css + js + solver).update(boom).digest('hex').slice(0, 10);

const fontFace = (cinzel, sans, sansBold) => `<style>
@font-face{font-family:'Cinzel';font-style:normal;font-weight:400 700;font-display:swap;src:url(${cinzel}) format('woff2')}
@font-face{font-family:'Alegreya Sans';font-style:normal;font-weight:400;font-display:swap;src:url(${sans}) format('woff2')}
@font-face{font-family:'Alegreya Sans';font-style:normal;font-weight:700;font-display:swap;src:url(${sansBold}) format('woff2')}
</style>`;

/* The backdrops arrive as custom properties so the stylesheets never name a
   path. The installable build points them at cacheable files; the portable one
   inlines the bytes, which is the only way a single file can still be a cellar. */
const pwaHead = `<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" href="./icons/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">`;

/* Where the bang is. A tag rather than a fetch of a known path, so the two pages
   can answer it differently: the installable build points at a cacheable file,
   the portable one carries the bytes, and nothing in the audio module has to
   know which kind of build it is running in. Not a preload — almost nobody ever
   hears this, and it is fetched on demand. */
function compose({ fonts, head, boomSrc }){
  return read('src/index.html')
    .replace('<!--BUILD-->', `<meta name="build" content="${buildId}">`)
    .replace('<!--BOOM-->', () => `<meta name="boom" content="${boomSrc}">`)
    .replace('<!--PWAHEAD-->', head)
    .replace('<!--FONTS-->', fonts)
    .replace('<!--CSS-->', () => css)
    .replace('<!--SOLVER-->', () => solver)
    .replace('<!--JS-->', () => js);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'assets/fonts'), join(dist, 'fonts'), { recursive: true });
cpSync(join(root, 'assets/icons'), join(dist, 'icons'), { recursive: true });
cpSync(join(root, 'assets/audio'), join(dist, 'audio'), { recursive: true });

/* 1. the installable app, fonts and the boom as separate cacheable files. The
   room is drawn at runtime, so there is no art to ship. */
const app = compose({
  fonts: fontFace('./fonts/cinzel.woff2', './fonts/alegreyasans.woff2', './fonts/alegreyasans-bold.woff2'),
  head: pwaHead,
  boomSrc: './audio/boom.mp3'
});
writeFileSync(join(dist, 'index.html'), app);

/* 2. one portable file, fonts and the boom inlined, opens straight off disk.
   The bang has to be inlined for the same reason the fonts are: a file:// page
   fetching a sibling path is a cross origin request to a browser, so a portable
   file that pointed at ./audio/ would fall back to the synthesised bang the
   moment it left the folder it was built in. */
const font = p => 'data:font/woff2;base64,' + readFileSync(join(root, p)).toString('base64');
writeFileSync(join(dist, 'decanter-standalone.html'), compose({
  fonts: fontFace(font('assets/fonts/cinzel.woff2'),
                  font('assets/fonts/alegreyasans.woff2'),
                  font('assets/fonts/alegreyasans-bold.woff2')),
  head: '',
  boomSrc: 'data:audio/mpeg;base64,' + boom.toString('base64')
}));

/* 3. the bubble game, at its own subpath. Its own sources, its own id and its
   own service worker scope, so the two games cannot cache over each other. The
   fonts are shared, reached with a relative path out of the subfolder, because
   a second copy of the same three files is dead weight in the precache. */
const bubblePage = read('src/bubble/index.html')
  .replace('<!--BUILD-->', `<meta name="build" content="${bub.id}">`)
  .replace('<!--FONTS-->', fontFace('../fonts/cinzel.woff2', '../fonts/alegreyasans.woff2',
                                    '../fonts/alegreyasans-bold.woff2'))
  .replace('<!--CSS-->', () => bub.css)
  .replace('<!--JS-->', () => bub.js);
mkdirSync(join(dist, 'bubble'), { recursive: true });
writeFileSync(join(dist, 'bubble', 'index.html'), bubblePage);

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

/* precache list is derived from what actually landed in dist */
const walk = (dir, base = '') => readdirSync(dir).flatMap(f => {
  const full = join(dir, f);
  return statSync(full).isDirectory() ? walk(full, `${base}${f}/`) : [`${base}${f}`];
});
const assets = walk(dist)
  /* The bubble game is deliberately left out. It is a separate page at a
     separate path with its own build id, and precaching it here would mean this
     worker holding a copy that only this build knows how to invalidate. */
  .filter(f => f !== 'sw.js' && f !== 'decanter-standalone.html' && !f.startsWith('bubble/'))
  .map(f => `./${f}`);
assets.unshift('./');

const version = 'decanter-' + buildId;
writeFileSync(join(dist, 'sw.js'), `/* generated by tools/build.mjs, do not edit */
const VERSION = '${version}';
const ASSETS = ${JSON.stringify(assets, null, 2)};

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      /* Only this game's old caches. There is a second game on this origin with
         its own worker, and a filter of "everything that is not me" means
         whichever activated last emptied the other's precache. The two would
         take turns breaking each other, visible only offline. */
      .then(keys => Promise.all(keys.filter(k => k.startsWith('decanter-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate'){
    /* This worker's scope covers the whole origin, including the other game's
       subpath. Falling back to this game's page for a navigation there would
       serve Decanter at the Bubble URL, which looks like the wrong game loading
       rather than like being offline. */
    if (new URL(req.url).pathname.includes('/bubble/')){
      e.respondWith(fetch(req).catch(() => Response.error()));
      return;
    }
    /* Revalidate the page every time. The whole app is inlined into index.html,
       so a cached page is cached *code*: with the host's max-age on HTML, a plain
       fetch() can serve a build that is minutes old and no reload will shift it.
       no-cache still sends the ETag, so an unchanged page costs a 304. */
    e.respondWith(
      fetch(req.url, { cache: 'no-cache' })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok && new URL(req.url).origin === location.origin){
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
`);

const kb = n => (n / 1024).toFixed(1) + 'kb';
console.log('built dist/');
console.log('  index.html               ', kb(app.length));
console.log('  decanter-standalone.html ', kb(readFileSync(join(dist, 'decanter-standalone.html')).length));
console.log('  sw.js                    ', version, `(${assets.length} precached)`);
