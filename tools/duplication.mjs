/* What has been written twice in code that ships.

   Not a gate, and the reason is the difference between this and dead code. Dead
   code is a fact about one commit: nothing references it, so the commit that
   added it is the commit that was wrong, and `npm run verify:dead` fails that
   pull request. Duplication is a fact about two commits. The second copy is
   usually reasonable on its own and only reads as a copy next to the first,
   which may have landed months earlier and may be the one that should move. A
   check that failed the second author for the first author's decision would be
   wrong about whose problem it is.

   SHIPPED SOURCES ONLY. `tests/baseline.mjs` is a second implementation of the
   rules on purpose, so the optimized solver has something independent to be
   checked against, and `tools/` is full of small scripts that resemble each
   other because they do resemble each other. Pointing this at either would
   report the test strategy as a defect. See docs/design/14-testing.md.

   Conservative on purpose. It compares normalized lines rather than parsing, so
   it finds copy and paste and does not find two functions that happen to be
   shaped alike. That trade is deliberate: this opens an issue nobody asked for,
   so it has to be right when it speaks or it will be ignored when it matters.

   Run: node tools/duplication.mjs [--ci] */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Walks its own tree rather than borrowing the test helpers' module list, so
   `DUPLICATION_ROOT` can point it at a fixture. A detector that only ever runs
   against the real sources cannot be shown to detect anything, and this one
   reports into an issue once a week where nobody would notice it had gone
   quiet. tests/duplication.test.mjs is what uses the override. */
const root = process.env.DUPLICATION_ROOT
  || join(dirname(fileURLToPath(import.meta.url)), '..');
const CI = process.argv.includes('--ci');

/* How many consecutive lines have to match before it counts. Five is where the
   noise stopped: at three, every `for` loop over the twelve colors matched every
   other one, and none of those were worth folding together. */
const RUN = 5;
/* And how much has to actually be there. Five lines of closing braces are five
   matching lines and nothing worth reporting. */
const MIN_CHARS = 120;

/* Every `.js` under `src/`, whichever game it belongs to. Read off the tree
   rather than listed, so a new game is scanned without this being told. The
   service worker is in there too and is shipped code like the rest. */
function walk(dir){
  const out = [];
  let entries;
  try { entries = readdirSync(dir).sort(); } catch { return out; }
  for (const name of entries){
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(relative(root, full));
  }
  return out;
}
const sources = walk(join(root, 'src'));

/* Comments go first, because this repository writes more prose than code and two
   modules explaining the same decision in similar words is not duplication, it
   is the house style. What is left is normalized so that indentation and spacing
   cannot hide a copy, but names are kept: two blocks doing the same thing to
   different variables are usually two different things. */
function normalize(text){
  const out = [];
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, '');
  noBlock.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, '').trim().replace(/\s+/g, ' ');
    if (!line || /^[{}();,]+$/.test(line)) return;
    out.push({ line, at: i + 1 });
  });
  return out;
}

const files = new Map();
for (const path of sources){
  try { files.set(path, normalize(readFileSync(join(root, path), 'utf8'))); }
  catch { /* a source that will not read is the build's problem, not this one */ }
}

/* Every window of RUN lines, keyed by its text. A window that appears under two
   different keys-in-file is a copy. */
const windows = new Map();
for (const [path, lines] of files){
  for (let i = 0; i + RUN <= lines.length; i++){
    const slice = lines.slice(i, i + RUN);
    const text = slice.map(l => l.line).join('\n');
    if (text.length < MIN_CHARS) continue;
    /* A run of imports is not logic written twice, it is the module system. Two
       files importing the same modules in the same order is what a game's entry
       point and its app are supposed to look like, and reporting it buries the
       findings that are real. */
    if (slice.filter(l => /^(import|export)\b/.test(l.line)).length * 2 > RUN) continue;
    if (!windows.has(text)) windows.set(text, []);
    /* `idx` is the position in the normalized array, `from`/`to` are the real
       line numbers to report. Merging has to use the first: comments and blank
       lines are dropped, so two windows that are neighbors in the scan can be
       twenty lines apart in the file, and arithmetic on line numbers would fail
       to join them exactly where the prose is thickest. */
    windows.get(text).push({ path, idx: i, from: slice[0].at, to: slice[RUN - 1].at });
  }
}

