#!/usr/bin/env node
/* Is anything here no longer reached?

   Dead code in this project is not a tidiness question. Every module is inlined
   into one page, so an unused function is bytes in the download the size budget
   is defending, and it is read by the next person as if it still meant
   something. The expensive kind is not the function nobody calls, it is the one
   that used to be called: it still looks load bearing, so it gets maintained,
   and it constrains a refactor it has no stake in.

   Three surfaces, because they rot in three different ways.

   **Exports.** Every module publishes a namespace and nothing else is meant to
   escape. A member of one that nothing reads is dead.

   **Leaks.** Several modules declare their functions at the top level and then
   publish a namespace over them, so the bare names land in the page's one shared
   global scope alongside the other game's. Those are dead by definition, since
   everything goes through the namespace, and they are also the collision the
   suite already worries about from the other end.

   **Classes.** A style rule for a class no element ever carries is dead weight
   the budget pays for on every load.

   The export surface is read by running the modules rather than by matching
   their text. A regex over `return {` was the obvious approach and it is wrong
   in the direction that matters: it silently misses what it cannot parse, so the
   check passes and reports nothing, which is indistinguishable from a clean
   repo. Running them means an export either shows up in `Object.keys` or the
   module did not load, and a module that does not load is a loud failure.

   Run: node tools/verify-dead-code.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const jsIn = dir => readdirSync(join(root, dir)).filter(f => f.endsWith('.js')).sort();

/* Kept deliberately, with the reason. Anything in here is a claim that the
   check is wrong about this one, so it says why in the same breath. */
const KEEP = {
  'Progress.memoryStorage': 'the fallback store for a browser that refuses localStorage. Reached through safeStorage rather than by name, and only when storage throws.',
  'Audio.ready': 'read by the browser suite to prove a bang scheduled before the first gesture is played to nobody.',
  'App._state': 'the diagnostics panel and the browser suite read the live state through it.',
  'App._progress': 'same, for the save.',
  'BubbleApp._state': 'same, for the other game.',
  /* Seams the suites need and the game does not. Each one is here because the
     alternative is a test that hardcodes what it is supposed to be checking. */
  'BubbleGrid.hash': 'a stable summary of a board, so the suites can assert that one seed and one sequence of shots produce the same game twice. Nothing in a turn needs it and nothing should.',
  'Chapters.count': 'how many chapters there are, so the chapter suite can walk all of them and past the end. Without it the suite hardcodes the length of the table it exists to check.',
  'Trace.clear': 'empties the ring between tests. The trace is a fixed size buffer shared by everything, so without this the suite is order dependent.'
};

/* Enough of a browser for a module to finish defining itself. None of them
   should be touching the document at load, and if one starts, it fails here
   loudly rather than being quietly skipped. */
function browserish(){
  const stub = () => new Proxy(function(){}, {
    get: (t, k) => k === Symbol.toPrimitive || k === 'toString' ? () => '' : stub(),
    set: () => true, apply: () => stub(), construct: () => stub(), has: () => true
  });
  const ctx = vm.createContext({
    console, Math, Date, JSON, Set, Map, WeakMap, Object, Array, Number, String, Boolean,
    Infinity, NaN, parseInt, parseFloat, isNaN, isFinite, Promise, RegExp, Error, Symbol,
    Proxy, Reflect, Float32Array, Uint8Array, ArrayBuffer, Intl,
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    requestAnimationFrame: () => 0, cancelAnimationFrame(){},
    queueMicrotask(){}, fetch: () => new Promise(() => {}),
    document: stub(), navigator: stub(), location: stub(), localStorage: stub(),
    addEventListener(){}, removeEventListener(){}, matchMedia: () => stub(),
    getComputedStyle: () => stub(), performance: { now: () => 0 },
    innerWidth: 400, innerHeight: 800, devicePixelRatio: 2, screen: stub()
  });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  return ctx;
}

/* What each file added to the global scope, which is the only way to tell a
   published namespace from a function that merely escaped. */
