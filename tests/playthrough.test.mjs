/* Plays levels the way a player does, through the shipped modules.

   Everything below drives `Rules`, `Progress` and `Panel` exactly as the app
   does, so a run here exercises the same dealing, the same legality, the same
   scoring, the same payouts and the same end-of-run panel. What it does not
   touch is drawing: no DOM, no animation, no pour geometry. Those need eyes on a
   real device, and a browser pane with a zero-sized viewport and no animation
   frames will confidently tell you the wrong thing.

   The lines played are found with the independent rules in baseline.mjs, so a
   bug shared between the solver and the game does not hide here. */
import { describe, it, assert, equal, loadPure } from './helpers.mjs';
import * as base from './baseline.mjs';
import { lineToPar } from '../tools/measure.mjs';

const { Levels, Rules, Progress, Panel, CONFIG, PARS } = loadPure();

/* An optimal line, from the independent rules. Uses the par the game publishes
   as the target, so a wrong par shows up as a line that cannot be found. */
const optimalLine = (start, par) => lineToPar(start, par);

/* Any solving sequence of exactly `len` pours, so an over-par run can be played
   for real rather than simulated. Padding an optimal line with wasted moves does
   not work: a pour cannot simply be taken back, so the rest of the line stops
   being legal and the run finishes early on a board it never actually reached.
   Small boards only; this is a plain search. */
function lineOfLength(tubes, len){
  const dead = new Set();
  const walk = (t, left, path) => {
    if (left === 0) return base.solved(t) ? path : null;
    if (base.solved(t)) return null;              /* every pour must be used */
    const k = base.exactKey(t) + '|' + left;
    if (dead.has(k)) return null;
    for (const m of base.legalMoves(t)){
      const got = walk(base.apply(base.clone(t), m), left - 1, path.concat([m]));
      if (got) return got;
    }
    dead.add(k);
    return null;
  };
  return walk(base.clone(tubes), len, []);
}

/* Play `line` against the real rules, refusing anything the game would refuse.
   Every pour is checked for legality first, exactly as the app does. */
function play(level, line){
  const tubes = Levels.make(level);
  assert(tubes, `level ${level} failed to deal`);
  const par = PARS[level];
  let moves = 0, over = false;

  for (const m of line){
    const [from, to] = m;
    assert(!Rules.isSolved(tubes), `level ${level} was already finished at pour ${moves + 1}`);
    assert(Rules.canPour(tubes, from, to), `level ${level} pour ${moves + 1} was not legal`);
    Rules.applyMove(tubes, { from, to, n: Rules.pourAmount(tubes, from, to) });
    moves++;
    /* the app decides this per pour, not when the queue drains */
    if (!Rules.isSolved(tubes) && Rules.rate(moves, par, true, false) === 0) over = true;
  }
  return { tubes, moves, solved: Rules.isSolved(tubes), over, par,
           stars: Rules.rate(moves, par, true, false) };
}

