/* What actually happened to players, against what the model said would.

   The brick rate in docs/difficulty.json is a greedy player that never solves a
   board. It is a proxy for how much a board punishes not searching, and it was
   never a prediction about people — tools/brick-core.mjs says so at length. The
   ceiling built on it is a judgement about how much frustration a player will
   take, and a judgement is what you have until you have a measurement.

   This is the measurement. A player holds the gold count, taps copy, and pastes
   what comes out. That text has a `levels lost` section in it, and this folds
   one or more of those pastes back against the model.

   Nothing is collected and there is no endpoint. The game runs offline and
   15-diagnostics.md calls that not negotiable, so the data arrives the way a bug
   report arrives: somebody sends it to you. Two beta players is two messages.

   Run: node tools/endings.mjs <paste.txt> [more.txt ...]
        pbpaste | node tools/endings.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ceilingFor } from './brick-core.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2);

function readAll(){
  if (files.length) return files.map(f => ({ name: f, text: readFileSync(f, 'utf8') }));
  return [{ name: 'stdin', text: readFileSync(0, 'utf8') }];
}

/* `  19: stuck 4 cleared 1`, the shape 85-diagnostics.js writes. Tolerant of the
   surrounding report changing, because the report is written for a person to
   read and will. */
const ROW = /^\s*(\d+):\s*((?:[a-z ]+\s+\d+\s*)+)$/;

function parse(text){
  const rows = new Map();
  for (const line of text.split('\n')){
    const m = line.match(ROW);
    if (!m) continue;
    const by = {};
    for (const pair of m[2].matchAll(/([a-z ]+?)\s+(\d+)/g)) by[pair[1].trim()] = Number(pair[2]);
    rows.set(Number(m[1]), by);
  }
  return rows;
}

/* One player's counts are one player's counts. Pooling them is the only way two
   betas add up to a sample, and the per-player split is kept so a level that
   only ever beat one of them is visible as that rather than as a trend. */
const pasted = readAll();
const pooled = new Map();
const perPlayer = [];
for (const { name, text } of pasted){
  const rows = parse(text);
  perPlayer.push({ name, levels: rows.size });
  for (const [level, by] of rows){
    const into = pooled.get(level) || {};
    for (const [why, n] of Object.entries(by)) into[why] = (into[why] || 0) + n;
    pooled.set(level, into);
  }
}

if (!pooled.size){
  console.log('no `levels lost` rows found. Paste the whole diagnostics dump, not just part of it.');
  process.exit(1);
}

const curve = JSON.parse(readFileSync(join(root, 'docs/difficulty.json'), 'utf8')).levels;
const modeled = new Map(curve.map(r => [r.level, r.brick]));
const pct = n => `${(n * 100).toFixed(1)}%`;

const rows = [];
for (const [level, by] of [...pooled].sort((a, b) => a[0] - b[0])){
  const cleared = by.cleared || 0;
  const stuck = by.stuck || 0;
  const lost = Object.entries(by).filter(([w]) => w !== 'cleared').reduce((s, [, n]) => s + n, 0);
  const runs = cleared + lost;
  if (!runs) continue;
  rows.push({ level, runs, lost, stuck, observed: lost / runs, stuckRate: stuck / runs,
              model: modeled.get(level) ?? null, ceiling: ceilingFor(level, 21) });
}

console.log(`${pasted.length} paste(s): ` + perPlayer.map(p => `${p.name} (${p.levels} levels)`).join(', '));
console.log(`${rows.length} levels with runs on them, ${rows.reduce((s, r) => s + r.runs, 0)} runs total\n`);
console.log('lvl  runs  lost   of which stuck   modeled  ceiling');
for (const r of rows)
  console.log(String(r.level).padStart(3), String(r.runs).padStart(5),
    pct(r.observed).padStart(6), pct(r.stuckRate).padStart(15),
    (r.model == null ? '-' : pct(r.model)).padStart(10), pct(r.ceiling).padStart(9));

/* Only levels with enough runs to mean anything. A level lost once out of one is
   a 100% loss rate and says nothing, and quietly averaging it in is how a sample
   this small tells you whatever you were hoping to hear. */
const MIN_RUNS = 5;
const solid = rows.filter(r => r.runs >= MIN_RUNS && r.model != null);
console.log(`\n${solid.length} of ${rows.length} levels have at least ${MIN_RUNS} runs;`
  + ` the rest are too thin to read and are left out below.`);
if (!solid.length) process.exit(0);

const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const corr = (a, b) => {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++){
    num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : NaN;
};
const r = corr(solid.map(x => x.stuckRate), solid.map(x => x.model));
console.log(`\ncorrelation between measured brick rate and observed stuck rate: ${r.toFixed(3)}`);
console.log(r > 0.5
  ? '  the model ranks boards the way these players experienced them.'
  : '  the model does not predict what these players hit. Before trusting it further,\n'
    + '  check the disagreements below: the proxy may be measuring the wrong thing.');

const off = [...solid].sort((a, b) =>
  Math.abs(b.stuckRate - b.model) - Math.abs(a.stuckRate - a.model)).slice(0, 8);
console.log('\nwhere the model and the players disagree most:');
for (const x of off)
  console.log(`  level ${String(x.level).padStart(3)}  modeled ${pct(x.model).padStart(6)},`
    + ` players got stuck ${pct(x.stuckRate)} of ${x.runs} runs`);

const overCeiling = solid.filter(x => x.observed > x.ceiling);
if (overCeiling.length){
  console.log('\nlevels losing runs more often than their ceiling allows for bricking:');
  for (const x of overCeiling)
    console.log(`  level ${String(x.level).padStart(3)}  lost ${pct(x.observed)} of ${x.runs} runs,`
      + ` ceiling ${pct(x.ceiling)}`);
  console.log('  a loss is not always a brick, so read these next to the stuck column');
  console.log('  rather than as a ceiling breach on their own.');
}