function surfaceOf(dirs){
  const ctx = browserish();
  const before = new Set(Object.keys(ctx));
  const owner = new Map(), leaked = [];
  for (const dir of dirs){
    for (const f of jsIn(dir)){
      const was = new Set(Object.keys(ctx));
      try { vm.runInContext(read(`${dir}/${f}`), ctx, { filename: f }); }
      catch (e) { throw new Error(`${dir}/${f} will not load: ${e.message}`); }
      for (const k of Object.keys(ctx)){
        if (was.has(k) || before.has(k)) continue;
        /* `globalThis.Name = ...` is the published surface; anything else that
           appeared is a top level declaration that escaped. */
        if (new RegExp(`^globalThis\\.${k}\\s*=`, 'm').test(read(`${dir}/${f}`))) owner.set(k, { dir, f });
        else leaked.push({ name: k, file: `${dir}/${f}` });
      }
    }
  }
  return { ctx, owner, leaked };
}

/* Everything that could refer to something, as one blob per file so a hit can
   be attributed. The built page is excluded: it is generated from these. */
function corpus(){
  const files = [];
  const walk = dir => {
    for (const name of readdirSync(join(root, dir))){
      if (name.startsWith('.') || name === 'node_modules') continue;
      const rel = `${dir}/${name}`;
      if (statSync(join(root, rel)).isDirectory()){
        /* the sound lab's pack cache and generated page are derived */
        if (rel === 'tools/sound-lab') continue;
        walk(rel);
      } else if (/\.(m?js|html|css)$/.test(name)) files.push(rel);
    }
  };
  for (const dir of ['src', 'tests', 'tools']) walk(dir);
  files.push('tools/sound-lab/make.mjs');
  return files.map(f => ({ f, text: read(f) }));
}

const dead = [];
const { ctx, owner, leaked } = surfaceOf(['src/js', 'src/bubble/js']);
const all = corpus();

/* What a given file calls a namespace, which is usually not its name.

   Modules pull them in under one letter, `const C = BubbleConfig`, and then
   every reference is `C.COLS`. The suites rename them on the way out of the
   sandbox, `const { BubbleScore: Sc } = loadBubble()`. Both forms have to be
   understood or the check reports live code as unreachable, which is the
   loudest possible way to be useless: the first draft of this missed the
   renaming form and called three tested functions dead. */
function namesFor(ns, text){
  const names = [ns];
  for (const m of text.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*[;,\n]/g))
    if (m[2] === ns) names.push(m[1]);
  for (const m of text.matchAll(new RegExp(`\\b${ns}\\s*:\\s*([A-Za-z_$][\\w$]*)`, 'g')))
    names.push(m[1]);
  return names;
}

/* Comments name things constantly here, and prose about `boom` is not a call to
   it. Strings are left alone: a class name handed to classList is a real use. */
const code = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/* Does the module that publishes this member also use it?

   Counted rather than stripped. An earlier pass cut the whole `return { ... }`
   block before looking, which also cut the methods inside it, and those are
   where an IIFE wires its own buttons: it reported `Diagnostics.open` as
   unreachable while `mount` was arming a timer on it three lines further down.

   So instead: every mention of the name is counted, and the mentions that are
   only bookkeeping are subtracted. Being listed as an export is one. Being
   declared is another, when the declaration is separate from the listing, which
   it is for a module that declares its functions and publishes them afterwards
   but not for one that defines a method inline. Anything above that is a use. */
function usedAtHome(text, member){
  const src = code(text);
  const mentions = (src.match(new RegExp(`\\b${member}\\b`, 'g')) || []).length;
  const declaredApart = new RegExp(`(?:function|const|let|var)\\s+${member}\\b`).test(src);
  return mentions > 1 + (declaredApart ? 1 : 0);
}