describe('playing it', () => {
  const levels = [1, 2, 3, 7, 12];

  it('deals a board that can be finished in exactly the par it advertises', () => {
    for (const level of levels){
      const tubes = Levels.make(level);
      const line = optimalLine(base.clone(tubes), PARS[level]);
      assert(line, `level ${level} cannot be finished in the par it advertises`);
      equal(line.length, PARS[level], `level ${level} advertises the wrong par`);
    }
  });

  it('plays each one through the real rules and finishes clean', () => {
    for (const level of levels){
      const line = optimalLine(base.clone(Levels.make(level)), PARS[level]).map(m => [m[0], m[1]]);
      const run = play(level, line);
      assert(run.solved, `level ${level} did not finish`);
      equal(run.moves, run.par, `level ${level} took ${run.moves} pours against par ${run.par}`);
      equal(run.stars, 3, `level ${level} should be worth three stars at par`);
      assert(!run.over, `level ${level} must not be marked failed on a par run`);
    }
  });

  it('drops a star for every pour over par, and fails on the third', () => {
    const par = PARS[1];
    const runs = [0, 1, 2, 3].map(over => {
      const line = lineOfLength(Levels.make(1), par + over);
      assert(line, `no way to finish level 1 in exactly ${par + over} pours`);
      return play(1, line.map(m => [m[0], m[1]]));
    });
    for (const [i, run] of runs.entries()){
      assert(run.solved, `the ${par + i} pour run should still finish the board`);
      equal(run.moves, par + i, 'and should take exactly the pours it was given');
    }
    equal(runs[0].stars, 3, 'par is three stars');
    equal(runs[1].stars, 2, 'one over is two stars');
    equal(runs[2].stars, 1, 'two over is one star');
    equal(runs[3].stars, 0, 'three over is a failed run');
    assert(!runs[2].over, 'a one star run must not be cut short');
    /* Finishing on the very pour that costs the last star scores zero but is not
       cut short: there was nothing left to cut. Losing mid board is the other
       case, and the app decides it per pour rather than when the queue drains. */
    assert(!runs[3].over, 'a run that finishes on its last legal pour is not cut short');
    const level = 1;
    const long = lineOfLength(Levels.make(level), par + 4);
    assert(long, 'need a longer line to stop partway through');
    const abandoned = play(level, long.slice(0, par + 3).map(m => [m[0], m[1]]));
    assert(!abandoned.solved, 'this run should stop before the board is done');
    assert(abandoned.over, 'and should know it is lost without waiting for the end');
  });

  it('never claims more pours are needed than actually remain', () => {
    /* This is the property the game ends runs on: if the bound exceeds the pours
       left, the run is declared lost. Overstating it even once would end a run
       that could still have been won, so it is checked at every step of a real
       optimal line, where the true distance remaining is known exactly. */
    for (const level of levels){
      const line = optimalLine(base.clone(Levels.make(level)), PARS[level]);
      let state = Levels.make(level);
      let remaining = PARS[level];
      for (const m of line){
        assert(Rules.minPours(state) <= remaining,
          `level ${level}: bound ${Rules.minPours(state)} exceeds the ${remaining} pours actually left`);
        Rules.applyMove(state, { from: m[0], to: m[1], n: Rules.pourAmount(state, m[0], m[1]) });
        remaining--;
      }
      equal(Rules.minPours(state), 0, `level ${level} should need nothing once solved`);
    }
  });

  it('pays and unlocks the way the economy says, level after level', () => {
    const p = Progress.createProgress(Progress.memoryStorage());
    const fee = CONFIG.economy.attempt;
    let purse = CONFIG.economy.startingGold;
    equal(p.gold, purse);

    for (const level of [1, 2, 3]){
      assert(p.isUnlocked(level), `level ${level} should be open`);
      assert(p.spend(fee), 'the attempt fee should be affordable');
      purse -= fee;

      const line = optimalLine(base.clone(Levels.make(level)), PARS[level]).map(m => [m[0], m[1]]);
      const run = play(level, line);
      const result = p.complete(level, run.moves, run.stars);

      purse += CONFIG.economy.starGold[3] + CONFIG.economy.firstClear;
      equal(p.gold, purse, `purse is wrong after level ${level}`);
      assert(result.firstClear, 'a first clear should pay its bonus');
      equal(p.starsFor(level), 3);
      equal(p.bestFor(level), run.moves);
      equal(p.unlocked, level + 1, 'clearing should open the next one');
    }
    /* three clean clears at 9 net each, against a starting purse that the design
       says must not run away */
    equal(p.gold, CONFIG.economy.startingGold + 3 * (CONFIG.economy.starGold[3] + CONFIG.economy.firstClear - fee));
    equal(p.totalStars(), 9);
  });

  it('a failed run banks nothing and leaves the door shut', () => {
    const p = Progress.createProgress(Progress.memoryStorage());
    const line = lineOfLength(Levels.make(1), PARS[1] + 3);
    const run = play(1, line.map(m => [m[0], m[1]]));
    equal(run.stars, 0);
    const before = p.gold;
    const result = p.complete(1, run.moves, run.stars);
    assert(result.failed, 'the run should report itself failed');
    equal(p.gold, before, 'a failed run must not pay');
    equal(p.starsFor(1), 0);
    equal(p.bestFor(1), null, 'and must not record a best');
    equal(p.unlocked, 1, 'nor open the next level');

    /* what the player is shown at that point */
    const panel = Panel.decide({
      level: 1, lastLevel: p.lastLevel, failed: true, stars: 0,
      nextUnlocked: p.isUnlocked(2), canPayFee: p.canAfford(CONFIG.economy.attempt),
      canPaySkip: p.canAfford(CONFIG.economy.attempt * CONFIG.economy.skipMultiple),
      improvedStars: false, hadStars: 0, par: run.par, totalStars: p.totalStars()
    });
    equal(panel.nextHidden, true, 'a failed run must not offer the next level');
    equal(panel.stuck, true, 'but it should offer a way past');
    equal(panel.skipHidden, false);
  });

  it('replaying a cleared level cannot farm the first-clear bonus', () => {
    const p = Progress.createProgress(Progress.memoryStorage());
    const line = optimalLine(base.clone(Levels.make(1)), PARS[1]).map(m => [m[0], m[1]]);
    const run = play(1, line);
    p.complete(1, run.moves, run.stars);
    const after = p.gold;
    const again = p.complete(1, run.moves, run.stars);
    assert(!again.firstClear, 'the bonus is once only');
    equal(p.gold, after + CONFIG.economy.starGold[3], 'a replay pays for the stars and nothing else');
  });

  it('finishes the game at the last level and offers nothing past it', () => {
    const p = Progress.createProgress(Progress.memoryStorage());
    const last = p.lastLevel;
    const line = optimalLine(base.clone(Levels.make(last)), PARS[last]);
    assert(line, `the last level must be solvable`);
    equal(line.length, PARS[last], 'and finishable in the par it advertises');

    const run = play(last, line.map(m => [m[0], m[1]]));
    assert(run.solved && run.stars === 3, 'the last level should be beatable at par');
    p.complete(last, run.moves, run.stars);
    equal(p.unlocked, last, 'clearing it must not open a level with no par');

    const panel = Panel.decide({
      level: last, lastLevel: last, failed: false, stars: 3, nextUnlocked: p.isUnlocked(last + 1),
      canPayFee: true, canPaySkip: true, improvedStars: false, hadStars: 0,
      par: run.par, totalStars: p.totalStars()
    });
    equal(panel.nextHidden, true);
    equal(panel.hint, `That is the last of them. 3 stars from ${last} levels.`);
  });
});
