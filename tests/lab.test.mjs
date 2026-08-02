import { describe, it, assert, equal, read, loadFrom } from './helpers.mjs';
import { readdirSync } from 'node:fs';

const lab = loadFrom('src/lab/js', ['00-config.js', '20-sweep.js']);
const { LabConfig, LabSweep } = lab;

/* Each game's real config, loaded the way the built page loads it. The lab
   names another game's internals — the only file in the repo allowed to — so
   the whole job here is making sure those names are still real. */
const configOf = id => loadFrom(`src/${id}/js`, ['00-config.js'])[`${id[0].toUpperCase()}${id.slice(1)}Config`];

describe('lab knobs', () => {
  it('names a game that is actually built', () => {
    for (const game of LabConfig.games){
      const cfg = configOf(game.id);
      assert(cfg, `${game.id} publishes no config`);
      equal(game.path, `../${game.id}/`, `${game.id}'s path must climb out of /lab/ to the game`);
    }
  });

  /* The failure this exists for is quiet: a knob naming a key that has been
     renamed still draws a slider, still moves a number, and changes nothing at
     all — so the lab reports that the setting does not matter. */
  it('every knob names a key the game really has', () => {
    for (const game of LabConfig.games){
      const cfg = configOf(game.id);
      for (const knob of game.knobs){
        assert(Object.prototype.hasOwnProperty.call(cfg, knob.key),
          `${game.id} has no ${knob.key}, but the lab offers a control for it`);
        assert(typeof cfg[knob.key] === 'number',
          `${game.id}.${knob.key} is not a number, so a slider cannot drive it`);
      }
    }
  });

  it('every knob can reach the value the game ships with', () => {
    for (const game of LabConfig.games){
      const cfg = configOf(game.id);
      for (const knob of game.knobs){
        const v = cfg[knob.key];
        assert(v >= knob.min && v <= knob.max,
          `${game.id}.${knob.key} ships at ${v}, outside the lab's ${knob.min}..${knob.max}`);
        assert(knob.step > 0, `${game.id}.${knob.key} has no step`);
        assert(knob.note && knob.note.length > 20,
          `${game.id}.${knob.key} has no note saying what it is for`);
      }
    }
  });

  it('offers no two controls for the same key', () => {
    for (const game of LabConfig.games){
      const keys = game.knobs.map(k => k.key);
      equal(keys.length, new Set(keys).size, `${game.id} lists a knob twice`);
    }
  });

  /* The lab restates the bubble game's derived block, because that block runs
     once when the config is defined and a moved COLS would otherwise leave the
     walls where they were. Two copies of one calculation is exactly the thing
     this repo says will drift, so this is the guard rather than the hope. */
  it('restates the derived world exactly as the game computes it', () => {
    const app = read('src/lab/js/90-app.js');
    const cfg = read('src/bubble/js/00-config.js');
    const derived = ['WORLD_W', 'WORLD_H', 'MUZZLE'];
    for (const key of derived){
      assert(app.includes(`cfg.${key} =`), `the lab does not put ${key} back`);
      assert(cfg.includes(`BubbleConfig.${key} =`), `the bubble game no longer derives ${key}`);
    }
    /* the arithmetic itself, with the two spellings normalised */
    const norm = s => s.replace(/BubbleConfig\.|cfg\./g, '').replace(/\s+/g, '');
    for (const key of ['WORLD_W', 'WORLD_H']){
      const mine = norm(app.match(new RegExp(`cfg\\.${key} = ([^;]+);`))[1]);
      const theirs = norm(cfg.match(new RegExp(`BubbleConfig\\.${key} = ([^;]+);`))[1]);
      equal(mine, theirs, `the lab computes ${key} differently from the game`);
    }
  });

  /* The lab's claim about itself is that 00-config.js is the ONE file naming
     another game's internals. The survival sweep needs six of the bubble game's
     modules, and they were hard-coded in the app until a review pointed out that
     this made a second such file and quietly falsified the first one's header. */
  it('names every module the survival sweep reaches for', () => {
    for (const game of LabConfig.games){
      if (game.sweep !== 'survival') continue;
      assert(game.survivalMods, `${game.id} is swept by survival and names no modules`);
      const dir = `src/${game.id}/js`;
      const published = new Set();
      for (const f of readdirSync(join(root, dir)).filter(n => n.endsWith('.js'))){
        for (const m of read(`${dir}/${f}`).matchAll(/^globalThis\.(\w+)\s*=/gm)) published.add(m[1]);
      }
      for (const [as, name] of Object.entries(game.survivalMods)){
        assert(published.has(name), `${game.id} publishes no ${name}, but the lab reaches for it as ${as}`);
      }
    }
  });

  /* The lab must not grow its own copy of a game's randomness. 10-rng.js exists
     because three copies of that stream had drifted, and a harness drawing
     different numbers measures a game nobody plays. */
  it('draws its numbers from the game rather than from a copy', () => {
    const sweep = read('src/lab/js/20-sweep.js');
    assert(!/<<\s*13|>>>\s*17/.test(sweep),
      'the sweep has an xorshift of its own; it must use the game\'s stream');
    assert(/rng/i.test(sweep), 'the sweep no longer takes a stream at all');
  });

  it('asks for a sweep the game can actually answer', () => {
    for (const game of LabConfig.games){
      assert(game.sweep === 'par' || game.sweep === 'survival', `${game.id} has no sweep kind`);
      if (game.sweep === 'par'){
        assert(game.levels && game.search, `${game.id} is swept by par but names no level table or search`);
        const mods = loadFrom(`src/${game.id}/js`,
          ['00-config.js', '20-rules.js', '25-search.js', '32-order.js', '32-boards.js', '35-pars.js', '30-levels.js']
            .filter(f => hasFile(game.id, f)));
        assert(mods[game.levels], `${game.id} publishes no ${game.levels}`);
        assert(mods[game.search], `${game.id} publishes no ${game.search}`);
      }
    }
  });
});

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './helpers.mjs';
const hasFile = (id, f) => existsSync(join(root, 'src', id, 'js', f));

