/* Playing a bubble run outside the browser, once, so that everything measuring
   this game measures the same game.

   Pure and CLI-free for the reason tools/measure.mjs is: the survival tool wants
   three hundred runs and a table, and the difficulty test wants forty and an
   assertion, and if each writes its own loop the test stops being able to fail
   when the tool would. They had one each, and the two disagreed about whether a
   row still comes down after the final shot, which is a whole star's worth of
   difference on the runs it touches.

   The board comes from BubbleRules.dealBoard, the numbers from BubbleRng and the
   greedy shot from BubbleAdvice.bestShot, so this is the same deal the player is
   given, off the same stream, answered with the same shot the hint offers. */
import { loadBubble } from '../tests/helpers.mjs';

const { BubbleConfig: C, BubbleRng: Rng, BubbleGrid: G, BubbleShot: S, BubbleRules: R,
        BubbleAdvice: Adv } = loadBubble();

/* Who is playing.

   The star thresholds used to be percentiles of a flawless bot, and that is the
   first mistake this exists to stop repeating: a bot's p10 is not a person's,
   and the thresholds read off one sat where a real player cleared the first star
   barely half the time, on a level that needs one star to open the next.

   The second mistake was the shape of the error. A slip used to send the shot
   off at a uniformly random angle, and that is not how anyone plays badly: a
   person who misjudges is still aiming at a place on the board, they have just
   picked the wrong one. Measured, the difference is not a detail: at the shipped
   cadence a wholly random *angle* survives 25 shots on 5% of seeds and a wholly
   random *cell* on 31%, because an angle mostly buries the bubble in the first
   thing it meets. Every threshold moved when this was corrected, which is why
   the first star is 28 rather than the 25 it was first set to. So a slip lands
   the bubble in some other reachable cell, and `miss` is the share
   of shots that go that way: 0 is the bot, 1 is a player aiming at anything at
   all, and a person is somewhere in between. Nobody knows exactly where, which
   is why the tables print several and the thresholds have to hold across the
   middle of them rather than at one favoured number.

   What is deliberately *not* modeled is planning. bestShot looks one shot ahead
   because it is also the hint, and a hint whose reasoning cannot be seen on the
   board reads as arbitrary. A two-ply policy using the next bubble, which the
   game does show the player, finishes 98% of runs against this one's 94%, so the
   top of the range is a few points above the bot rather than out of sight. It is
   not worth a second shot-chooser that the hint would then disagree with. */
export const POLICIES = [
  { miss: 0,    as: 'bot' },
  { miss: 0.15, as: 'good' },
  { miss: 0.30, as: 'ok' },
  { miss: 1,    as: 'random' }
];
/* the two that are meant to be people: not the ceiling, not the floor */
export const HUMAN = ['good', 'ok'];

/* Every cell a bubble can actually be put in from here.

   Walked over BubbleAdvice.AIMS rather than a fan of this module's own, so a
   slip picks from the same set of shots the chooser picked the best one out of.
   One entry per landing cell and not per angle: a dozen angles reach the same
   cell, and counting each of them separately would weight the cells a wide fan
   happens to reach as if a player were more likely to pick them. */
function landings(board){
  const out = [], seen = new Set();
  for (const { dir } of Adv.AIMS){
    const shot = S.resolveShot(board, C.MUZZLE, dir);
    if (!shot.landing) continue;
    const k = `${shot.landing.j},${shot.landing.c}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(shot.landing);
  }
  return out;
}

/* One run, played to its end. The cadence and the length are arguments so a
   candidate setting can be measured without editing the config the game ships
   with.

   The order of the checks below is the order in BubbleApp.land and has to stay
   that way. In particular the run is survived *before* the board comes down: a
   row arriving after the final shot presses on a shot that will never be taken,
   so a player it kills was killed by a threat they were never given a chance to
   answer. Dropping first measures a stricter game than the one being played, and
   thresholds set against it come out too low. */
export function run(seed, { every = C.ADVANCE_EVERY, length = C.RUN_SHOTS, miss = 0,
                            colors = C.COLORS, rows = 5 } = {}){
  /* the game's own stream, not a copy of it: a harness drawing different numbers
     measures a different game */
  const rnd = Rng.from(seed);
  const b = R.dealBoard(rows, rnd, colors);

  /* How many turns had nothing to clear with the color in hand. About three in
     five, which is the single most surprising thing the harness reports and the
     reason a run cannot be read as a string of decisions: most shots are being
     put somewhere rather than played, and the skill is in where they go. If this
     ever climbs toward nine in ten the game has become a dumping exercise, and
     no test of the rules would notice. */
  let turns = 0, forced = 0;

  let sinceDrop = 0;
  for (let shot = 1; shot <= length; shot++){
    const colors = R.liveColors(b);
    if (!colors.length) return { shots: shot - 1, how: 'cleared', turns, forced };
    const color = colors[Math.floor(rnd() * colors.length)];

    /* The shot the hint would offer, asked for on every turn whether or not it
       is taken, so the stream advances the same way at every miss rate and the
       forced count is the board's property rather than the policy's. */
    const best = Adv.bestShot(b, color, S.resolveShot);
    if (!best) return { shots: shot - 1, how: 'blocked', turns, forced };
    turns++;
    if (best.matched === 0) forced++;

    let landing = best.landing;
    if (rnd() < miss){
      const cells = landings(b);
      if (cells.length) landing = cells[Math.floor(rnd() * cells.length)];
    }

    const res = R.resolveTurn(b, landing, color);
    if (res.won) return { shots: shot, how: 'cleared', turns, forced };
    if (res.lost) return { shots: shot, how: 'line', turns, forced };
    if (shot >= length) return { shots: shot, how: 'survived', turns, forced };

    if (++sinceDrop >= every){
      sinceDrop = 0;
      G.advance(b, R.freshRow(b, rnd));
      R.remove(b, R.detach(b));
      if (R.isLost(b)) return { shots: shot, how: 'line', turns, forced };
    }
  }
  /* unreachable: the last iteration always returns */
  return { shots: length, how: 'survived', turns, forced };
}

/* A run that emptied the board got as far as anything can get, so it passes
   every threshold. Grading it on shots alone would score the best available
   ending as the shortest run in the set. */
export const passed = (o, at) => o.how === 'cleared' || o.shots >= at;

/* The third star is an ending, not a count, exactly as BubbleScore has it. A run
   whose final shot loses reads RUN_SHOTS on the clock and did not survive, so
   counting shots for this one would report a pass rate the game never pays. */
export const finished = o => o.how === 'cleared' || o.how === 'survived';

/* Every rate a caller might want from a batch of seeds, measured once. */
export function measure({ seeds = 300, ...opts } = {}){
  const outs = [];
  for (let s = 1; s <= seeds; s++) outs.push(run(s, opts));
  const shots = outs.map(o => o.shots).sort((a, b) => a - b);
  const rate = at => outs.filter(o => passed(o, at)).length / outs.length;
  const turns = outs.reduce((n, o) => n + o.turns, 0);
  return {
    ...opts, seeds, outs, rate,
    median: shots[shots.length >> 1],
    forced: turns ? outs.reduce((n, o) => n + o.forced, 0) / turns : 0,
    at: {
      one: rate(C.STAR_SHOTS.one),
      two: rate(C.STAR_SHOTS.two),
      three: outs.filter(finished).length / outs.length
    }
  };
}
