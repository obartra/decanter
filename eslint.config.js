/* Lint rules, split by where the code actually runs.

   The game ships as plain scripts concatenated into one page, so its files are
   not modules and they share one global scope on purpose: each defines a
   `globalThis.Thing` that the next one reads. A linter that assumes modules
   calls every one of those an undefined variable, so the browser sources declare
   what they publish and what they expect to find.

   Nothing here ships. eslint is a dev dependency; the built page still has no
   dependencies at all, which a test checks. */
import js from '@eslint/js';
import globals from 'globals';

/* what each browser source publishes for the ones loaded after it */
const published = {
  CONFIG: 'writable', Trace: 'writable', RNG: 'writable', Rules: 'writable', Levels: 'writable',
  Diagnostics: 'writable',
  ORDER: 'writable', PARS: 'writable', Chapters: 'writable', LAST_LEVEL: 'writable', Progress: 'writable',
  Panel: 'writable', Sound: 'writable', MapGeom: 'writable', MapView: 'writable',
  Backdrop: 'writable', Board: 'writable', Fluid: 'writable', Confetti: 'writable',
  SolverClient: 'writable', Jabari: 'writable', App: 'writable'
};

const shared = {
  /* A catch binding nobody reads is how this codebase says "the fallback is the
     point", so an unused one is not a mistake. An unused variable still is. */
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
  'no-undef': 'error',
  /* an empty catch is how this codebase says "the fallback is the point", so it
     has to be deliberate rather than accidental */
  'no-empty': ['error', { allowEmptyCatch: true }],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
  'prefer-const': ['error', { destructuring: 'all' }],
  'no-implicit-globals': 'off',
  'no-console': 'off'
};

export default [
  /* `.claude/` holds tooling state, not project source, and `.claude/worktrees/`
     in particular holds whole checkouts of this repo. Without it here, having one
     open means linting a second copy of everything: the same files reported twice
     and, because a worktree carries a built `dist/` that the top-level ignore no
     longer matches at that depth, several hundred errors in generated code. Lint
     stops being runnable at all while a worktree exists. */
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', '.claude/**'] },

  /* first, so everything below can override it. Last, it silently puts back the
     rules the per-directory blocks turn off. */
  js.configs.recommended,

  /* the game: classic scripts sharing one global scope */
  {
    files: ['src/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      /* `BubbleApp` and nothing else. Some levels are the other game, so this
         one has to be able to deal a board and be told how the run went, but the
         coupling stops at that single object: no reaching past it into the
         bubble game's rules, grid or renderer. Anything else from over there is
         still a lint error, which is the point of listing one name rather than
         widening `files` to cover both directories. */
      globals: { ...globals.browser, ...published, BubbleApp: 'readonly' }
    },
    /* Each of these files declares the one thing it publishes and reads the ones
       published before it. The globals list above is for the reading; without
       turning this off it also complains about the declaring. */
    rules: { ...shared, 'no-redeclare': 'off' }
  },

  /* The bubble game. Its own globals map rather than a wider `files` on the
     block above, so a reference from one game to the other is a lint error
     rather than something that happens to work because both were in scope. */
  {
    files: ['src/bubble/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        BubbleConfig: 'writable', BubbleRng: 'writable', BubbleGrid: 'writable', BubbleShot: 'writable',
        BubbleRules: 'writable', BubbleView: 'writable', BubbleRender: 'writable',
        BubbleAudio: 'writable', BubbleAdvice: 'writable', BubbleScore: 'writable',
        BubbleApp: 'writable'
      }
    },
    rules: { ...shared, 'no-redeclare': 'off' }
  },

  /* the solver runs in a worker, and is written to survive being loaded as one */
  {
    files: ['src/worker/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.worker }
    },
    rules: { ...shared, 'no-var': 'off', 'prefer-const': 'off' }
  },

  /* the service worker */
  {
    files: ['src/sw.js', 'dist/sw.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: globals.serviceworker },
    rules: shared
  },

  /* tools and tests: real modules, running in node */
  {
    files: ['tools/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...published }
    },
    rules: shared
  },

  /* the end to end specs drive a browser from node, so they see both */
  {
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser, ...published }
    },
    rules: shared
  }
];
