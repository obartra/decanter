/* The breadcrumbs a bug report is answered from. */
import { describe, it, assert, equal, loadPure } from './helpers.mjs';

const fresh = () => {
  const ctx = loadPure();
  ctx.Trace.clear();
  return ctx.Trace;
};

describe('the trace', () => {
  it('keeps what happened, in the order it happened', () => {
    const Trace = fresh();
    Trace.note('booted');
    Trace.refused('attempt', 'costs 5, purse holds 4');
    Trace.note('to the map');
    const lines = Trace.lines();
    equal(lines.length, 3);
    assert(lines[0].includes('booted'), lines[0]);
    assert(lines[1].includes('refused attempt'), lines[1]);
    assert(lines[1].includes('purse holds 4'), 'the reason has to survive, not just the fact');
    assert(lines[2].includes('to the map'), lines[2]);
  });

  it('holds a bounded run-up rather than everything', () => {
    /* a buffer that grows without bound on a device that is never reloaded is
       its own bug, and it is the run-up to the report that matters */
    const Trace = fresh();
    for (let i = 0; i < 500; i++) Trace.note(`pour ${i}`);
    const lines = Trace.lines();
    assert(lines.length <= 64, `kept ${lines.length} entries`);
    assert(lines[lines.length - 1].includes('pour 499'), 'the newest entry must survive');
    assert(!lines.some(l => l.includes('pour 0 ')), 'the oldest must not');
  });

  it('counts refusals by kind, which the ring alone cannot say', () => {
    const Trace = fresh();
    Trace.refused('attempt', 'no gold');
    Trace.refused('attempt', 'no gold');
    Trace.refused('hint', 'no gold');
    for (let i = 0; i < 200; i++) Trace.note('pour');
    /* the refusals have long since fallen out of the ring; the counts have not */
    equal(Trace.counts.refusals, { attempt: 2, hint: 1 });
    equal(Trace.counts.refused, 3);
  });

  it('records a fault as something readable rather than an object', () => {
    const Trace = fresh();
    Trace.fault('the map', new Error('render blew up'));
    const line = Trace.lines()[0];
    assert(line.includes('FAULT'), line);
    assert(line.includes('the map'), 'which part was running has to be in there');
    assert(line.includes('render blew up'), line);
  });

  it('survives being handed nothing at all', () => {
    /* this runs inside a failure path, so it cannot be the thing that throws */
    const Trace = fresh();
    Trace.fault('somewhere', undefined);
    Trace.note('bare');
    Trace.refused('attempt');
    equal(Trace.lines().length, 3);
  });
});

describe('what a save remembers going wrong', () => {
  const withSave = () => {
    const ctx = loadPure();
    const store = ctx.Progress.memoryStorage();
    return { ctx, store, progress: ctx.Progress.createProgress(store) };
  };

  it('counts refusals across reloads, because a stuck player reloads', () => {
    const { ctx, store, progress } = withSave();
    progress.recordRefusal('attempt');
    progress.recordRefusal('attempt');
    progress.recordRefusal('hint');
    const later = ctx.Progress.createProgress(store);
    equal(later.diag.refused, { attempt: 2, hint: 1 });
  });

  it('keeps the last fault, and only the last', () => {
    const { ctx, store, progress } = withSave();
    progress.recordFault('first');
    progress.recordFault('second');
    const later = ctx.Progress.createProgress(store);
    equal(later.diag.faults, 2);
    equal(later.diag.lastFault, 'second');
  });

  it('does not let one grow without bound in the player\'s save', () => {
    const { progress } = withSave();
    progress.recordFault('x'.repeat(5000));
    assert(progress.diag.lastFault.length <= 200, 'a save is not a place to grow a diary');
  });

  it('counts gold that was handed over rather than earned', () => {
    /* a save carrying a purse nobody played for is a debugging trap unless the
       save itself says so */
    const { ctx, progress } = withSave();
    equal(progress.fill(), ctx.CONFIG.economy.purseCap);
    equal(progress.gold, ctx.CONFIG.economy.purseCap);
    equal(progress.diag.grants, 1);
  });

  it('fills the purse to a figure rather than adding one', () => {
    /* This is what lets the word stay in the address bar: filling twice lands
       on the same number, so opening the link again is free. Adding would stack
       a second payment on every reload. */
    const { ctx, progress } = withSave();
    progress.fill();
    progress.fill();
    progress.fill();
    equal(progress.gold, ctx.CONFIG.economy.purseCap, 'three fills, one figure');
  });

  it('does not let a filled purse climb past the figure by playing on', () => {
    /* The whole point of the number is that it is the end of the economy. A
       player who fills the purse and then keeps clearing levels was walking
       straight past it, into an eighth digit the header has no room for. */
    const { ctx, progress } = withSave();
    const cap = ctx.CONFIG.economy.purseCap;
    progress.fill();
    for (let level = 1; level <= 20; level++) progress.complete(level, 11, 3);
    equal(progress.gold, cap, 'twenty clean clears must not add a coin');
    progress.claimDaily('2026-08-02');
    equal(progress.gold, cap, 'nor the daily draught');
  });

  it('caps a save that arrives holding more than the purse can hold', () => {
    const ctx = loadPure();
    const store = ctx.Progress.memoryStorage();
    store.setItem(ctx.Progress.SAVE_KEY, JSON.stringify({
      version: 1, layout: ctx.CONFIG.layout, unlocked: 15, gold: 999999999999
    }));
    equal(ctx.Progress.createProgress(store).gold, ctx.CONFIG.economy.purseCap);
  });

  it('still lets an ordinary purse rise normally', () => {
    /* the cap must be a ceiling nobody playing can feel */
    const { progress } = withSave();
    const before = progress.gold;
    progress.complete(1, 11, 3);
    assert(progress.gold > before, 'a good clear still pays');
  });

  it('gives a save written before any of this existed somewhere to write it', () => {
    const ctx = loadPure();
    const store = ctx.Progress.memoryStorage();
    store.setItem(ctx.Progress.SAVE_KEY, JSON.stringify({ version: 1, layout: ctx.CONFIG.layout, unlocked: 15, gold: 4 }));
    const progress = ctx.Progress.createProgress(store);
    equal(progress.diag.refused, {});
    equal(progress.diag.faults, 0);
    progress.recordRefusal('attempt');
    equal(progress.diag.refused, { attempt: 1 });
  });
});
