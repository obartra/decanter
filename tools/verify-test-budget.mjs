/* Does the browser suite still spend its time where it should?

   The size budget next door asks the same question about bytes, and this exists
   for the same reason: nothing about adding a test tells you what it cost. The
   suite is the slowest thing anyone runs here, it is the thing they run last
   before pushing, and a spec that quietly becomes half of it is paid for by
   every run afterwards by everyone.

   It measures **shares, not seconds**. That is the whole design decision and it
   is worth stating plainly, because seconds are the obvious thing to budget and
   they are the wrong thing. A cap in seconds is a statement about the machine
   that ran the suite: this one has fourteen cores and clears it in three and a
   half minutes, a CI runner has four and takes considerably longer, and a cap
   generous enough not to fail on the slow one is too loose to catch anything on
   the fast one. Worse, it would fail for a reason nobody can act on, which is
   how a check gets switched off.

   A share is the same number on every machine. Everything gets slower together,
   so the ratio holds, and the regression this is actually here to catch is one
   spec growing until it dominates. That is what happened: `money.spec.js` was
   a fifth of the suite's time in ten of its three hundred and seventy eight
   tests, because it plays whole levels pour by pour and waits for every
   animation to land. Which is the right way for it to be written. It is what
   the suite exists for, and it is not a bug. What it is, is a fact about the
   suite that nothing was reporting.

   So this fails on shape and reports the seconds without judging them. The
   seconds are still worth printing: they are how you notice the whole suite
   drifting, which no share can show you.

   Reads the JSON report the suite already wrote, so it never runs the suite
   again. Run `npm run test:e2e` first, then: node tools/verify-test-budget.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Where the suite left its report, or wherever you say. On CI the suite runs in
   four shards and this reads the one merged out of them, which lands in the same
   place; the argument is for reading a report kept somewhere else. */
const report = process.argv[2] ? join(root, process.argv[2]) : join(root, 'test-results/report.json');

/* One spec may be the most expensive thing in the suite. It may not be a
   quarter of it. The heaviest is `interleave.spec.js` at 17.9%, and the three
   above 16% are within a percent of each other, which is the shape wanted: no
   single file is the suite. A quarter is the next round number up, close enough
   to be a real cap and far enough that an honest test added to the heaviest
   spec does not trip it.

   The per-test share is the other shape that goes wrong, and it goes wrong
   quietly: not a file full of slow tests but one test that plays the longest
   level in the game twice. The slowest is 3.7%, and it is the one test that
   deliberately runs at full motion. */
const SPEC_SHARE = 0.25;
const TEST_SHARE = 0.05;

if (!existsSync(report)){
  console.error('no test-results/report.json: run npm run test:e2e first');
  process.exit(1);
}

/* Playwright nests suites inside suites, one level per describe, and hangs the
   file on whichever level knows it. Walking rather than reading the top level is
   the difference between measuring the suite and measuring the specs that happen
   to have no describe around them. */
const specs = [];
const walk = (node, file) => {
  const here = node.file || file;
  for (const spec of node.specs || []){
    const ms = (spec.tests || [])
      .flatMap(t => t.results || [])
      .reduce((sum, r) => sum + (r.duration || 0), 0);
    specs.push({ file: spec.file || here, title: spec.title, ms });
  }
  for (const child of node.suites || []) walk(child, here);
};
for (const suite of JSON.parse(readFileSync(report, 'utf8')).suites || []) walk(suite, suite.file);

if (!specs.length){
  console.error('the report has no tests in it, so this measured nothing');
  process.exit(1);
}

const total = specs.reduce((s, x) => s + x.ms, 0);
const byFile = new Map();
for (const s of specs) byFile.set(s.file, (byFile.get(s.file) || 0) + s.ms);

const secs = ms => `${(ms / 1000).toFixed(1)}s`;
const pct = ms => `${((ms / total) * 100).toFixed(1)}%`;

console.log(`\n${specs.length} tests, ${secs(total)} of test time\n`);
const ranked = [...byFile].sort((a, b) => b[1] - a[1]);
for (const [file, ms] of ranked.slice(0, 8))
  console.log(`  ${pct(ms).padStart(6)}  ${secs(ms).padStart(8)}  ${file}`);

const over = [];
for (const [file, ms] of ranked){
  if (ms / total > SPEC_SHARE)
    over.push(`${file} is ${pct(ms)} of the suite, over the ${SPEC_SHARE * 100}% one spec may take`);
}
const slowest = [...specs].sort((a, b) => b.ms - a.ms)[0];
if (slowest.ms / total > TEST_SHARE)
  over.push(`"${slowest.title}" is ${pct(slowest.ms)} of the suite on its own, over ${TEST_SHARE * 100}%`);

console.log(`\n  slowest test: ${secs(slowest.ms)} (${pct(slowest.ms)})  ${slowest.title}`);

if (over.length){
  console.error('\nover budget:');
  for (const line of over) console.error(`  ${line}`);
  console.error('\nSplit it, or raise the cap in tools/verify-test-budget.mjs and say why.');
  process.exit(1);
}
console.log('\nthe suite spends its time where it should\n');
