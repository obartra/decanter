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
/* The name a module is known by, whichever folder it sits in. */
const base = p => p.slice(p.lastIndexOf('/') + 1);

/* Every source under a directory, in load order.

   Walks rather than lists, because the modules that run without a DOM live in a
   `pure/` folder beside the ones that do not. Ordered by filename and never by
   path: the number on the front of a module is its place in the load order, and
   which folder it was filed under must not be able to change that. Sorting by
   path would put all of `pure/` after everything at the top level, which is a
   different program. */
const sorted = dir => {
  const out = [];
  const walkIn = rel => {
    const here = join(root, dir, rel);
    for (const f of readdirSync(here).filter(n => !n.startsWith('.')).sort()){
      const p = rel ? `${rel}/${f}` : f;
      if (statSync(join(root, dir, p)).isDirectory()) walkIn(p); else out.push(p);
    }
  };
  walkIn('');
  return out.sort((a, b) => (base(a) < base(b) ? -1 : base(a) > base(b) ? 1 : 0));
};
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
  { name: 'casks',   path: 'casks',   inApp: false },
  /* Not a game, and built exactly like one. The lab is a workbench that opens
     the pages above in frames and reaches into them, so it needs precisely what
     they need — its own bundle, its own shell, its own place in the precache —
     and nothing they do not. Listing it here rather than teaching the build a
     second kind of page is the cheaper honesty: "game" in this file has always
     meant "a page with sources of its own", and now it says so out loud. */
  { name: 'lab',     path: 'lab',     inApp: false }
].filter(g => existsSync(join(root, `src/${g.path}/index.html`))
           && existsSync(join(root, `src/${g.path}/js`))
           && existsSync(join(root, `src/${g.path}/css`)));

/* ---------- what the app does not need in order to open ----------

   Named groups of the app's own sources, each fetched after the page has opened
   and awaited by whatever needs it. Named here rather than by a number range,
   because "critical" is a judgement about what a file is for and not a property
   of where it sorts.

   This was a flat list of scripts while there was one thing on it, and that
   shape had two limits that only showed up when a second thing wanted off the
   critical path. It could hold one group, so everything on it was fetched under
   one name and awaited together. And it was scripts only, so a screen could
   defer its code and not its stylesheet, which for the card below would have
   been a third of it left behind.

   A group is js, css or both. The fetching side needed nothing for either: a
   group has been a list of urls since the games went into it, and
   96-deferred.js has always told a stylesheet from a script by its extension.
   The build is what could only say "a game". */
const DEFERRED = {
  /* Every cue the game plays. 49-audio.js answers all of them silently and
     remembers the sound setting until this lands, which is the thing that makes
     deferring it safe at all. */
  audio: { js: ['50-audio.js'] },
  /* The card shown before a replay. Nothing on it is reachable until somebody
     taps a medallion for a level they have already cleared, so on the critical
     path it was downloaded by every player and read by the ones who go back.

     Not the still it draws. 78-still.js and 05-still.css are shared with the
     shelf the blast offers, which is mid-run and cannot wait for a fetch, and
     those two were made shared on purpose after two hand-rolled copies of a
     small bottle disagreed about what a half empty one looks like. */
  preview: { js: ['46-preview.js'], css: ['06-preview.css'] }
};

/* ---------- gathering sources ---------- */
/* Concatenated in filename order with the same markers the single file has
   always used, so a stack trace in the built page still names the module. The
   marker is the filename and not the path, because it is there to be recognised
   in a stack trace and `pure/` is not part of how anyone refers to a module. */
const concat = (dir, files) =>
  files.map(f => `\n/* ---- ${base(f)} ---- */\n${read(`${dir}/${f}`)}`).join('\n');

const cssOf = (dir, files) => files.map(f => read(`${dir}/css/${f}`)).join('\n');

/* `css` and `js` are what a page loads to open; `allCss` and `all` are the same
   sources with nothing held back, which is what the portable file inlines and
   what the build id is taken over. A game holds nothing back, so for one of the
   games the two pairs are the same text.

   What is skipped is matched on the filename, never the path, for the reason
   the ordering is: which folder a module was filed under is not part of how
   anyone refers to it, and a group naming `pure/46-preview.js` would be naming
   a filing decision it has no business knowing about. */
