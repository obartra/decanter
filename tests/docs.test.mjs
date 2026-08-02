/* The docs are the only part of this repo nothing was checking, and it showed.
   A row in the README described `assets/art/`, a folder of painted backdrops
   that does not exist and by the design notes' own account never should: the
   room is drawn. Two counts had drifted, and a claim about the bubble game
   having its own service worker outlived the worker by some margin.

   None of that is catchable in general. What is catchable is the mechanical
   half: a link that goes nowhere, a design document nothing indexes, a path
   named in a table that is not on disk. Those are the ways a doc rots without
   anybody touching it, and they are exactly the ways a reader loses trust in
   the rest of it. */
import { describe, it, assert, equal, read, root } from './helpers.mjs';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';

const docs = ['README.md', 'docs/DESIGN.md',
  ...readdirSync(join(root, 'docs/design')).sort().map(f => `docs/design/${f}`)];

/* Markdown inline links, minus the ones that point off this machine. A bare
   `#anchor` is a jump inside the same page and has no file to find. */
const linksIn = doc => [...read(doc).matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)]
  .map(m => m[1])
  .filter(href => !/^(https?:|mailto:|#)/.test(href));

describe('the documents', () => {
  it('links nothing that is not there', () => {
    for (const doc of docs){
      for (const href of linksIn(doc)){
        /* relative to the document that names it, and anchors are not paths */
        const target = normalize(join(root, dirname(doc), href.split('#')[0]));
        assert(existsSync(target), `${doc} links ${href}, which does not exist`);
      }
    }
  });

  it('indexes every design document, and indexes nothing else', () => {
    /* An unindexed document is worse than a missing one: it is written, it is
       wrong by the time anybody finds it, and the index is what said it was not
       there. */
    const onDisk = readdirSync(join(root, 'docs/design')).filter(f => f.endsWith('.md')).sort();
    const indexed = linksIn('docs/DESIGN.md')
      .filter(h => h.startsWith('design/'))
      .map(h => h.slice('design/'.length))
      .sort();
    for (const f of onDisk)
      assert(indexed.includes(f), `docs/design/${f} exists and DESIGN.md does not index it`);
    for (const f of indexed)
      assert(onDisk.includes(f), `DESIGN.md indexes ${f}, which is not in docs/design/`);
  });

  it('runs every check it has in the workflow that gates a change', () => {
    /* A check nobody runs is not a check. `npm run check` is the local gate and
       CI is the one that can actually say no, and they are two lists that have
       to be kept in step by hand: `verify:dead` was written, wired into `check`,
       and would have gone to main without CI ever running it, because the
       workflow names its steps one at a time rather than calling `check`.

       Which it should keep doing: the split into two jobs is what stops a typo
       waiting behind a browser download. This just says that nothing added to
       one list can go missing from the other. */
    const scripts = JSON.parse(read('package.json')).scripts;
    const ci = read('.github/workflows/ci.yml');
    for (const name of Object.keys(scripts).filter(n => n.startsWith('verify:')))
      assert(ci.includes(`npm run ${name}`),
        `${name} is a check nothing in CI runs, so it cannot fail a pull request`);
  });

  it('names no path that is not on disk', () => {
    /* Every `backtick/path/` in a table cell across the docs. Only the ones that
       look like repo paths: a trailing slash, or a known source extension. That
       is narrow on purpose, because the alternative is a check that trips over
       every `CONFIG.economy` and gets switched off.

       Anything starting `./` is a URL in the built page rather than a path in
       the repo. The docs discuss those on purpose, and they are the build's to
       get right, not this check's. */
    const looksLikePath = s => /^\w[\w.-]*\/[\w./-]*$/.test(s) &&
      (s.endsWith('/') || /\.(m?js|css|html|json|md|py|woff2|mp3|webmanifest)$/.test(s));
    for (const doc of docs){
      const named = [...read(doc).matchAll(/`([^`]+)`/g)].map(m => m[1]).filter(looksLikePath);
      for (const p of new Set(named)){
        /* dist/ is built, not committed, and the docs are allowed to say so */
        if (p === 'dist/' || p.startsWith('dist/')) continue;
        assert(existsSync(join(root, p)), `${doc} names ${p}, which is not in the repo`);
      }
    }
  });

  /* The list in the doc and the list in the tool's own header both went stale
     when three checks were folded in from a second detector and neither was
     updated. A detector whose description omits a check is one nobody thinks to
     plant a corpse for. */
  it('names every kind the dead code detector can report', () => {
    const tool = read('tools/verify-live.mjs');
    const kinds = [...new Set([...tool.matchAll(/\badd\('(\w+)'/g)].map(m => m[1]))];
    assert(kinds.length > 4, `only found ${kinds.length} kinds, so the scan is wrong`);
    const doc = read('docs/design/14b-ci.md');
    /* the header's own list, indented under "things are checked" */
    const listed = [...tool.matchAll(/^ {5}(\w+) {2,}\w/gm)].map(m => m[1]);
    for (const kind of kinds){
      assert(doc.includes(`\`${kind}\``), `14b-ci.md never mentions the ${kind} check`);
      assert(listed.some(l => l.startsWith(kind)),
        `verify-live.mjs reports ${kind} and its own header does not list it`);
    }
    equal(listed.length, kinds.length,
      'the header lists a different number of checks than the tool reports');
  });
});
