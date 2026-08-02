#!/usr/bin/env node
/* What is here that nothing uses?

   This repo has always taken a position on dead surface — there is a test that
   fails when a sound is defined and never played, written after two of the
   biggest moments in the bubble game turned out to be silent while every test
   passed. That test only ever covered sounds. This is the same idea over
   everything else, and it was written after a review found `MeasureRules.canPour`
   defined, published, and read by nobody.

   An uncalled function is not an error. It does not throw, it does not slow
   anything down, and it reads exactly like code that works — which is why it
   survives review and why it needs a machine to notice it.

   FOUR KINDS, and they fail for different reasons:

   - **globals** a module publishes that nothing else names. The module is
     talking to itself through the global scope.
   - **exports**, the members of the object a module returns, that nothing calls.
     This is where `canPour` was.
   - **config keys** nothing reads. A tunable nobody tunes against is a comment
     with a number in it, and this repo's config comments are load-bearing, so
     the difference matters.
   - **CSS classes** with no markup, and markup with no CSS. Both directions,
     because a class that lost its rule looks identical to one that never had one.

   NO PARSER. Everything here is string matching, which means it can be fooled —
   so every check errs toward silence. A name built at runtime, or reached
   through a computed property, will look used, and that is the right way round:
   a detector that cries wolf gets turned off.

   Run: node tools/dead-code.mjs [--verbose] */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const VERBOSE = process.argv.includes('--verbose');

/* Deliberate exceptions, each with the reason it is one. An entry here is a
   decision; an empty list would mean this file had never met the codebase. */
const ALLOW = {
  global: {
    App: 'the entry point: nothing imports it, the page runs it',
    LabApp: 'the same, for the lab page',
    Diagnostics: 'reached from the console by somebody reading a bug report, which is the whole point of it',
    LAST_LEVEL: 'read through globalThis by modules that must load without it',
    ORDER: 'the same: a generated table read defensively',
    MeasureOrder: 'the same',
    CasksBoards: 'the same',
    MeasurePars: 'the same',
    CasksPars: 'the same',
    PARS: 'the same'
  },
  export: {
    'src/js/05-trace.js#dump': 'read out loud off the diagnostics panel, not called in code',
    'src/lab/js/90-app.js#pickGame': 'driven from the browser suite and by hand',
    'src/lab/js/90-app.js#sweep': 'the same'
  },
  config: {
    /* nothing yet, and that is the interesting part */
  },
  css: {
    'src/css/01-base.css#jabari': 'the easter egg builds its class list in one string; see 90-app.js'
  }
};

const allowed = (kind, key) => Object.prototype.hasOwnProperty.call(ALLOW[kind], key);

/* ---- what there is to look at ---- */
const dirsIn = p => readdirSync(join(root, p), { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name);

/* Every directory of sources: the pour game, and every page with a js/ of its
   own. Found rather than listed, the way the build and the lint config find
   them, so a new one is covered the day it appears. */
const areas = [
  { id: 'src', js: 'src/js', css: 'src/css', html: ['src/index.html'] },
  ...dirsIn('src')
    .filter(d => existsSync(join(root, 'src', d, 'js')))
    .map(d => ({ id: d, js: `src/${d}/js`, css: `src/${d}/css`, html: [`src/${d}/index.html`] }))
];

const jsFiles = dir => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter(f => f.endsWith('.js')) : []);
const cssFiles = dir => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter(f => f.endsWith('.css')) : []);

/* Everything that could possibly name something, so "nothing uses this" is a
   claim about the whole repo rather than about one directory. */
function everything(){
  const out = [];
  const walk = p => {
    for (const name of readdirSync(join(root, p), { withFileTypes: true })){
      if (name.name.startsWith('.') || name.name === 'node_modules' || name.name === 'dist') continue;
      const rel = `${p}/${name.name}`;
      if (name.isDirectory()) walk(rel);
      else if (/\.(js|mjs|html|css|md)$/.test(name.name)) out.push(rel);
    }
  };
  for (const top of ['src', 'tools', 'tests']) walk(top);
  return out.map(p => ({ path: p, text: read(p) }));
}
const CORPUS = everything();

/* Where a name is used, split three ways, because the three mean different
   things and only two of them are faults.

   The first version of this excluded the defining file, and so reported every
   function an event handler calls from inside its own module. That is the wrong
   question. A name used inside its module is not dead code however few files
   mention it; what may be dead is the EXPORT. Whereas a name used by nothing at
   all, or used only by the test written for it, is dead however public it looks.

   `internal` deliberately ignores the definition itself and the return list, or
   everything would look used by virtue of existing. */
