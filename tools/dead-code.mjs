#!/usr/bin/env node
/* What is in the build that nothing uses.

   Every module here is an IIFE that hands back an object and parks it on
   globalThis, and every stylesheet and page is inlined whole. Nothing is tree
   shaken, because there is no bundler to do it: anything left on a public object
   ships to the player, and anything named in a stylesheet ships whether or not a
   page ever grows that class. So dead code is not untidiness, it is bytes in the
   budget and a reader's time, and neither the linter nor the tests can see it.

   Deliberately conservative, because this runs in `npm run check` and a detector
   that cries wolf gets switched off. The rule is a name-based reachability test:
   a member is dead when its name appears *nowhere else in the repository*, not
   when it is missing a qualified `Module.member` call. Modules alias each other
   constantly (`const G = BubbleGrid`, `const { BubbleApp: A } = globalThis`) and
   a qualified search would call half the codebase dead. The cost of the loose
   rule is a member sharing a name with an unrelated local somewhere, which stays
   invisible; that is the right way round for a check that gates a merge.

   Run: node tools/dead-code.mjs [--json] */
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []){
  for (const name of readdirSync(dir)){
    if (name.startsWith('.') || name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/* What ships to a player, as opposed to what merely exists in the repository. A
   name used only by a test or a tool is still dead weight in the build, and
   saying which side of that line a finding falls on is the difference between
   "delete it" and "it is fine, the harness needs it". */
const isShipped = f => f.startsWith('src/');

/* ---- the members each module hands out ----

   Found by taking the object at the end of the module, which is either the
   IIFE's own `return { ... }` or the literal in `globalThis.X = { ... }`. Brace
   counted rather than matched with a pattern, because these objects contain
   nested objects, getters and arrow bodies full of braces. */
export function objectAt(src, from){
  let depth = 0;
  for (let i = from; i < src.length; i++){
    if (src[i] === '{') depth++;
    else if (src[i] === '}'){ depth--; if (!depth) return src.slice(from + 1, i); }
  }
  return '';
}

/* Keys at the top level of an object body: shorthand, `name:`, and accessors.
   Anything nested inside braces, brackets or parens belongs to a value and is
   skipped, or every property of every object literal in a method body would be
   reported as a module member. */
export function keysOf(body){
  const keys = [];
  let depth = 0, i = 0;
  /* A key is only a key where one can appear: at the top of the object, and not
     part way through somebody's value. `count: CHAPTERS.length` taught this the
     hard way, by contributing a member called `length`. It went unreported
     because `length` is written everywhere, which is the worst kind of wrong: a
     detector quietly reporting on a name nobody ever declared. */
  let expectKey = true;
  while (i < body.length){
    const ch = body[i];
    if (ch === '/' && body[i + 1] === '*'){ const e = body.indexOf('*/', i); i = e < 0 ? body.length : e + 2; continue; }
    if (ch === '/' && body[i + 1] === '/'){ const e = body.indexOf('\n', i); i = e < 0 ? body.length : e + 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`'){
      i++;
      while (i < body.length && body[i] !== ch){ if (body[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') { depth++; i++; continue; }
    if (ch === '}' || ch === ']' || ch === ')') { depth--; i++; continue; }
    /* a comma at the top of the object ends a value and opens the next key */
    if (ch === ',' && depth === 0){ expectKey = true; i++; continue; }

    if (expectKey && depth === 0){
      const m = /^(?:(?:get|set)\s+)?([A-Za-z_$][\w$]*)\s*(:|\(|,|\}|\n|$)/.exec(body.slice(i));
      if (m && !['return', 'function', 'const', 'let', 'var', 'new', 'typeof'].includes(m[1])){
        keys.push(m[1]);
        /* `name:` and `name(` both open a value, and everything up to the next
           top-level comma belongs to it. Shorthand does not, so the scanner
           stays ready for the next name. */
        const opensValue = m[2] === ':' || m[2] === '(';
        if (opensValue) expectKey = false;
        i += m[0].length - m[2].length;
        if (m[2] === ':') i++;
        continue;
      }
    }
    i++;
  }
  return [...new Set(keys)];
}

/* The whole scan, as a function rather than as work done on import, so the suite
   can assert that it examined something. A checker wired into a merge gate that
   quietly matches nothing reports a clean repository forever, which is worse
   than not having one: the green tick is the whole product. */
export function scan(){
const all = walk(root).filter(p => /\.(js|mjs|css|html)$/.test(p));
const files = new Map(all.map(p => [relative(root, p), readFileSync(p, 'utf8')]));

const modules = [];
for (const [file, src] of files){
  if (!/^src\/.*\.js$/.test(file)) continue;
  for (const m of src.matchAll(/^globalThis\.([A-Za-z_$][\w$]*)\s*=\s*/gm)){
    const name = m[1];
    const after = src.slice(m.index + m[0].length);
    let members = [];
    if (after.startsWith('{')){
      members = keysOf(objectAt(src, m.index + m[0].length));
    } else if (/^Object\.freeze\(/.test(after)){
      members = [];                       /* a data table, not an interface */
    } else {
      /* `globalThis.X = X` after an IIFE: take the module's last return object */
      const ret = [...src.matchAll(/\breturn\s*\{/g)].pop();
      if (ret) members = keysOf(objectAt(src, ret.index + ret[0].length - 1));
    }
    modules.push({ file, name, members });
  }
}

/* ---- how often a name is written down anywhere ---- */
const counts = new Map();          /* name -> Map(file -> hits) */
function tally(name){
  if (counts.has(name)) return counts.get(name);
  const per = new Map();
  const re = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g');
  for (const [file, src] of files){
    const n = (src.match(re) || []).length;
    if (n) per.set(file, n);
  }
  counts.set(name, per);
  return per;
}

/* Two severities, because they call for different things.

   Dead is dead: nothing in the repository names it, so it can only be deleted.
   Test-only is a judgement call, so it is reported and does not fail: a member
   the suite reaches for directly is often exactly right, and a check that
   demanded those be deleted would be asking for a worse test suite. It is still
   worth printing, because the other half of the time it is a hole poked in a
   module for one assertion that the public path could have made instead. */
const findings = [], notes = [];
const add = (kind, where, what, note) => findings.push({ kind, where, what, note });
const note = (where, what, why) => notes.push({ where, what, why });

for (const mod of modules){
  const used = tally(mod.name);
  const elsewhere = [...used.keys()].filter(f => f !== mod.file && f !== 'eslint.config.js');
  if (!elsewhere.length) add('global', mod.file, mod.name, 'nothing outside this file names it');
  else if (!elsewhere.some(isShipped)) note(mod.file, mod.name, `only ${elsewhere.join(', ')}`);

  for (const key of mod.members){
    const per = tally(key);
    const others = [...per.keys()].filter(f => f !== mod.file);
    if (!others.length) add('member', mod.file, `${mod.name}.${key}`, 'nothing outside this file names it');
    else if (!others.some(isShipped)) note(mod.file, `${mod.name}.${key}`, `only ${others.join(', ')}`);
  }
}

/* ---- stylesheets ----

   Class and id selectors only. Element and attribute selectors are shared with
   the document at large and saying `p` is unused means nothing. */
const markup = [...files].filter(([f]) => f.endsWith('.html'));
const scripts = [...files].filter(([f]) => /\.(js|mjs)$/.test(f));

const namedIn = (list, name) => {
  const re = new RegExp(`\\b${name}\\b`);
  return list.some(([, src]) => re.test(src));
};

/* Selector text only: everything before a `{`, with the previous block's tail
   dropped. Scanning the whole stylesheet reads `#FBEBC8` in a declaration as an
   id and reports the paint as dead, which is the kind of finding that teaches
   people to ignore the tool. */
const selectorText = css => css.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('{')
  .map(chunk => { const end = chunk.lastIndexOf('}'); return end < 0 ? chunk : chunk.slice(end + 1); })
  .join('\n');

for (const [file, src] of files){
  if (!/^src\/.*\.css$/.test(file)) continue;
  const selectors = new Set();
  for (const m of selectorText(src).matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)) selectors.add(m[0]);
  for (const sel of selectors){
    const name = sel.slice(1);
    if (namedIn(markup, name) || namedIn(scripts, name)) continue;
    add('style', file, sel, 'no page or script ever names it');
  }

  /* Custom properties are declared in one stylesheet and read from any of them,
     so both halves are gathered across the whole build rather than per file. */
  for (const m of src.matchAll(/(--[\w-]+)\s*:/g)){
    const used = [...files].some(([f, s]) =>
      /\.(css|js|html)$/.test(f) && new RegExp(`var\\(\\s*${m[1]}\\b`).test(s));
    if (!used) add('style', file, m[1], 'declared and never read');
  }
}

/* ---- pages ----

   An id in the markup that no script reaches is a handle on nothing. The
   reverse, a script reaching for an id no page has, is worse: it is a silent
   null every time that line runs, so it is reported as its own kind. */
const idsInMarkup = new Map();
for (const [file, src] of markup)
  for (const m of src.matchAll(/\bid="([^"]+)"/g)) idsInMarkup.set(m[1], file);

for (const [id, file] of idsInMarkup){
  if (namedIn(scripts, id)) continue;
  const styled = [...files].some(([f, s]) => f.endsWith('.css') && new RegExp(`#${id}\\b`).test(s));
  if (!styled) add('page', file, `#${id}`, 'no script or stylesheet ever names it');
}

for (const [file, src] of scripts){
  if (!isShipped(file)) continue;
  for (const m of src.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)){
    if (!idsInMarkup.has(m[1])) add('missing', file, `#${m[1]}`, 'reached for by a script, present in no page');
  }
}

  /* `examined` is not decoration. It is what a test asserts against so that a
     regex quietly matching nothing cannot pass as a clean repository. */
  return { findings, notes, examined: {
    files: files.size,
    modules: modules.length,
    members: modules.reduce((n, m) => n + m.members.length, 0),
    ids: idsInMarkup.size
  } };
}

/* ---- say it ---- */
const isEntry = process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntry){
const AS_JSON = process.argv.includes('--json');
const { findings, notes } = scan();
if (AS_JSON){
  console.log(JSON.stringify({ findings, notes }, null, 1));
} else {
  const titles = {
    missing: 'ids a script reaches for and no page has',
    global: 'modules nothing else uses',
    member: 'members no other file names',
    style: 'selectors and properties nothing uses',
    page: 'ids nothing reaches for'
  };
  for (const kind of ['missing', 'global', 'member', 'style', 'page']){
    const mine = findings.filter(f => f.kind === kind);
    if (!mine.length) continue;
    console.log(`\n${titles[kind]}:`);
    for (const f of mine) console.log(`  ${f.where}  ${f.what}  (${f.note})`);
  }
  console.log(findings.length ? `\n${findings.length} dead` : 'nothing dead');

  if (notes.length){
    console.log(`\nreached for only outside the build, which may be right (${notes.length}):`);
    for (const n of notes) console.log(`  ${n.where}  ${n.what}  (${n.why})`);
  }
}
process.exit(findings.length ? 1 : 0);
}