/* A window slides one line at a time, so a twelve line copy matches eight times
   over. Reporting those separately buries the eight real findings under sixty
   restatements of them, which is the failure mode that gets a scheduled check
   ignored.

   Merged rather than filtered, because none of those eight contains the others:
   they are offset from each other. Two windows belong to the same copy when they
   name the same set of files and every one of their ranges steps forward
   together, so they are merged by walking each group in order and extending
   while that holds. */
const groups = new Map();
for (const [text, where] of windows){
  if (where.length < 2) continue;
  const key = where.map(w => w.path).join('|');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ text, where });
}

const kept = [];
for (const hits of groups.values()){
  hits.sort((a, b) => a.where[0].idx - b.where[0].idx);
  let run = null;
  const flush = () => { if (run) kept.push(run); run = null; };
  for (const hit of hits){
    const steps = run && run.where.every((w, i) =>
      hit.where[i] && hit.where[i].path === w.path && hit.where[i].idx === w.idx + 1);
    if (!steps){ flush(); run = { text: hit.text, where: hit.where.map(w => ({ ...w })) }; continue; }
    /* one more line of the same copy: extend every range and the text with it */
    run.where.forEach((w, i) => { w.idx = hit.where[i].idx; w.to = hit.where[i].to; });
    run.text += '\n' + hit.text.split('\n')[RUN - 1];
  }
  flush();
}
const linesOf = h => h.text.split('\n').length;
kept.sort((a, b) => linesOf(b) - linesOf(a) || b.where.length - a.where.length);

/* Reported by which files share code, not by which fragments matched.

   The same pair of modules turns up eight times over, because a copied module is
   copied in several places rather than once, and eight fragments read as eight
   problems. They are one: those two files are the same file. What a person needs
   in order to act is which modules to look at and how much of them is shared,
   with one block as evidence rather than all of them. */
const byPlace = new Map();
for (const hit of kept){
  const key = hit.where.map(w => w.path).join(' == ');
  if (!byPlace.has(key)) byPlace.set(key, { paths: hit.where.map(w => w.path), blocks: [], lines: 0 });
  const g = byPlace.get(key);
  g.blocks.push(hit);
  g.lines += hit.text.split('\n').length;
}
const clusters = [...byPlace.values()].sort((a, b) => b.lines - a.lines);
const biggest = g => g.blocks.reduce((a, b) => (a.text.length >= b.text.length ? a : b));

const say = s => console.log(s);
const total = clusters.reduce((s, g) => s + g.lines, 0);

if (CI){
  say('## Duplicated logic in shipped sources\n');
  if (!clusters.length){
    say(`Nothing. No run of ${RUN} or more lines appears twice across the ${files.size} shipped modules.`);
    say('\nNEEDS_ATTENTION=false');
  } else {
    say(`${total} duplicated lines across ${clusters.length} group(s) of modules. Two copies of the`);
    say('same logic in shipped code are drift waiting to happen: see the deduplication step in');
    say('`CLAUDE.md`. Two independent implementations in `tests/` are a deliberate strategy and are');
    say('not scanned.\n');
    for (const g of clusters.slice(0, 8)){
      const ex = biggest(g);
      say(`### ${g.lines} lines: ${g.paths.map(p => `\`${p}\``).join(' and ')}`);
      say(`\n${g.blocks.length} block(s), the largest being:\n`);
      say('```js');
      for (const line of ex.text.split('\n')) say(line);
      say('```');
      say(`\n<sub>${ex.where.map(w => `${w.path}:${w.from}-${w.to}`).join(' · ')}</sub>\n`);
    }
    if (clusters.length > 8) say(`...and ${clusters.length - 8} more group(s), not listed.`);
    say('\nNEEDS_ATTENTION=true');
  }
} else {
  if (!clusters.length){
    say(`no duplication: no run of ${RUN}+ lines repeats across ${files.size} shipped modules`);
  } else {
    say(`${total} duplicated lines in ${clusters.length} groups across ${files.size} shipped modules\n`);
    for (const g of clusters){
      say(`${String(g.lines).padStart(4)} lines  ${g.paths.join('  ==  ')}`);
      for (const b of g.blocks) say(`           ${b.where.map(w => `${w.from}-${w.to}`).join(' ')}`);
    }
  }
}