function uses(name, definedIn){
  const word = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  const dotted = new RegExp(`\\.${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);

  const own = CORPUS.find(f => f.path === definedIn);
  let internal = false;
  if (own){
    const body = own.text
      /* Both ways a module publishes, removed before asking whether anything
         uses the name — otherwise appearing in the list of what is offered
         counts as somebody wanting it, and nothing is ever unused. The
         single-line form was already handled; the object-literal form assigned
         straight to globalThis was not, so six of the pour game's modules could
         export anything they liked and it would read as used. */
      .replace(/\nglobalThis\.\w+\s*=\s*\{[\s\S]*?\n?\};/, '')
      .replace(/^globalThis\.\w+\s*=.*$/gm, '')
      .replace(/\n\s{2}return \{[\s\S]*?\n?\s*\};/, '')
      .replace(new RegExp(`^\\s*(?:function|const|let)\\s+${name}\\b.*$`, 'gm'), '');
    internal = (body.match(word) || []).length > 0;
  }

  const outside = CORPUS.filter(f => f.path !== definedIn && (word.test(f.text) || dotted.test(f.text)))
    .map(f => f.path);
  return {
    internal,
    tests: outside.filter(p => p.startsWith('tests/')),
    elsewhere: outside.filter(p => !p.startsWith('tests/'))
  };
}

/* The one judgement in this file. A thing is dead when nothing but its own
   declaration mentions it, or when the only thing that mentions it is the test
   written to mention it — a test is not a reason for code to exist. Anything
   used inside its own module is alive, and whether it also needs to be public is
   a smaller question this tool raises quietly rather than failing over. */
function verdict(u){
  if (!u.internal && !u.elsewhere.length && !u.tests.length) return 'dead';
  if (!u.internal && !u.elsewhere.length && u.tests.length) return 'tests only';
  if (!u.elsewhere.length && u.internal) return 'private';
  return 'alive';
}

const findings = [];
/* raised, not failed on: an export nothing outside needs is a smaller thing
   than an export nothing needs at all */
const quiet = [];
const note = (kind, where, what) => findings.push({ kind, where, what });

/* ---- 1. published globals ---- */
for (const area of areas){
  for (const f of jsFiles(area.js)){
    const path = `${area.js}/${f}`;
    for (const m of read(path).matchAll(/^globalThis\.(\w+)\s*=/gm)){
      const name = m[1];
      if (allowed('global', name)) continue;
      const v = verdict(uses(name, path));
      if (v === 'dead') note('global', `${path}#${name}`, 'published and named nowhere at all');
      else if (v === 'tests only') note('global', `${path}#${name}`, 'published, and named only by its own test');
      else if (v === 'private') quiet.push(`${path}#${name} is global but only its own file uses it`);
    }
  }
}

/* ---- 2. members of the object a module returns ---- */
/* Only the returned object, not the module body: a `if (` at the same
   indentation reads as a method named `if` otherwise. The same scan the sound
   test has always used, widened to every module. */
