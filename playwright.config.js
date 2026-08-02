/* End to end, in a real browser.

   The unit suite covers everything that can be decided from numbers, which is
   most of the game. What it cannot reach is the part that only exists once a
   page is laid out and animating, and that is where this project's bugs have
   actually been: a hidden attribute overridden by a display rule, a row of
   bottles overflowing the canvas that draws their contents, a resize dropped
   while a pour was in the air, an end of run panel offering buttons for a run
   that had not happened.

   None of those are visible to a test that imports a module. All of them are
   visible to a browser. */
import { defineConfig, devices } from '@playwright/test';

/* Overridable, because the port is shared by anything else running this suite
   from another checkout of the same repo. A git worktree under .claude/worktrees
   is a second checkout, and with `reuseExistingServer` on it wins the port and
   every later run silently tests *its* build instead: the page loads, nothing
   errors, and assertions fail describing code that is not the code under test.
   That is expensive to diagnose and invisible while it happens.

   PW_PORT=8125 npx playwright test  runs against a server of your own. */
const PORT = Number(process.env.PW_PORT) || 8123;

export default defineConfig({
  testDir: 'tests/e2e',
  /* a pour takes about a second, and some specs play a whole level */
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  },
  /* Serves the built page, not the sources. The build is what ships, and the
     one bug class this cannot afford to miss is one the build introduces.

     It builds first, because dist/ is not committed: on a fresh clone there is
     nothing there to serve, and a suite that silently tested the last build
     anyone happened to run is worse than one that fails. */
  webServer: {
    command: `npm run build && npx --yes http-server dist -p ${PORT} -c-1 --silent`,
    url: `http://127.0.0.1:${PORT}`,
    /* Never reused, even locally.

       The command builds and then serves, so reusing a server that is already
       up means skipping the build: the suite runs against whatever bundle
       happened to be on disk when that server started. Nothing errors, the page
       loads, and assertions fail describing code that is not the code under
       test. That has now cost hours twice, once to a second checkout holding the
       port and once to a leftover server from an interrupted run.

       Not reusing makes a busy port an immediate, legible failure instead. Set
       PW_PORT to run two at once. */
    reuseExistingServer: false,
    timeout: 60_000
  },
  /* One engine, two shapes. The iPhone preset would pull in WebKit, which is a
     second browser to download for a suite whose subject is layout and game
     state rather than engine differences. Real Safari is worth adding when
     there is a reason to suspect it; until then this keeps CI to one install. */
  projects: [
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: false,
        hasTouch: true,
        deviceScaleFactor: 3
      }
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }
  ]
});
