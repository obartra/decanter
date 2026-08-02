/* What the lab knows about each game.

   This is the one file that names another game's internals, and it is allowed to
   because nothing here ships inside a game: the lab is a page that opens the
   real built pages in frames and reaches into them. Everywhere else in this
   repo, one game naming another is a lint error and should stay one.

   A knob is a config key, a range, and a sentence saying what it is for. The
   ranges are the point — a raw number input on `ADVANCE_EVERY` invites 0 and a
   board that comes down every shot, which teaches nothing except that the game
   can be broken. The bounds are where the setting is still the setting.

   `apply` is how a game is put back together after a knob moves. Most take a
   fresh board; the ones that change the shape of the world have to rebuild the
   derived values first, because those were computed once when the config was
   defined and do not recompute themselves.

   Every key here is checked against the real config by tests/lab.test.mjs, so a
   knob naming something that no longer exists fails rather than drawing a
   control that quietly does nothing. */
const LabConfig = {
  /* Order is the order the tabs appear in. */
  games: [
    {
      id: 'measure',
      title: 'The Measure',
      path: '../measure/',
      config: 'MeasureConfig',
      app: 'MeasureApp',
      /* how the lab asks this game for a board and a par it did not ship */
      levels: 'MeasureLevels',
      search: 'MeasureSearch',
      pars: 'MeasurePars',
      /* Par is exact and cheap here, so a sweep can solve every level in the
         range outright rather than sampling. */
      sweep: 'par',
      firstLevel: 1,
      knobs: [
        { key: 'CAP_MIN', min: 2, max: 12, step: 1,
          note: 'Smallest vessel a bench can be dealt.' },
        { key: 'CAP_MAX', min: 6, max: 40, step: 1,
          note: 'Largest. The difficulty lever: long pars live at the top of this range, and capping it at 16 held the measured curve down to par 12.' },
        { key: 'SEARCH_CAP', min: 1000, max: 400000, step: 1000,
          note: 'Positions the exhaustive search will walk before giving up. Lower it to see what an unrated bench looks like.' },
        { key: 'AID_CAP', min: 0, max: 3, step: 1,
          note: 'Most stars a run that used undo or a hint can still earn.' },
        { key: 'UNDO_DEPTH', min: 1, max: 200, step: 1,
          note: 'How many pours back the run remembers.' },
        { key: 'POUR_TIME', min: 0.05, max: 1.5, step: 0.05,
          note: 'Seconds for the wine to move. Feel only; the rules land the instant the pour is made.' },
        { key: 'GRADUATION_MAJOR', min: 2, max: 10, step: 1,
          note: 'Every nth etched line is a heavy one.' }
      ]
    },
    {
      id: 'casks',
      title: 'The Cellar Door',
      path: '../casks/',
      config: 'CasksConfig',
      app: 'CasksApp',
      levels: 'CasksLevels',
      search: 'CasksSearch',
      pars: 'CasksPars',
      sweep: 'par',
      firstLevel: 1,
      /* W, H and EXIT_ROW are deliberately not knobs. The sixty boards are a
         shipped table measured against a six by six floor, and shrinking the
         floor under them does not make a harder game, it makes a table of casks
         that are no longer on it. Changing the floor is a job for
         tools/casks-field.mjs, which would have to re-measure every board. */
      knobs: [
        { key: 'SEARCH_CAP', min: 1000, max: 400000, step: 1000,
          note: 'States the sweep will walk before giving up on a layout.' },
        { key: 'AID_CAP', min: 0, max: 3, step: 1,
          note: 'Most stars a run that leaned on something can still earn.' },
        { key: 'UNDO_DEPTH', min: 1, max: 200, step: 1,
          note: 'How many slides back the run remembers.' },
        { key: 'SLIDE_PER_CELL', min: 0.02, max: 0.5, step: 0.01,
          note: 'Seconds a cask takes per cell travelled.' },
        { key: 'SLIDE_MAX', min: 0.1, max: 2, step: 0.05,
          note: 'Ceiling on that, so a five cell shove is not five times as slow as a one cell one.' },
        { key: 'DRAG_OVERSHOOT', min: 0, max: 1, step: 0.05,
          note: 'How far past its stop a cask may be DRAWN under a finger. The state never goes there.' },
        { key: 'DRAG_SLOP', min: 0, max: 1, step: 0.05,
          note: 'How far a finger may wander before a tap is treated as a drag.' }
      ]
    },
    {
      id: 'bubble',
      title: 'Bubble',
      path: '../bubble/',
      config: 'BubbleConfig',
      app: 'BubbleApp',
      /* No par and no level table: this board is dealt at random, so there is
         nothing to solve and the sweep runs the shot-chooser instead and reports
         the spread. That is the same measurement tools/bubble-survival.mjs makes
         and the one STAR_SHOTS was set from.

         Which modules that takes, named HERE. They were hard-coded in the lab's
         app, which quietly made a second file that knows another game's
         internals — and the whole claim of this one is that it is the only one.
         A claim like that is worth either keeping or deleting, not leaving
         half-true. tests/lab.test.mjs checks every name in this list is real. */
      sweep: 'survival',
      survivalMods: {
        grid: 'BubbleGrid', shot: 'BubbleShot', rules: 'BubbleRules',
        advice: 'BubbleAdvice', score: 'BubbleScore', rng: 'BubbleRng'
      },
      firstLevel: 1,
      /* The world is derived from COLS and ROWS once, at the bottom of the
         config, so moving either has to put the walls and the muzzle back. */
      rederive: true,
      knobs: [
        { key: 'COLS', min: 5, max: 14, step: 1, reboot: true,
          note: 'Cells across. Every row holds the same number, both parities.' },
        { key: 'ROWS', min: 8, max: 24, step: 1, reboot: true,
          note: 'Cells down, including the launch band.' },
        { key: 'DEATH_ROW', min: 4, max: 22, step: 1, reboot: true,
          note: 'The row the board must not reach. A fixed index, never a pixel line.' },
        { key: 'MATCH_MIN', min: 2, max: 5, step: 1,
          note: 'How many of a colour have to touch before they come down.' },
        { key: 'COLOURS', min: 2, max: 6, step: 1,
          note: 'How many of the palette get dealt. Every one of them does, so this is also how many the shooter can hand you.' },
        { key: 'ADVANCE_EVERY', min: 3, max: 25, step: 1,
          note: 'Shots between the board coming down a row. The whole reason the death line is a threat rather than a decoration.' },
        { key: 'RAMP_EVERY', min: 5, max: 80, step: 1,
          note: 'One shot comes off that cadence every this many shots. It is what pulls the longest runs in far enough for a threshold to mean anything.' },
        { key: 'ADVANCE_MIN', min: 2, max: 12, step: 1,
          note: 'Floor the ramp descends to, not a cadence to play at: held flat, four already collapses the spread to 1.3x and the board wins whatever the player does.' },
        { key: 'SPEED', min: 5, max: 60, step: 1,
          note: 'Diameters a second. Feel only: the shot is resolved analytically at launch.' },
        { key: 'GUIDE_LEN', min: 0, max: 20, step: 1,
          note: 'How far the aim guide is drawn. Long enough and aiming stops being a judgement.' }
      ]
    }
  ]
};
globalThis.LabConfig = LabConfig;