function sourcesOf(dir, { skipJs = [], skipCss = [] } = {}){
  const js = sorted(`${dir}/js`);
  const css = sorted(`${dir}/css`);
  return {
    css: cssOf(dir, css.filter(f => !skipCss.includes(base(f)))),
    js: concat(`${dir}/js`, js.filter(f => !skipJs.includes(base(f)))),
    allCss: cssOf(dir, css),
    all: concat(`${dir}/js`, js)
  };
}

const held = kind => Object.values(DEFERRED).flatMap(g => g[kind] || []);
/* Every name this build mints a bundle under, so a group cannot take one that is
   already spoken for.

   Not only the games, which was the obvious half and the harmless one. `app` is
   the dangerous name: a group called that would emit assets/app-<other hash>.css
   beside the real one and overwrite nothing, so nothing would throw, and then
   both verify-budget.mjs and the suite would pick whichever of the two readdir
   handed them first. The critical path check would measure the deferred group
   and report a page load 250kb lighter than it is, which is the one number that
   check exists to be right about. */
const MINTED = ['app', 'solver', ...GAMES.map(g => g.name)];
for (const name of Object.keys(DEFERRED)){
  if (MINTED.includes(name))
    throw new Error(`the deferred group "${name}" already names a bundle, so the two would be told apart by readdir order`);
}

const app = sourcesOf('src', { skipJs: held('js'), skipCss: held('css') });
const solver = read('src/worker/solver.js');
/* The only recording anything here ships, and only Jabari mode plays it. Read
   once because both builds want the same bytes and the build id wants its
   hash. */
const boom = readFileSync(join(root, 'assets/audio/boom.mp3'));
const games = GAMES.map(g => ({ ...g, src: sourcesOf(`src/${g.path}`) }));

/* One id for the build, over every source that ships anywhere in dist.

   Every game, not only the ones the app page carries. There is one cache now,
   and activate() deletes every key that is not this version — so if a game
   changed and the id did not, the worker would reopen the same cache, add the
   newly named bundles beside the superseded ones, and never sweep them: the
   install would grow a little every release, forever. The build stamp on that
   game's own page would be wrong too, which is the one thing the stamp exists
   to be right about.

   The app's own stylesheet was the one source this claimed to cover and did
   not: every game's css was in here and `app.all` is scripts only, so editing
   src/css/ minted a newly named bundle under an unchanged version, which is
   exactly the release-on-release growth described above. It ran the other way
   too, and worse: a page kept stamping the build id of the last script change
   while showing a stylesheet from a later one. */
const buildId = hash([app.allCss, app.all, solver,
  ...games.map(g => g.src.css + g.src.all)].join('\n')
  + boom.toString('base64'));

/* ---------- emitting ---------- */
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });
cpSync(join(root, 'assets/fonts'), join(dist, 'fonts'), { recursive: true });
cpSync(join(root, 'assets/icons'), join(dist, 'icons'), { recursive: true });
cpSync(join(root, 'assets/audio'), join(dist, 'audio'), { recursive: true });

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
const solverJs = asset('solver', 'js', solver);
/* One bundle per group per kind, under the group's own name. The stylesheet is
   listed first, the way a game's is, so its request goes out first.

   Only that. It is worth saying what does NOT follow from the order, because it
   looks like it should: 96-deferred.js appends every url in a group in the same
   tick, and `async = false` orders scripts against each other and says nothing
   about a stylesheet, so a group's script can run before its stylesheet has
   landed. What keeps a card from being drawn into rules that are not there yet
   is that `ready` does not settle until all of them have. */
/* A group names its modules the way everything else does, by filename, so the
   folder has to be looked up rather than assumed: 46-preview.js runs without a
   DOM and therefore lives in src/js/pure/, and reading it from src/js/ would
   fail the build on a file that is right where it belongs. Resolved through the
   same walk that orders the bundle, so there is one answer to where a module is.

   A name that matches nothing is a group that silently ships empty, so it is
   caught here rather than left to be noticed as a screen that stops working. */
