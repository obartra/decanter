import { describe, it, assert, equal, read, loadGame, loadPure } from './helpers.mjs';

const lab = loadGame('lab');
const { LabConfig, LabSweep } = lab;

/* Each game's real config, loaded the way the built page loads it. The lab
   names another game's internals — the only file in the repo allowed to — so
   the whole job here is making sure those names are still real.

   `dir` and `config` are read off the entry rather than derived from the id.
   They used to be derived, which worked for exactly as long as every game was a
   folder under src/ named after itself; the graded game is `src/js` served from
   the root, and deriving would have meant inventing a folder to satisfy a
   convention. */
const dirOf = game => game.dir || `src/${game.id}/js`;
/* `loadPure` is the app and `loadGame` is a game at its own path; the app is the
   one entry that is neither shaped like nor located like the others. */
const modulesFor = game => (game.dir ? loadPure() : loadGame(game.id));
const configOf = game => modulesFor(game)[game.config];
/* What a page puts on `globalThis`, which is not the same question as what its
   modules export and is the only one that matters here.

   The lab does not import anything. It opens a built page in a frame and reads
   names off its `contentWindow`, so a module that exports perfectly and is not
   on that page's debug surface is, to the lab, not there — no error, just an
   undefined it goes on to call a method of. Scanning the exports instead of the
   surface is exactly the check that passed while the lab's panel sweep timed out
   on a `Progress` the app page had stopped publishing. */
const publishedBy = dir => {
  const surface = read(`${dir}/main.js`).match(/Object\.assign\(globalThis,\s*\{([^}]*)\}/);
  assert(surface, `${dir}/main.js has no debug surface, so this scan sees nothing`);
  return new Set([...surface[1].matchAll(/([A-Za-z_$][\w$]*)\s*(?=[,}]|$)/g)].map(m => m[1]));
};

/* A knob key may be dotted, because the graded game keeps its tunables under
   `economy`. Undotted keys walk a one-step path. */
const readKey = (obj, key) => key.split('.').reduce((at, step) => (at == null ? at : at[step]), obj);
const hasKey = (obj, key) => {
  const path = key.split('.');
  let at = obj;
  for (const step of path.slice(0, -1)){
    if (at == null || typeof at !== 'object') return false;
    at = at[step];
  }
  return !!at && Object.prototype.hasOwnProperty.call(at, path[path.length - 1]);
};

