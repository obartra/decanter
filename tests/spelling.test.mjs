/* One spelling, everywhere.

   This repo was written in two hands. The stylesheets say `color`, because that
   is how the CSS property is spelled and there was never a choice about it, and
   the JavaScript beside them said `color`. Both appeared in `30-levels.js`, one
   in the code and one in the comment above it, and the solver and the module
   that calls it disagreed across the boundary. Nothing broke, because nothing
   was shared across the two, which is exactly why it survived: a spelling split
   costs nothing until somebody greps for the wrong half of it and concludes the
   thing they are looking for is not there.

   So: American, and checked rather than agreed. A convention that lives only in
   a document is one that holds until the next person who has not read it.

   This is a word list, not a dictionary. It knows the British forms that were
   actually in this repo when the sweep ran, which is the honest scope: it will
   not catch a form nobody has typed yet, and adding one when it appears is the
   whole maintenance burden. A checker that tried to be a dictionary would be
   wrong about proper nouns and jargon on its first run and switched off by its
   second. */
import { describe, it, equal, read, root } from './helpers.mjs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/* British form, and what to write instead. The double-l words are spelled out
   rather than stemmed on purpose: American English keeps the double l in
   `cancellation`, so a `cancell` stem would fail a correctly spelled word and
   teach whoever hit it that the check is wrong. */
const BRITISH = [
  ['colour', 'color'],
  ['behaviour', 'behavior'],
  ['neighbour', 'neighbor'],
  ['honour', 'honor'],
  ['flavour', 'flavor'],
  ['favourite', 'favorite'],
  ['synthesise', 'synthesize'],
  ['normalis', 'normaliz'],
  ['recognis', 'recogniz'],
  ['discretis', 'discretiz'],
  ['maximis', 'maximiz'],
  ['optimis', 'optimiz'],
  ['organis', 'organiz'],
  ['analyse', 'analyze'],
  ['centre', 'center'],
  ['grey', 'gray'],
  ['licence', 'license'],
  ['defence', 'defense'],
  ['artefact', 'artifact'],
  ['whilst', 'while'],
  ['amongst', 'among'],
  ['towards', 'toward'],
  ['cancelled', 'canceled'],
  ['cancelling', 'canceling'],
  ['labelled', 'labeled'],
  ['labelling', 'labeling'],
  ['modelled', 'modeled'],
  ['modelling', 'modeling'],
  ['travelled', 'traveled'],
  ['travelling', 'traveling'],
  ['traveller', 'traveler']
];

/* Alegreya is a typeface and it contains `grey`. It is the only proper noun in
   the repo that collides with the list, and it is why this strips before it
   scans rather than keeping an allowlist of files: the collision is in the word,
   not in the file that happens to hold it.

   Case-insensitively, because the name appears twice over in two shapes: as
   `"Alegreya Sans"` in a font stack and as `alegreyasans.woff2` on disk. The
   sweep that introduced this rule matched only the first, renamed the file in
   every reference to it, and left a build that could not find its own font.

   `draught` is not on the list at all. It is the game's economy term, a drink
   drawn from a cask, and `draft` is a different word. */
const PROPER = /alegreya/gi;

const SKIP = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report', '.claude', 'package-lock.json']);
const TEXT = /\.(m?js|css|html|md|json|yml|py)$/;
/* This file names every word it is looking for, so scanning it finds all of
   them. Skipping it is a hole, and a small one: it is a list of string literals
   with no prose in it. */
const SELF = 'tests/spelling.test.mjs';

const sources = () => {
  const out = [];
  const walk = dir => {
    for (const name of readdirSync(dir).sort()){
      if (SKIP.has(name)) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (TEXT.test(name)) out.push(relative(root, p));
    }
  };
  walk(root);
  return out.filter(p => p !== SELF);
};

describe('spelling', () => {
  it('is American everywhere, in code and in prose', () => {
    const wrong = [];
    for (const file of sources()){
      const lines = read(file).replace(PROPER, '').split('\n');
      lines.forEach((line, i) => {
        for (const [british, american] of BRITISH){
          if (new RegExp(british, 'i').test(line))
            wrong.push(`${file}:${i + 1} says ${british}, write ${american}`);
        }
      });
    }
    equal(wrong, [], 'these are British spellings');
  });

  it('looks at the files it thinks it does', () => {
    /* The guard on the guard. A walk that silently returned nothing, or stopped
       at the first directory, would report a clean repo for ever. The three
       named here are one source file, one document and one tool, so a walk that
       loses any whole branch of the tree fails here rather than passing. */
    const seen = sources();
    for (const f of ['src/js/pure/00-config.js', 'docs/DESIGN.md', 'tools/build.mjs', 'CLAUDE.md'])
      equal(seen.includes(f), true, `the scan never reached ${f}`);
    equal(seen.length > 100, true, `the scan only found ${seen.length} files`);
  });
});
