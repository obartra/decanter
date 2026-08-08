/* How often does each level brick, and does it come in under its ceiling?

   The measurement is tools/brick-core.mjs, which explains what `brick` and
   `trap` mean and why the ceiling is graduated. This reports it over a run of
   levels and names the ones that fail.

   `--trap` adds the trap depth, which needs a solvability check per state and is
   far slower. Without it this is cheap enough to gate on in CI, which is what
   tests/brick.test.mjs does.

   Run: node tools/brick.mjs [levels] [--trap] [--json] */
import { loadPure } from '../tests/helpers.mjs';
import { measure, ceilingFor } from './brick-core.mjs';

const ctx = loadPure();
const args = process.argv.slice(2);
const LEVELS = Number(args.find(a => /^\d+$/.test(a))) || ctx.LAST_LEVEL;
const WANT_TRAP = args.includes('--trap');
const AS_JSON = args.includes('--json');

/* Derived rather than written down, so moving the grant moves the ceiling with
   it. The vessel is what makes a brickable board survivable, so where it lands
   is where the ceiling is allowed to relax. */
export function vesselLevel(){
  for (let i = 0; i < ctx.Chapters.count; i++){
    const c = ctx.Chapters.at(i);
    if (c && c.grant === 'vessel') return i * ctx.CONFIG.sectionSize + 1;
  }
  return Infinity;
}

const solvable = t => ctx.Rules.isSolvable(t, 200000);
const pct = n => (100 * n).toFixed(1).padStart(5);
const VESSEL = vesselLevel();

const rows = [];
for (let level = 1; level <= LEVELS; level++){
  if (ctx.Levels.isBubble(level)) continue;      // a bubble board has no pours to run out of
  const tubes = ctx.Levels.make(level);
  if (!tubes) continue;
  /* the board's own seed, not the level's: a board is measured as a candidate
     long before it is assigned a level, and the two have to agree */
  const m = measure(tubes, ctx.Levels.seedFor(level), WANT_TRAP ? { isSolvable: solvable } : {});
  rows.push({ level, ceiling: ceilingFor(level, VESSEL), ...m });
}

if (AS_JSON){
  console.log(JSON.stringify(rows, null, 1));
} else {
  console.log(`vessel granted at level ${VESSEL}\n`);
  console.log(WANT_TRAP ? 'lvl  brick  ceiling  trap  worst' : 'lvl  brick  ceiling');
  for (const r of rows){
    const flag = r.brick > r.ceiling ? '  OVER' : '';
    console.log(String(r.level).padStart(3), pct(r.brick), pct(r.ceiling),
      WANT_TRAP ? `${String(r.trap ?? '-').padStart(5)}${String(r.worstTrap ?? '-').padStart(7)}` : '', flag);
  }
  const over = rows.filter(r => r.brick > r.ceiling);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  console.log(`\n${over.length} of ${rows.length} levels over ceiling`);
  console.log(`median brick ${pct([...rows].sort((a, b) => a.brick - b.brick)[rows.length >> 1].brick)}%,` +
              ` mean ${pct(mean(rows.map(r => r.brick)))}%`);
  console.log('\nover, worst first:');
  for (const r of [...over].sort((a, b) => (b.brick - b.ceiling) - (a.brick - a.ceiling)))
    console.log(`  level ${String(r.level).padStart(3)}  ${pct(r.brick)}%  against a ceiling of ${pct(r.ceiling)}%`);
}