describe('lab sweep', () => {
  /* The sweep is the reason the lab exists, so it is checked against the two
     games' real modules rather than against a fixture. If this passes, the
     numbers in the panel are the numbers the game would give. */
  it('reads a par curve out of a game and judges it', () => {
    const m = loadFrom('src/measure/js',
      ['00-config.js', '20-rules.js', '25-search.js', '32-order.js', '35-pars.js', '30-levels.js']);
    const res = LabSweep.pars(
      { levels: m.MeasureLevels, search: m.MeasureSearch, pars: m.MeasurePars }, 1, 12);
    equal(res.kind, 'par');
    equal(res.rows.length, 12);
    /* An empty disagreement list is what success looks like AND what asking
       nothing looks like. This sweep read `levels.par`, which only one of the two
       games has, so for this one every shipped par was null, every comparison was
       skipped, and the panel reported agreement having compared nothing. */
    equal(res.rows.filter(r => r.shipped != null).length, 12,
      'the shipped par was not read, so nothing was actually compared');
    equal(res.disagreements, [], 'the shipped table and the search disagree about a par');
    equal(res.drops, [], 'the shipped curve goes backwards');
    assert(res.min >= 1 && res.max >= res.min, 'the curve has no range');
  });

  it('reads the cellar door the same way, through a different board shape', () => {
    const c = loadFrom('src/casks/js',
      ['00-config.js', '20-rules.js', '25-search.js', '32-boards.js', '35-pars.js', '30-levels.js']);
    const res = LabSweep.pars(
      { levels: c.CasksLevels, search: c.CasksSearch, pars: c.CasksPars }, 1, 10);
    equal(res.rows.filter(r => r.shipped != null).length, 10,
      'the shipped par was not read, so nothing was actually compared');
    equal(res.disagreements, [], 'the shipped table and the sweep disagree about a par');
    equal(res.drops, [], 'the shipped curve goes backwards');
  });

  it('says when a threshold has drifted from the run it describes', () => {
    const stars = { one: 65, two: 80, three: 130 };
    assert(LabSweep.tracks(stars, { p10: 66, p50: 82, p90: 128 }), 'a run this close should track');
    assert(!LabSweep.tracks(stars, { p10: 20, p50: 30, p90: 40 }), 'a run this far off should not');
  });

  it('takes a percentile off a sorted list the way the harness does', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    equal(LabSweep.percentile(xs, 0), 1);
    equal(LabSweep.percentile(xs, 1), 10);
    equal(LabSweep.percentile(xs, 0.5), 5);
  });
});