function exportsOf(src){
  /* Two ways a module says what it offers, and both have to be read.

     Most wrap an IIFE and `return { … }`. Six of the pour game's older modules
     are plain scripts that assign the object straight to globalThis instead.
     Only the first was looked for at first, so those six were never checked at
     all — which is the failure mode this whole file exists to catch, arriving
     inside the thing meant to catch it. */
  const at = Math.max(src.lastIndexOf('\n  return {'),
                      src.search(/\nglobalThis\.\w+ = \{/));
  if (at < 0) return [];
  /* Just the object, found by counting braces, rather than everything from here
     to the end of the file. Scanning the tail caught locals out of any object
     literal that happened to sit inside a method — `pourNode = { s, g, air, r1,
     r2 }` reported `r2` as an export of the sound module. Harmless, since it
     only ever reached the quiet list, and wrong, which is enough. */
  let depth = 0, end = at;
  for (let i = src.indexOf('{', at); i < src.length; i++){
    if (src[i] === '{') depth++;
    else if (src[i] === '}'){ depth--; if (!depth){ end = i + 1; break; } }
  }
  const tail = src.slice(at, end);
  const stop = ['get', 'set', 'if', 'for', 'while', 'return', 'switch', 'catch', 'function'];
  const names = new Set();
  /* `foo(){`, `foo: fn`, and the shorthand `foo,` / `foo };` on one line */
  for (const m of tail.matchAll(/^\s{4}(?:get\s+|set\s+)?(\w+)\s*[({:]/gm)) names.add(m[1]);
  /* `{ first, second }` — after an opening brace as well as after a comma. It
     used to require a comma, so the FIRST name in every single-line object was
     invisible, which a planted probe on Rules caught and no amount of reading
     did. */
  /* Not `${name}`. A template interpolation is a brace followed by a word
     followed by a brace, which is exactly the shape being looked for, so the
     first version of this reported a local inside a template string as an
     export of the module it sat in. */
  for (const m of tail.matchAll(/(?<!\$)[{,]\s*(\w+)\s*(?=[,}])/g)) names.add(m[1]);
  return [...names].filter(n => !stop.includes(n));
}

for (const area of areas){
  for (const f of jsFiles(area.js)){
    const path = `${area.js}/${f}`;
    const key = `${path}#`;
    for (const name of exportsOf(read(path))){
      if (allowed('export', key + name)) continue;
      const v = verdict(uses(name, path));
      if (v === 'dead') note('export', key + name, 'returned by the module and named nowhere at all');
      else if (v === 'tests only') note('export', key + name, 'returned by the module, and called only by its own test');
      else if (v === 'private') quiet.push(`${key}${name} is exported but only its own module calls it`);
    }
  }
}

/* ---- 3. config keys ---- */
for (const area of areas){
  const cfgPath = `${area.js}/00-config.js`;
  if (!existsSync(join(root, cfgPath))) continue;
  const src = read(cfgPath);
  const readers = CORPUS.filter(f => f.path !== cfgPath);
  for (const m of src.matchAll(/^ {2}(\w+):/gm)){
    const key = m[1];
    if (allowed('config', `${cfgPath}#${key}`)) continue;
    /* `.KEY` covers C.KEY, CONFIG.KEY and BubbleConfig.KEY alike */
    const re = new RegExp(`\\.${key}\\b`);
    /* a derived value assigned further down its own config still counts */
    const selfDerived = new RegExp(`\\.${key}\\s*=`).test(src);
    if (!readers.some(f => re.test(f.text)) && !selfDerived){
      note('config', `${cfgPath}#${key}`, 'a tunable nothing reads');
    }
  }
}

/* ---- 4. CSS classes, both directions ---- */
/* Every class any stylesheet in the repo defines. Pages share sheets — the app
   carries the bubble game's markup and its stylesheet both — so "is this styled"
   is a question about the whole build. */
const ALL_STYLED = new Set();
for (const area of areas){
  for (const f of cssFiles(area.css)){
    for (const m of read(`${area.css}/${f}`).matchAll(/\.([a-zA-Z][-\w]*)/g)) ALL_STYLED.add(m[1]);
  }
}

for (const area of areas){
  const sheets = cssFiles(area.css);
  if (!sheets.length) continue;
  const declared = new Set();
  for (const f of sheets){
    for (const m of read(`${area.css}/${f}`).matchAll(/\.([a-zA-Z][-\w]*)/g)) declared.add(m[1]);
  }
  /* Everything that could carry a class for this area: its own page, its own
     scripts, and — for the pour game, whose markup holds every view — the other
     pages too. */
  const carriers = CORPUS.filter(f =>
    f.path.startsWith(area.js) || area.html.includes(f.path) || f.path.endsWith('index.html'));
  const carried = carriers.map(f => f.text).join('\n');

  for (const cls of declared){
    if (allowed('css', `${area.css}#${cls}`)) continue;
    if (!new RegExp(`\\b${cls}\\b`).test(carried)){
      note('css', `${area.css}#${cls}`, 'a rule with no markup and no script that adds it');
    }
  }

  /* And the other way: markup wearing a class no stylesheet defines.

     Against EVERY stylesheet, not this area's. The app page carries the bubble
     game's markup, because some of its levels are that game, and the bubble
     game's stylesheet ships in the same page to style it — so an area-by-area
     check called a dozen live classes orphans. What is being asked here is
     whether anything anywhere styles this, and the answer has to be looked for
     everywhere the answer could be. */
  for (const page of area.html){
    if (!existsSync(join(root, page))) continue;
    for (const m of read(page).matchAll(/class="([^"]+)"/g)){
      for (const cls of m[1].split(/\s+/)){
        if (!cls) continue;
        /* `js-` is a hook, not a style. A class the scripts query and nothing
           paints is the convention working, not a rule that went missing, and
           the prefix is what says which one it is. */
        if (cls.startsWith('js-')) continue;
        if (ALL_STYLED.has(cls)) continue;
        if (allowed('css', `${page}#${cls}`)) continue;
        note('css', `${page}#${cls}`, 'markup wearing a class no stylesheet defines');
      }
    }
  }
}

/* ---- say so ---- */
const order = ['global', 'export', 'config', 'css'];
const label = { global: 'published globals', export: 'module exports', config: 'config keys', css: 'styles' };
findings.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.where.localeCompare(b.where));

if (!findings.length){
  console.log(`nothing dead across ${areas.length} source areas and ${CORPUS.length} files`);
  if (VERBOSE){
    for (const kind of order){
      const n = Object.keys(ALLOW[kind]).length;
      if (n) console.log(`  ${n} ${label[kind]} allowed on purpose`);
    }
    if (quiet.length){
      console.log(`\n${quiet.length} could be narrower, none of them a fault:`);
      for (const q of quiet) console.log(`  ${q}`);
    }
  }
} else {
  let last = '';
  for (const f of findings){
    if (f.kind !== last){ console.error(`\n${label[f.kind]}:`); last = f.kind; }
    console.error(`  ${f.where}\n      ${f.what}`);
  }
  console.error(`\n${findings.length} dead, across ${areas.length} source areas.`);
  console.error('Delete it, use it, or add it to ALLOW in tools/dead-code.mjs with the reason.');
  process.exitCode = 1;
}
