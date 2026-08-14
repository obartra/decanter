/* Pulls the visible sentences out of a shell and marks them for translation.

   Run once per shell to bootstrap: it rewrites the markup so every translatable
   node carries a `data-t` key, and prints the English table to paste into
   src/i18n/en.js. The keys are derived from the text so a diff of the table
   reads as prose rather than as renumbering.

   Deliberately not part of the build. The build substitutes; this is the one
   time pass that decides what the keys are, and a key that changes silently
   because somebody reworded a sentence is how a translation goes stale without
   anything failing.

   Run: node tools/extract-strings.mjs src/index.html [--write] */
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const write = process.argv.includes('--write');
let html = readFileSync(file, 'utf8');

/* Comments and scripts are not the page. The shells carry more comment than
   markup, and every one of those sentences would otherwise become a key. */
const masked = html.replace(/<!--[\s\S]*?-->/g, m => '\0'.repeat(m.length))
                   .replace(/<(script|style)[\s\S]*?<\/\1>/g, m => '\0'.repeat(m.length));

const slug = s => s.toLowerCase().replace(/&[a-z]+;/g, ' ').replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '').split('-').slice(0, 5).join('-');

/* An element marked `data-t-html` owns everything inside it, tags and all. Those
   are the sentences broken across a `<b>` or a `<span>`: translating the pieces
   separately gives a translator no way to reorder them, and Catalan and Spanish
   both need to. So its insides are masked out before anything else is found. */
let whole = masked;
for (const m2 of html.matchAll(/<([a-zA-Z0-9]+)[^>]*data-t-html[^>]*>([\s\S]*?)<\/\1>/g)){
  const at = m2.index + m2[0].indexOf(m2[2]);
  whole = whole.slice(0, at) + '\0'.repeat(m2[2].length) + whole.slice(at + m2[2].length);
}

const seen = new Map();
const hits = [];
/* Text between tags, and the attributes a screen reader reads. */
const RE = />([^<>]+)</g;
let m;
while ((m = RE.exec(whole))){
  const raw = m[1];
  const text = raw.trim();
  if (!text || /^[\s&#0-9;.+\-—–]*$/.test(text)) continue;
  const key = slug(text);
  if (!key) continue;
  if (seen.has(key) && seen.get(key) !== text) continue;
  seen.set(key, text);
  hits.push({ start: m.index + 1, len: raw.length, raw, text, key });
}

/* Rewritten back to front so earlier offsets stay valid. */
for (const h of [...hits].reverse()){
  const before = html.slice(0, h.start);
  const tagStart = before.lastIndexOf('<');
  const tag = html.slice(tagStart, h.start);
  if (/data-t=/.test(tag)) continue;
  const marked = tag.replace(/^(<[a-zA-Z0-9]+)/, `$1 data-t="${h.key}"`);
  html = before.slice(0, tagStart) + marked + html.slice(h.start);
}

console.log(`${hits.length} phrases in ${file}`);
for (const h of hits) console.log(`  ${h.key}: ${JSON.stringify(h.text)},`);
if (write){ writeFileSync(file, html); console.log('\nmarkup rewritten'); }