for (const [ns, { dir, f }] of owner){
  const value = ctx[ns];
  if (!value || typeof value !== 'object') continue;
  /* Data tables are keyed by level number and read by index, so their keys are
     not a surface anybody names. */
  if (Object.keys(value).every(k => /^\d+$/.test(k))) continue;
  const home = `${dir}/${f}`;
  const text = read(home);
  for (const member of Object.keys(value)){
    if (KEEP[`${ns}.${member}`]) continue;
    /* Read from anywhere else, under the namespace's name or whatever that file
       calls it, or pulled off it by destructuring. */
    const outside = all.filter(({ f: name, text: other }) => {
      if (name === home) return false;
      if (new RegExp(`\\{[^}]*\\b${member}\\b[^}]*\\}\\s*=\\s*${ns}\\b`).test(other)) return true;
      return namesFor(ns, other).some(n => new RegExp(`\\b${n}\\.${member}\\b`).test(other));
    });
    /* Or used by the module that defines it, which makes it an export nobody
       needed rather than code nobody runs. Those are worth knowing about, but
       they are not what this check is for: the game wires its own buttons, and
       the browser suite drives it through exactly these names. */
    if (usedAtHome(text, member)) continue;
    if (!outside.length){
      dead.push(`${ns}.${member} is published by ${home} and nothing anywhere reads it`);
    } else if (outside.every(({ f: name }) => name.startsWith('tests/'))){
      /* Tested and otherwise unreached. A test does not make code live: it makes
         it code that is checked and never run, which reads exactly like a
         feature and is the most expensive kind of dead there is. This is how
         `BubbleScore.progress` was found, a star bar for a bar the game does not
         draw, correct in every particular and wired to nothing. */
      dead.push(`${ns}.${member} is published by ${home} and only its own tests read it`);
    }
  }
}

/* Nothing may be declared at the top level of a module except the namespace it
   publishes.

   Every source file in both games is concatenated into one `<script>`, so the
   top level of a module is the top level of the page. Two of them declaring the
   same name is not a smell, it is a defect, and which defect depends on the
   keyword: `function` and `var` overwrite in silence, and the later definition
   wins for everybody. `const` and `let` do not even get that far, because a
   redeclaration in one script is a syntax error, and a syntax error in a page
   that is one script is a blank screen.

   The suite already forbids the other game publishing an unprefixed
   `globalThis` name for this reason. It was watching one of the two doors: a
   module that said `function shape(...)` and published `Levels` afterwards put
   `shape`, `deal`, `make`, `at`, `rate` and twenty-five more into the same scope
   the other game's sources are parsed in, and nothing was looking. */
const declared = new RegExp('^(?:const|let|var|function|class)\\s+([A-Za-z_$][\\w$]*)', 'gm');
for (const dir of ['src/js', 'src/bubble/js']){
  for (const f of jsIn(dir)){
    const text = read(`${dir}/${f}`);
    const published = [...text.matchAll(/^globalThis\.(\w+)\s*=/gm)].map(m => m[1]);
    for (const m of code(text).matchAll(declared)){
      if (published.includes(m[1])) continue;
      dead.push(`${dir}/${f} declares \`${m[1]}\` at the top level, which is the page's top level, shared with every other module`);
    }
  }
}

/* Anything that reached the global object without being declared at all. */
for (const { name, file } of leaked)
  dead.push(`${file} puts \`${name}\` on the global object without declaring it`);

/* A class the stylesheets name and no element ever carries. Markup and script
   are searched as text on purpose: a class arrives either in a `class="..."`
   attribute or as a string handed to classList, and both are literals. */
const styled = new Set();
for (const dir of ['src/css', 'src/bubble/css'])
  for (const f of readdirSync(join(root, dir)).filter(n => n.endsWith('.css'))){
    /* Comments first. They are thick here and they name files, so `90-app.js`
       in a comment reads as a class called `js`. */
    const css = read(`${dir}/${f}`).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/\.(-?[a-zA-Z][-\w]*)/g)) styled.add(m[1]);
  }

const markup = ['src/index.html', 'src/bubble/index.html', ...jsIn('src/js').map(f => `src/js/${f}`),
  ...jsIn('src/bubble/js').map(f => `src/bubble/js/${f}`)].map(read).join('\n');
for (const cls of [...styled].sort())
  if (!new RegExp(`['"\`\\s]${cls}(?=['"\`\\s])|['"\`]${cls}['"\`]`).test(markup))
    dead.push(`.${cls} is styled and no element ever carries it`);

if (dead.length){
  for (const line of dead.sort()) console.error(`  ${line}`);
  console.error(`\n${dead.length} dead, unreachable or leaking. Delete them, or add a reason to KEEP in ${'tools/verify-dead-code.mjs'}.`);
  process.exitCode = 1;
} else {
  const members = [...owner.values()].length;
  console.log(`nothing dead: ${members} namespaces, ${styled.size} classes, all reached`);
}
