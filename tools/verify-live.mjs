#!/usr/bin/env node
/* What is written down and never used?

   This codebase ships as plain scripts concatenated into one page, so there is
   no bundler to shake a tree and nothing anywhere that notices a function
   nobody calls. Dead code here is not merely untidy: every byte of it is
   downloaded by every player, it is read and maintained by the next person as
   though it mattered, and it is the reason `unlock2` sat in the audio module
   for months making a sound nobody could hear.

   Four things are checked, each a different way of being unused:

     exports   a key on a module's published object that nothing reads
     helpers   a top level function in a module that nothing in it calls
     css       a class in a stylesheet that no markup and no script mentions
     ids       an element id that no script and no stylesheet mentions

   Deliberately conservative. Anything reached dynamically is invisible to a
   textual scan, so a name that appears anywhere at all counts as used, and
   whole categories are allowlisted below with a reason. A detector that cries
   wolf gets switched off, and one that is switched off finds nothing.

   Run: node tools/verify-live.mjs [--json] */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const AS_JSON = process.argv.includes('--json');

const walk = (dir, out = []) => {
  for (const name of readdirSync(join(root, dir))){
    if (name.startsWith('.')) continue;
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
};

const SRC = walk('src');
const js = SRC.filter(f => f.endsWith('.js'));
const css = SRC.filter(f => f.endsWith('.css'));
const html = SRC.filter(f => f.endsWith('.html'));
const tools = walk('tools').filter(f => f.endsWith('.mjs'));
const tests = walk('tests').filter(f => /\.(mjs|js)$/.test(f));

/* Each check builds its own haystack below, and every one of them includes the
   tests: a helper only a test calls is still reachable, and deleting it is a
   worse trade than leaving it. */

/* There is no allowlist.

   There was one, covering two exports, about forty class names and two ids. Each
   was written defensively, before knowing whether it was needed, and emptying
   them one at a time changed nothing: every entry was speculative and not one
   was load-bearing. What they would have done is forgive the first genuinely
   dead `.armed` or `.primary` rule for ever, which is the opposite of the job.

   If something really is reached in a way this cannot see, add it back with the
   evidence that it is real. An allowlist earns its place by muting a false
   positive somebody actually hit. */

/* What a module publishes, as text.

   Two shapes are in use: an IIFE that returns an object, and a plain literal
   assigned straight to globalThis. Returns an empty string when it cannot tell,
   which is the safe answer: an empty published surface makes the checks below
   report more, not less.

   Written once because getting it wrong is silent in both places. Both callers
   originally sliced from the return block with an unbounded end, so on a module
   with no `\n})` the slice ran to the end of the file and everything declared
   after the return counted as published. Two checks reported a clean tree with
   a planted corpse sitting in front of each. */
function publishedSurface(src){
  const flat = src.match(/globalThis\.\w+\s*=\s*\{([\s\S]*?)\}\s*;/);
  if (flat) return flat[1];
  const ret = src.lastIndexOf('\n  return {');
  if (ret < 0) return '';
  const close = src.indexOf('\n})', ret);
  return close < 0 ? '' : src.slice(ret, close);
}

const findings = [];
const add = (kind, name, where, why) => findings.push({ kind, name, where, why });

/* ---- exports nothing reads ---- */
for (const file of js){
  const src = read(file);
  /* Two shapes of publishing, and which one a module uses is decided from the
     publish statement itself rather than guessed.

     Guessing cost a false positive immediately: a module that assigns a literal
     still contains `return {` inside its own functions, so looking for the last
     one found a function body and reported `Levels.if` as a dead export. */
  const flat = src.match(/globalThis\.(\w+)\s*=\s*\{([\s\S]*?)\}\s*;/);
  const wrapped = src.match(/globalThis\.(\w+)\s*=\s*(\w+)\s*;/);
  if (!flat && !wrapped) continue;
  const published = (flat || wrapped)[1];

  const surface = publishedSurface(src);
  const keys = flat
    ? surface.split(',').map(k => k.split(':')[0].trim()).filter(k => /^\w+$/.test(k))
    : [...surface.matchAll(/^\s{4}(?:get |set )?(\w+)\s*[(:,]/gm)].map(x => x[1]);
  if (!keys.length) continue;

  const others = [...js, ...html, ...tools, ...tests].filter(f => f !== file).map(read).join('\n');
  for (const key of new Set(keys)){
    /* `.key` anywhere, or destructured out of the module */
    const used = new RegExp(`\\.${key}\\b|\\b${key}\\s*[,}]`).test(others);
    if (!used) add('export', `${published}.${key}`, file, 'published and nothing reads it');
  }
}

/* ---- helpers a module declares and never calls ----

   Scoped to the file, because that is the whole point: a module level function
   is private to its module, so if that module does not call it, nothing can.

   Indented or not. Matching only the two-space form meant only the modules that
   wrap an IIFE were looked at, and the ones publishing a plain object write
   theirs at column zero: sixteen functions across `20-rules.js` and
   `40-progress.js` alone, none of them checked, while the gate reported a clean
   tree. */
for (const file of js){
  /* The concatenated page modules only. The premise above is that a module level
     function is private, and that is true of everything inlined into the page and
     false of the worker: `tests/helpers.mjs` loads `src/worker/solver.js` through
     `new Function` with an internals export appended, so its private helpers are
     reachable and tested. Scoped by how a file is loaded rather than by a list of
     names, because the exception is structural and a name list would drift. */
  if (!/^src\/(js|bubble\/js)\//.test(file)) continue;
  const src = read(file);
  for (const m of src.matchAll(/^ {0,2}function (\w+)\s*\(/gm)){
    const name = m[1];
    /* every mention of the name that is not its own declaration */
    const uses = [...src.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].length;
    if (uses > 1) continue;
    /* it may still be published, which the export check above already covers */
    if (new RegExp(`\\b${name}\\b`).test(publishedSurface(src))) continue;
    add('helper', name, file, 'declared in this module and nothing in it calls');
  }
}

/* ---- css classes nothing mentions ---- */
const markup = [...html, ...js, ...tests].map(read).join('\n');
for (const file of css){
  for (const m of read(file).matchAll(/^\.([a-zA-Z][-\w]*)/gm)){
    const cls = m[1];
    if (new RegExp(`\\b${cls}\\b`).test(markup)) continue;
    add('css', `.${cls}`, file, 'styled and nothing wears it');
  }
}

/* ---- ids nothing reaches ---- */
const scripts = [...js, ...tools, ...tests, ...css].map(read).join('\n');
for (const file of html){
  for (const m of read(file).matchAll(/\sid="([\w-]+)"/g)){
    const id = m[1];
    if (new RegExp(`['"\`#]${id}\\b`).test(scripts)) continue;
    add('id', `#${id}`, file, 'in the markup and nothing reaches it');
  }
}

if (AS_JSON){
  console.log(JSON.stringify(findings, null, 1));
} else if (!findings.length){
  console.log(`nothing dead across ${SRC.length} source files`);
} else {
  for (const f of findings) console.error(`${f.where}  ${f.kind} ${f.name} — ${f.why}`);
  console.error(`\n${findings.length} dead. Delete it, use it, or allowlist it with a reason in tools/verify-live.mjs.`);
  process.exitCode = 1;
}