const pathsIn = (dir, names) => {
  const found = sorted(dir).filter(f => names.includes(base(f)));
  const missing = names.filter(n => !found.some(f => base(f) === n));
  if (missing.length) throw new Error(`deferred: ${dir} has no ${missing.join(', ')}`);
  return found;
};
const deferredAssets = {};
for (const [name, group] of Object.entries(DEFERRED)){
  const urls = [];
  if (group.css) urls.push(href(0, asset(name, 'css', cssOf('src', pathsIn('src/css', group.css)))));
  if (group.js) urls.push(href(0, asset(name, 'js', concat('src/js', pathsIn('src/js', group.js)))));
  deferredAssets[name] = urls;
}
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
  const groups = { ...deferredAssets };
  for (const g of games.filter(x => x.inApp)) groups[g.name] = [href(0, g.cssFile), href(0, g.jsFile)];
  return groups;
};
const appPage = page('src/index.html', {
  '<!--BUILD-->': `<meta name="build" content="${buildId}">`,
  '<!--PWAHEAD-->': pwaHead,
  /* Where the bang is. A tag rather than a fetch of a known path, so the two
     builds can answer it differently and nothing in the audio module has to know
     which kind of build it is running in. Not a preload: almost nobody ever
     hears it, and it is fetched on demand. */
  '<!--BOOM-->': `<meta name="boom" content="./audio/boom.mp3">`,
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
   Every group goes back in line with the rest (`allCss` and `all` rather than
   the two the app page loads), and an empty deferred slot is how 96-deferred.js
   is told there is nothing to wait for. */
const dataFont = p => 'data:font/woff2;base64,' + readFileSync(join(root, p)).toString('base64');
const standalone = page('src/index.html', {
  '<!--BUILD-->': `<meta name="build" content="${buildId}">`,
  '<!--PWAHEAD-->': '',
  /* Inlined for the same reason the fonts are: to a browser, a file:// page
     fetching a sibling path is a cross origin request, so a portable file that
     pointed at ./audio/ would fall silently back to the synthesised bang the
     moment it left the folder it was built in. */
  '<!--BOOM-->': `<meta name="boom" content="data:audio/mpeg;base64,${boom.toString('base64')}">`,
  '<!--FONTS-->': fontFace(dataFont('assets/fonts/cinzel.woff2'),
                           dataFont('assets/fonts/alegreyasans.woff2'),
                           dataFont('assets/fonts/alegreyasans-bold.woff2')),
  '<!--SOLVER-->': `<script id="solverSrc" type="text/js-worker">${solver}</script>`,
  '<!--CSS-->': `<style>${[app.allCss, ...games.filter(g => g.inApp).map(g => g.src.css)].join('\n')}</style>`,
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
   shell that belongs to it rather than with whichever one happens to be first.

   The directory travels WITH the shell rather than being recovered from it. The
   first version stored the paths alone and matched with `endsWith`, which is
   true of './index.html' for every one of them — '/bubble/index.html' ends with
   '/index.html' — so every page offline fell back to the pour game's shell.
   That is precisely the failure the fallback exists to prevent, and it passed a
   test that only ever checked the list. */
const shells = games.map(g => [g.path, `./${g.path}/index.html`]);

const version = 'decanter-' + buildId;
/* The worker is a source file now, stamped rather than assembled. Its three
   constants are replaced; everything else ships exactly as it reads in
   src/sw.js, which is what puts it under lint and under the dead-code check. */
writeFileSync(join(dist, 'sw.js'), read('src/sw.js')
  .replace("const VERSION = 'decanter-dev';", `const VERSION = '${version}';`)
  .replace("const ASSETS = ['./'];", `const ASSETS = ${JSON.stringify(precache, null, 2)};`)
  .replace('const SHELLS = [];', `const SHELLS = ${JSON.stringify(shells)};`));

/* ---------- what it came to ---------- */
const size = f => readFileSync(join(dist, f)).length;
const kb = n => (n / 1024).toFixed(1) + 'kb';
const critical = size('index.html') + size(appCss) + size(appJs);
console.log('built dist/');
console.log('  index.html                ', kb(size('index.html')), '(shell)');
console.log('  critical path             ', kb(critical), '(shell + app css + app js)');
const deferred = Object.values(deferredAssets).flat().reduce((n, u) => n + size(u.replace('./', '')), 0)
  + games.filter(g => g.inApp).reduce((n, g) => n + size(g.cssFile) + size(g.jsFile), 0);
console.log('  deferred                  ', kb(deferred),
  `(${Object.keys(deferredFor()).join(', ')})`);
for (const g of games) console.log(`  ${(g.path + '/index.html').padEnd(26)}`, kb(size(`${g.path}/index.html`)),
  `(shell, ${kb(size(g.cssFile) + size(g.jsFile))} of game)`);
console.log('  decanter-standalone.html  ', kb(size('decanter-standalone.html')));
console.log('  sw.js                     ', version, `(${precache.length} precached)`);
