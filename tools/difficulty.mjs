/* How hard is each level, measured rather than guessed, and is the shipped order
   a difficulty curve?

   The measurement itself lives in tools/difficulty-core.mjs, which explains what `tight`
   and `logOdds` mean. This reports it over a run of levels and checks whether
   level number and measured difficulty agree.

   Run: node tools/difficulty.mjs [levels] [--json] */
import { loadPure } from '../tests/helpers.mjs';
import { h, analyse, TOO_DEAR } from './difficulty-core.mjs';

const ctx = loadPure();
const args = process.argv.slice(2);
const LEVELS = Number(args.find(a => /^\d+$/.test(a)) || 120);
const AS_JSON = args.includes('--json');

const rows = [];
if (!AS_JSON) console.log('lvl  col  par  slack  width  branch   tight  log10(odds of par at random)');
for (let level = 1; level <= LEVELS; level++){
  const par = ctx.PARS[level];
  const tubes = ctx.Levels.make(level);
  if (par == null || !tubes) continue;
  const { colors } = ctx.Levels.shape(level);
  let a;
  try {
    a = analyse(tubes, par);
  } catch (err) {
    if (err !== TOO_DEAR) throw err;
    if (!AS_JSON) console.log(String(level).padStart(3), ' too expensive to measure');
    continue;
  }
  if (!a) continue;
  const row = { level, colors, par, slack: par - h(tubes), ...a };
  rows.push(row);
  if (!AS_JSON){
    console.log(
      String(level).padStart(3), String(colors).padStart(4), String(par).padStart(4),
      String(row.slack).padStart(6), a.width.toFixed(2).padStart(6),
      a.branching.toFixed(2).padStart(7), a.tight.toFixed(3).padStart(7),
      '  ' + a.logOdds.toFixed(2)
    );
  }
}

if (AS_JSON){
  console.log(JSON.stringify(rows, null, 1));
} else {
  const byOdds = [...rows].sort((a, b) => a.logOdds - b.logOdds);
  console.log('\nhardest ten, whole board:');
  for (const r of byOdds.slice(0, 10))
    console.log(`  level ${String(r.level).padStart(3)}  10^${r.logOdds.toFixed(2)}  par ${String(r.par).padStart(2)}, ${r.colors} colours, tight ${r.tight.toFixed(3)}`);
  const byTight = [...rows].sort((a, b) => a.tight - b.tight);
  console.log('\nhardest ten, per decision:');
  for (const r of byTight.slice(0, 10))
    console.log(`  level ${String(r.level).padStart(3)}  tight ${r.tight.toFixed(3)}  par ${String(r.par).padStart(2)}, ${r.colors} colours`);

  /* is the shipped order actually a difficulty curve? */
  const n = rows.length;
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const rank = key => {
    const order = [...rows].sort((a, b) => a[key] - b[key]).map(r => r.level);
    return new Map(order.map((lvl, i) => [lvl, i]));
  };
  const r1 = rank('logOdds');
  const xs = rows.map(r => r.level), ys = rows.map(r => n - 1 - r1.get(r.level));
  const mx = mean(xs), my = mean(ys);
  const cov = mean(xs.map((x, i) => (x - mx) * (ys[i] - my)));
  const sx = Math.sqrt(mean(xs.map(x => (x - mx) ** 2)));
  const sy = Math.sqrt(mean(ys.map(y => (y - my) ** 2)));
  console.log(`\nlevel number vs measured difficulty: r = ${(cov / (sx * sy)).toFixed(3)}`);
  console.log('(1.0 would mean the shipped order already is the difficulty curve)');
}
