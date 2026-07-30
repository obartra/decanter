# Decanter

A water sorting puzzle that runs entirely offline. Pour between bottles until
each one holds a single colour. No servers, no network calls, no analytics.
Fonts, icons, and the puzzle solver all ship with the app.


## Quick start

```sh
npm run check     # build, then run the tests
npm run serve     # build and serve dist/ at http://localhost:8080
npm run pars      # recompute the par table (only after changing levels or the solver)
```

Open the local address and use the Install button, or your browser's install
option, to add it to a home screen or dock.

## What is where

| Path | |
| --- | --- |
| `src/js/` | modules, concatenated in filename order. Under 50 is pure logic, above is browser code |
| `src/css/` | stylesheets, concatenated in filename order |
| `src/js/35-pars.js` | generated par table, committed. Never edit by hand |
| `assets/art/` | painted backdrops as WebP, one per view |
| `assets/fonts/` | Cinzel and Alegreya Sans, latin subsets, self-hosted |
| `src/worker/solver.js` | A\* search that computes each level's par |
| `tools/build.mjs` | the entire build, no bundler |
| `tools/pars.mjs` | solves every level offline and writes the par table |
| `tests/` | 76 tests, no dependencies |
| `dist/` | build output, committed so it can be deployed as is |

## Deploying

`dist/` is a static folder using only relative paths. Drop it on GitHub Pages,
Netlify, Cloudflare Pages, or any bucket, including a subdirectory.

`dist/decanter-standalone.html` is the same game as a single file with the fonts
inlined. It opens straight off disk but cannot install, since service workers
need HTTPS or localhost.

## Notes

- Levels are deterministic in their number, so level 12 is the same puzzle for
  everyone, and stars mean the same thing on every device.
- Par is the true minimum pour count, not an estimate. It is solved offline and
  shipped as a table, so a slow device and a fast one show the same number. See
  [docs/DESIGN.md](docs/DESIGN.md) for why that is trustworthy.
- Gold is deliberately thin. A vessel costs about three well-played new levels,
  and replaying a cleared one pays stars only, so a stockpile has to be earned on
  new boards. The numbers all live in `CONFIG.economy`.
- Bump nothing to release: the service worker's cache name is a hash of the
  built page, so a new build replaces the old cache on its own.

Design and implementation notes: [docs/DESIGN.md](docs/DESIGN.md)