describe('lab knobs', () => {
  it('names a game that is actually built', () => {
    for (const game of LabConfig.games){
      const cfg = configOf(game);
      assert(cfg, `${game.id} publishes no ${game.config}`);
      /* Every path has to climb, because the lab is a page one level down. A
         path that did not would load the lab inside itself. */
      assert(game.path.startsWith('../'), `${game.id}'s path must climb out of /lab/`);
    }
  });

  /* The failure this exists for is quiet: a knob naming a key that has been
     renamed still draws a slider, still moves a number, and changes nothing at
     all — so the lab reports that the setting does not matter. */
  it('every knob names a key the game really has', () => {
    for (const game of LabConfig.games){
      const cfg = configOf(game);
      for (const knob of game.knobs){
        assert(hasKey(cfg, knob.key),
          `${game.id} has no ${knob.key}, but the lab offers a control for it`);
        assert(typeof readKey(cfg, knob.key) === 'number',
          `${game.id}.${knob.key} is not a number, so a slider cannot drive it`);
      }
    }
  });

  it('every knob can reach the value the game ships with', () => {
    for (const game of LabConfig.games){
      const cfg = configOf(game);
      for (const knob of game.knobs){
        const v = readKey(cfg, knob.key);
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
    const cfg = read('src/bubble/js/pure/00-config.js');
    const derived = ['WORLD_W', 'WORLD_H', 'MUZZLE'];
    for (const key of derived){
      assert(app.includes(`cfg.${key} =`), `the lab does not put ${key} back`);
      assert(cfg.includes(`BubbleConfig.${key} =`), `the bubble game no longer derives ${key}`);
    }
    /* The arithmetic itself, with the two spellings normalised. MUZZLE used to
       be excluded here because the game writes it over three lines — but `[^;]`
       spans newlines and the whitespace is normalised away, so the only thing
       that exclusion bought was a derived value with an existence check and no
       agreement check. */
    const norm = s => s.replace(/BubbleConfig\.|cfg\./g, '').replace(/\s+/g, '');
    for (const key of derived){
      const mine = norm(app.match(new RegExp(`cfg\\.${key} = ([^;]+);`))[1]);
      const theirs = norm(cfg.match(new RegExp(`BubbleConfig\\.${key} = ([^;]+);`))[1]);
      equal(mine, theirs, `the lab computes ${key} differently from the game`);
    }
  });

  /* The lab's claim about itself is that 00-config.js is the ONE file naming
     another game's internals. The survival sweep needs several of the bubble
     game's modules, and they were hard-coded in the app until a review pointed
     out that this made a second such file and quietly falsified the first one's
     header. */
  it('names every module the lab reaches for, and reaches it through the page', () => {
    for (const game of LabConfig.games){
      const wanted = { ...(game.survivalMods || {}), ...(game.stateMods || {}),
                       ...(game.config ? { config: game.config } : {}),
                       ...(game.app ? { app: game.app } : {}),
                       ...(game.levels ? { levels: game.levels } : {}),
                       ...(game.search ? { search: game.search } : {}),
                       ...(game.pars ? { pars: game.pars } : {}) };
      if (!Object.keys(wanted).length) continue;
      const published = publishedBy(dirOf(game));
      for (const [as, name] of Object.entries(wanted)){
        assert(published.has(name), `${game.id} publishes no ${name}, but the lab reaches for it as ${as}`);
      }
    }
  });

  /* A game whose screens follow from a save has to name the modules that read
     one, or the state panel draws a list of presets and applying any of them is
     a TypeError against `undefined.SAVE_KEY`. */
  it('names what it needs before offering to set a state', () => {
    for (const game of LabConfig.games){
      if (!game.states) continue;
      assert(game.stateMods, `${game.id} offers states and names no modules`);
      for (const need of ['progress', 'chapters', 'panel', 'lastLevel']){
        assert(game.stateMods[need], `${game.id} offers states and cannot reach ${need}`);
      }
      assert(game.levels, `${game.id} offers states and cannot ask which game a level is`);
    }
    /* and the panel sweep is the one that needs Panel, so it must not be
       offered by a game that cannot reach it */
    for (const game of LabConfig.games){
      if (game.sweep !== 'panel') continue;
      assert(game.stateMods && game.stateMods.panel, `${game.id} is swept by panel and names no Panel`);
    }
  });

  /* The lab must not grow its own copy of a game's randomness. 10-rng.js exists
     because three copies of that stream had drifted, and a harness drawing
     different numbers measures a game nobody plays. */
  it('draws its numbers from the game rather than from a copy', () => {
    const sweep = read('src/lab/js/pure/20-sweep.js');
    assert(!/<<\s*13|>>>\s*17/.test(sweep),
      'the sweep has an xorshift of its own; it must use the game\'s stream');
    assert(/rng/i.test(sweep), 'the sweep no longer takes a stream at all');
  });

  it('asks for a sweep the game can actually answer', () => {
    for (const game of LabConfig.games){
      assert(['par', 'survival', 'panel'].includes(game.sweep), `${game.id} has no sweep kind`);
      if (game.sweep === 'par'){
        /* `pars` is checked with the other two because it is the one whose
           absence is silent: the sweep falls back to a null shipped par, every
           comparison is skipped, and the panel reports agreement having compared
           nothing. That is the bug this file already carries a guard for, and a
           typo in the `pars:` string here would put it straight back. */
        assert(game.levels && game.search && game.pars,
          `${game.id} is swept by par but names no level table, search or par table`);
        const mods = loadGame(game.id);
        assert(mods[game.levels], `${game.id} publishes no ${game.levels}`);
        assert(mods[game.search], `${game.id} publishes no ${game.search}`);
        assert(mods[game.pars], `${game.id} publishes no ${game.pars}`);
      }
    }
  });
});

describe('lab sweep', () => {
  /* The sweep is the reason the lab exists, so it is checked against the two
     games' real modules rather than against a fixture. If this passes, the
     numbers in the panel are the numbers the game would give. */
  it('reads a par curve out of a game and judges it', () => {
    const m = loadGame('measure');
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
    const c = loadGame('casks');
    const res = LabSweep.pars(
      { levels: c.CasksLevels, search: c.CasksSearch, pars: c.CasksPars }, 1, 10);
    equal(res.rows.filter(r => r.shipped != null).length, 10,
      'the shipped par was not read, so nothing was actually compared');
    equal(res.disagreements, [], 'the shipped table and the sweep disagree about a par');
    equal(res.drops, [], 'the shipped curve goes backwards');
  });

  /* The lab is the third thing measuring this game, after the survival tool and
     the difficulty test, and it cannot import the module those two share: it is
     a browser page and that is a node module. tools/bubble-run.mjs exists because
     two run loops disagreed about whether a row comes down after the final shot,
     which is a whole star's worth of difference. So the two loops are run over
     the same seeds and required to give the same answers, seed for seed. */
  it('plays a bubble run exactly the way the offline harness plays it', async () => {
    const { run: offline } = await import('../tools/bubble-run.mjs');
    const b = loadGame('bubble');
    const mods = { C: b.BubbleConfig, grid: b.BubbleGrid, shot: b.BubbleShot,
                   rules: b.BubbleRules, advice: b.BubbleAdvice, rng: b.BubbleRng };
    const opts = { every: b.BubbleConfig.ADVANCE_EVERY, length: b.BubbleConfig.RUN_SHOTS };

    for (const miss of [0, 0.3, 1]){
      for (let seed = 1; seed <= 25; seed++){
        equal(LabSweep.runOne(mods, seed, { ...opts, miss }), offline(seed, { ...opts, miss }),
          `seed ${seed} at miss ${miss} plays differently in the lab`);
      }
    }
  });

  it('reports the pass rates the thresholds were set from', async () => {
    const b = loadGame('bubble');
    const mods = { C: b.BubbleConfig, grid: b.BubbleGrid, shot: b.BubbleShot,
                   rules: b.BubbleRules, advice: b.BubbleAdvice, rng: b.BubbleRng };
    const { measure } = await import('../tools/bubble-run.mjs');
    const mine = LabSweep.survival(mods, 40, 0.3);
    const theirs = measure({ seeds: 40, miss: 0.3 });
    equal(mine.at, theirs.at, 'the lab and the harness disagree about the pass rates');
    equal(mine.median, theirs.median, 'and about the median run');
    assert(mine.forced > 0.2 && mine.forced < 0.9, `forced turns out of range: ${mine.forced}`);
  });

  /* An empty verdict is what success looks like AND what asking nothing looks
     like, so both directions are driven. */
  /* The panel matrix, as a gate rather than as a picture.

     The lab draws these 135 screens side by side, which is how a wrong one is
     spotted. This is how a wrong one FAILS: the enumeration is pure, so it runs
     in the unit suite in milliseconds against the game's own Panel, and a rescue
     offered where it cannot rescue, or a dead button with nothing saying why,
     stops a merge instead of waiting to be looked at.

     Reaching one of these by playing means losing a level a particular way with
     a particular purse against animated pours. Reaching all of them means doing
     that a hundred and thirty-five times. */
  it('decides every end-of-run panel the game can show, and none of them wrongly', () => {
    const g = loadPure();
    const res = LabSweep.panels({ panel: g.Panel, lastLevel: g.LAST_LEVEL });
    assert(res.rows.length > 100, `only ${res.rows.length} panels — the enumeration collapsed`);
    equal(res.faults, [], 'the end-of-run panel offers something it should not');
    /* and every row is a decision rather than a throw */
    equal(res.rows.filter(r => r.threw).map(r => `${r.ending}/${r.purse}: ${r.threw}`), []);
  });

  /* The check above passes on a clean tree, which is also what a check that
     asks nothing looks like. So one is planted: a panel that offers a next board
     past the end of the game is the plainest thing the matrix is for. */
  it('would catch a panel offering a board that is not there', () => {
    const g = loadPure();
    const bent = {
      BROKE: g.Panel.BROKE,
      decide: input => ({ ...g.Panel.decide(input), nextHidden: false })
    };
    const res = LabSweep.panels({ panel: bent, lastLevel: g.LAST_LEVEL });
    assert(res.faults.some(f => /past the end of the game/.test(f)),
      'a next board past the last level went unreported');
  });

  it('says when the bars have stopped separating playing from flailing', () => {
    const good = { at: { one: 0.98, two: 0.83, three: 0.46 } };
    const random = { at: { one: 0.19, two: 0, three: 0 } };
    assert(LabSweep.tracks(good, random), 'the shipped shape should track');
    assert(!LabSweep.tracks(good, { at: { one: 0.9, two: 0.6, three: 0.3 } }),
      'a bar a flailing player clears is not a bar');
    assert(!LabSweep.tracks({ at: { one: 0.4, two: 0.1, three: 0 } }, random),
      'a bar the player misses is not reachable');
  });
});
