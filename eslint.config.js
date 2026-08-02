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
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/* Every game, found the way the build and the tests find them: a directory under
   src/ with a js/ of its own. Discovered rather than listed because this file
   used to need a hand-written block per game, and the failure mode was silent in
   the worst way — a game with no block falls through to the module defaults,
   every cross-module reference becomes `no-undef`, and lint fails describing
   three errors that are not errors. That is a note for whoever adds the next
   game, delivered at the moment it is least welcome. */
const gameDirs = readdirSync(join(root, 'src'), { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(root, 'src', d.name, 'js')))
  .map(d => d.name);

/* What a game publishes, read off the sources rather than repeated here, so the
   two cannot disagree. A module that stops publishing something stops declaring
   it in the same commit. */
function publishedBy(dir){
  const out = {};
  for (const f of readdirSync(join(root, dir)).filter(n => n.endsWith('.js'))){
    for (const m of readFileSync(join(root, dir, f), 'utf8').matchAll(/^globalThis\.(\w+)\s*=/gm)){
      out[m[1]] = 'writable';
    }
  }
  return out;
}

/* what each browser source publishes for the ones loaded after it */
const published = {
  CONFIG: 'writable', Trace: 'writable', RNG: 'writable', Rules: 'writable', Levels: 'writable',
  Diagnostics: 'writable',
  ORDER: 'writable', PARS: 'writable', Chapters: 'writable', LAST_LEVEL: 'writable', Progress: 'writable',
  Panel: 'writable', Preview: 'writable', Sound: 'writable', MapGeom: 'writable', MapView: 'writable',
  Backdrop: 'writable', Board: 'writable', Fluid: 'writable', Confetti: 'writable', Still: 'writable',
  SolverClient: 'writable', Jabari: 'writable', App: 'writable', Deferred: 'writable'
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

  /* One block per game, each seeing only its own globals. Separate blocks rather
     than one wide `files` covering them all, so a reference from one game to
     another is a lint error rather than something that happens to work because
     both were in scope. That is the rule this arrangement exists to enforce, and
     generating the blocks does not relax it: each game still gets exactly its
     own names and nothing else. */
  ...gameDirs.map(name => ({
    files: [`src/${name}/js/**/*.js`],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...publishedBy(`src/${name}/js`) }
    },
    rules: { ...shared, 'no-redeclare': 'off' }
  })),

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

  /* The service worker. Source only: the copy in dist/ is this file with three
     constants stamped in, and dist/** is ignored above, so listing it here
     matched nothing and said the config covered a build output it never saw. */
  {
    files: ['src/sw.js'],
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
